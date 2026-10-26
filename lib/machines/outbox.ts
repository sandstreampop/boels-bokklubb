// Durable queue of things to send to Supabase, as a state machine. Each job uploads its files, then
// writes its row. Jobs are retried forever with backoff; nothing is dropped silently.
//
//   loading ──▶ idle ──(queue has work)──▶ running ──ok──▶ idle
//                ▲                           │
//                │                           ├──no session──▶ waitingForSession ──SESSION──▶ idle
//                └──────after retry delay────┴──error────────▶ backoff ──WAKE──────────────▶ idle
//
// ENQUEUE is accepted in every state. WAKE (app active, network back, signed in) retries at once.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { File } from 'expo-file-system';
import * as Network from 'expo-network';
import { AppState } from 'react-native';
import { assign, createActor, fromPromise, setup } from 'xstate';

import { inspect } from './inspect';
import { features } from '@/lib/features';
import { fileExists, mimeFor, rebase } from '@/lib/files';
import { patchBook, patchEntry, rememberLocalMedia } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import { captureError, debug, info, warn } from '@/lib/telemetry';
import { requestTranscription } from '@/lib/transcribe';
import type { Book, Entry } from '@/lib/types';

export type Job =
  | { id: string; kind: 'book'; book: Book; coverLocalUri: string | null; attempts: number }
  | { id: string; kind: 'rating'; bookId: string; rating: number; attempts: number }
  | { id: string; kind: 'cover'; bookId: string; coverPath: string; coverLocalUri: string; attempts: number }
  | { id: string; kind: 'entry'; entry: Entry; mediaLocalUri: string | null; attempts: number };

const KEY = 'bokklubb.outbox.v1';

class NoSession extends Error {
  constructor() {
    super('no session');
    this.name = 'NoSession';
  }
}

// ---- the work --------------------------------------------------------------------------------------

async function uploadFile(bucket: 'covers' | 'media', path: string, localUri: string) {
  const file = new File(rebase(localUri));
  const buf = await file.arrayBuffer();
  const ext = path.split('.').pop() ?? '';
  const t0 = Date.now();
  const { error } = await supabase.storage.from(bucket).upload(path, buf, { contentType: mimeFor(ext), upsert: true });
  if (error) throw error;
  info('outbox.upload.ok', { bucket, path, bytes: buf.byteLength, ms: Date.now() - t0 });
}

function rowOf(e: Entry) {
  return {
    id: e.id,
    book_id: e.book_id,
    created_at: e.created_at,
    kind: e.kind,
    text: e.text,
    prompt: e.prompt,
    media_path: e.media_path,
    duration_ms: e.duration_ms,
    // With transcription off (lib/features.ts) a recording is stored as 'none', whatever the entry carried.
    transcript_status: e.kind === 'audio' && features.transcription ? 'pending' : 'none',
  };
}

