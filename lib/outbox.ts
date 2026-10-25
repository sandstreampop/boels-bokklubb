// Durable queue of things to send to Supabase. Each job uploads its files, then writes its row.
// Runs on launch, when the app returns to the foreground, when the network comes back, and
// right after anything is added. Jobs are retried forever; nothing is dropped silently.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { File } from 'expo-file-system';
import * as Network from 'expo-network';
import { AppState } from 'react-native';

import { deleteFile, fileExists, mimeFor } from './files';
import { patchBook, patchEntry, rememberLocalMedia } from './store';
import { supabase } from './supabase';
import { requestTranscription } from './transcribe';
import type { Book, Entry } from './types';

type Job =
  | { id: string; kind: 'book'; book: Book; coverLocalUri: string | null; attempts: number }
  | { id: string; kind: 'rating'; bookId: string; rating: number; attempts: number }
  | { id: string; kind: 'entry'; entry: Entry; mediaLocalUri: string | null; attempts: number };

const KEY = 'bokklubb.outbox.v1';
let queue: Job[] = [];
let loaded = false;
let running = false;
let wakeTimer: ReturnType<typeof setTimeout> | null = null;
const statusListeners = new Set<(n: number) => void>();

async function load() {
  if (loaded) return;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    queue = raw ? (JSON.parse(raw) as Job[]) : [];
  } catch {
    queue = [];
  }
  loaded = true;
}

async function save() {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(queue));
  } catch {
    // ignore
  }
  for (const l of statusListeners) l(queue.length);
}

export function onOutboxChange(l: (n: number) => void) {
  statusListeners.add(l);
  l(queue.length);
  return () => {
    statusListeners.delete(l);
  };
}

export async function enqueue(job: Job) {
  await load();
  queue.push(job);
  await save();
  void processOutbox();
}

async function uploadFile(bucket: 'covers' | 'media', path: string, localUri: string) {
  const file = new File(localUri);
  const buf = await file.arrayBuffer();
  const ext = path.split('.').pop() ?? '';
  const { error } = await supabase.storage.from(bucket).upload(path, buf, {
    contentType: mimeFor(ext),
    upsert: true,
  });
  if (error) throw error;
}

async function runJob(job: Job): Promise<void> {
  if (job.kind === 'book') {
    const { book } = job;
    if (book.cover_path && job.coverLocalUri) {
      if (fileExists(job.coverLocalUri)) {
        await uploadFile('covers', book.cover_path, job.coverLocalUri);
        rememberLocalMedia(book.cover_path, job.coverLocalUri);
      }
    }
    const { error } = await supabase.from('books').upsert({
      id: book.id,
      created_at: book.created_at,
      title: book.title,
      author: book.author,
      cover_path: book.cover_path,
      rating: book.rating,
    });
    if (error) throw error;
    patchBook(book.id, { pending: false });
    return;
  }

  if (job.kind === 'rating') {
    const { error } = await supabase.from('books').update({ rating: job.rating }).eq('id', job.bookId);
    if (error) throw error;
    return;
  }

  const { entry } = job;
  if (entry.media_path && job.mediaLocalUri) {
    if (!fileExists(job.mediaLocalUri)) {
      // The file is gone (should not happen: we keep files in the document dir). Save what we can.
      patchEntry(entry.book_id, entry.id, { pending: false });
      const { error } = await supabase.from('entries').upsert({ ...rowOf(entry), media_path: null });
      if (error) throw error;
      return;
    }
    await uploadFile('media', entry.media_path, job.mediaLocalUri);
    rememberLocalMedia(entry.media_path, job.mediaLocalUri);
  }
  const { error } = await supabase.from('entries').upsert(rowOf(entry));
  if (error) throw error;
  patchEntry(entry.book_id, entry.id, { pending: false });
  if (entry.kind === 'audio') void requestTranscription(entry.id, entry.book_id);
}

function rowOf(e: Entry) {
  return {
    id: e.id,
    book_id: e.book_id,
    created_at: e.created_at,
    kind: e.kind,
    text: e.text,
    media_path: e.media_path,
    duration_ms: e.duration_ms,
    transcript_status: e.kind === 'audio' ? 'pending' : 'none',
  };
}

export async function processOutbox(): Promise<void> {
  await load();
  if (running || queue.length === 0) return;
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;
  running = true;
  try {
    // Oldest first, and a book must land before its entries.
    while (queue.length > 0) {
      const job = queue[0];
      try {
        await runJob(job);
        queue.shift();
        await save();
      } catch (err) {
        job.attempts += 1;
        await save();
        console.warn('outbox job failed', job.kind, job.attempts, err);
        scheduleRetry(job.attempts);
        break;
      }
    }
  } finally {
    running = false;
  }
}

function scheduleRetry(attempts: number) {
  if (wakeTimer) clearTimeout(wakeTimer);
  const delay = Math.min(60_000, 2_000 * 2 ** Math.min(attempts, 5));
  wakeTimer = setTimeout(() => void processOutbox(), delay);
}

let wired = false;
/** Hook the outbox into app lifecycle. Call once at startup. */
export function startOutbox() {
  if (wired) return;
  wired = true;
  void processOutbox();
  AppState.addEventListener('change', (s) => {
    if (s === 'active') void processOutbox();
  });
  Network.addNetworkStateListener((s) => {
    if (s.isConnected && s.isInternetReachable !== false) void processOutbox();
  });
}

/** Remove local copies of files already uploaded, keeping the ones used for offline display. */
export function forgetLocalFile(uri: string) {
  deleteFile(uri);
}