async function runJob(job: Job): Promise<void> {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new NoSession();

  if (job.kind === 'book') {
    const { book } = job;
    if (book.cover_path && job.coverLocalUri) {
      if (fileExists(job.coverLocalUri)) {
        await uploadFile('covers', book.cover_path, job.coverLocalUri);
        rememberLocalMedia(book.cover_path, job.coverLocalUri);
      } else {
        warn('outbox.cover.missing', { bookId: book.id, uri: job.coverLocalUri });
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

  if (job.kind === 'cover') {
    if (!fileExists(job.coverLocalUri)) {
      warn('outbox.cover.missing', { bookId: job.bookId, uri: job.coverLocalUri });
      return;
    }
    await uploadFile('covers', job.coverPath, job.coverLocalUri);
    rememberLocalMedia(job.coverPath, job.coverLocalUri);
    const { error } = await supabase.from('books').update({ cover_path: job.coverPath }).eq('id', job.bookId);
    if (error) throw error;
    return;
  }

  const { entry } = job;
  if (entry.media_path && job.mediaLocalUri) {
    if (!fileExists(job.mediaLocalUri)) {
      // The file is gone (should not happen: we keep files in the document dir). Save what we can.
      warn('outbox.media.missing', { entryId: entry.id, uri: job.mediaLocalUri });
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
  if (entry.kind === 'audio' && features.transcription) void requestTranscription(entry.id, entry.book_id);
}

// ---- the machine -----------------------------------------------------------------------------------

type Context = { queue: Job[] };
type Events = { type: 'ENQUEUE'; job: Job } | { type: 'WAKE' } | { type: 'SESSION' };

export const outboxMachine = setup({
  types: { context: {} as Context, events: {} as Events },
  actors: {
    load: fromPromise(async (): Promise<Job[]> => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        return raw ? (JSON.parse(raw) as Job[]) : [];
      } catch (err) {
        captureError('outbox.load', err);
        return [];
      }
    }),
    run: fromPromise(async ({ input }: { input: { job: Job } }) => {
      const t0 = Date.now();
      await runJob(input.job);
      return Date.now() - t0;
    }),
  },
  actions: {
    push: assign({ queue: ({ context, event }) => (event.type === 'ENQUEUE' ? [...context.queue, event.job] : context.queue) }),
    persist: ({ context }) => {
      AsyncStorage.setItem(KEY, JSON.stringify(context.queue)).catch((err) => captureError('outbox.save', err, { jobs: context.queue.length }));
    },
  },
  guards: {
    hasWork: ({ context }) => context.queue.length > 0,
    noSession: ({ event }) => 'error' in event && event.error instanceof NoSession,
  },
  delays: {
    retry: ({ context }) => Math.min(60_000, 2_000 * 2 ** Math.min(context.queue[0]?.attempts ?? 0, 5)),
  },
}).createMachine({
  id: 'outbox',
  context: { queue: [] },
  initial: 'loading',
  on: {
    ENQUEUE: { actions: ['push', 'persist'] },
  },
  states: {
    loading: {
      invoke: {
        src: 'load',
        onDone: {
          target: 'idle',
          actions: [
            assign({ queue: ({ context, event }) => [...event.output, ...context.queue] }),
            ({ context }) => {
              if (context.queue.length) info('outbox.loaded', { jobs: context.queue.length, kinds: context.queue.map((j) => j.kind) });
            },
          ],
        },
      },
    },
    idle: {
      always: { guard: 'hasWork', target: 'running' },
      on: {
        ENQUEUE: { target: 'running', actions: ['push', 'persist'] },
        WAKE: { target: 'idle', reenter: true },
      },
    },
    running: {
      invoke: {
        src: 'run',
        input: ({ context }) => ({ job: context.queue[0] }),
        onDone: {
          target: 'idle',
          actions: [
            ({ context, event }) => {
              const job = context.queue[0];
              info('outbox.job.ok', { kind: job.kind, id: job.id, attempts: job.attempts, ms: event.output, left: context.queue.length - 1 });
            },
            assign({ queue: ({ context }) => context.queue.slice(1) }),
            'persist',
          ],
        },
        onError: [
          {
            guard: 'noSession',
            target: 'waitingForSession',
            actions: ({ context }) => debug('outbox.skip', { reason: 'no session', jobs: context.queue.length }),
          },
          {
            target: 'backoff',
            actions: [
              assign({ queue: ({ context }) => [{ ...context.queue[0], attempts: context.queue[0].attempts + 1 }, ...context.queue.slice(1)] }),
              ({ context, event }) => {
                const job = context.queue[0];
                captureError('outbox.job', event.error, { kind: job.kind, id: job.id, attempts: job.attempts }, job.attempts >= 3 ? 'error' : 'warn');
              },
              'persist',
            ],
          },
        ],
      },
    },
    backoff: {
      after: { retry: 'idle' },
      on: { WAKE: 'idle', SESSION: 'idle' },
    },
    waitingForSession: {
      on: { SESSION: 'idle', WAKE: 'idle' },
    },
  },
});

// ---- the one running instance ----------------------------------------------------------------------

export const outbox = createActor(outboxMachine, { inspect });

let wired = false;
/** Start the queue and hook it into the app lifecycle. Call once when signed in; safe to repeat. */
export function startOutbox() {
  if (wired) return;
  wired = true;
  outbox.start();
  AppState.addEventListener('change', (s) => {
    if (s === 'active') outbox.send({ type: 'WAKE' });
  });
  Network.addNetworkStateListener((s) => {
    debug('network.change', { connected: s.isConnected, reachable: s.isInternetReachable, type: s.type });
    if (s.isConnected && s.isInternetReachable !== false) outbox.send({ type: 'WAKE' });
  });
}

export function enqueue(job: Job) {
  if (!wired) startOutbox();
  outbox.send({ type: 'ENQUEUE', job });
}

/** Signed in, back online or back in the foreground: try now instead of waiting for the backoff. */
export function wakeOutbox() {
  if (!wired) return;
  outbox.send({ type: 'SESSION' });
  outbox.send({ type: 'WAKE' });
}
