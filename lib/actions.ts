// What the screens call. Each action updates the local store immediately and queues the server work.

import { dirs, extensionOf, keepFile } from './files';
import { uuid } from './ids';
import { enqueue } from './machines/outbox';
import { patchBook, rememberLocalMedia, upsertBook, upsertEntry } from './store';
import { traced } from './telemetry';
import type { Book, Entry } from './types';

export function addBook(input: { title: string; author: string | null; coverUri: string | null }): Promise<Book> {
  const id = uuid();
  return traced('action.addBook', { id, title: input.title, hasCover: !!input.coverUri }, () => addBookInner(id, input));
}

async function addBookInner(id: string, input: { title: string; author: string | null; coverUri: string | null }): Promise<Book> {
  let cover_path: string | null = null;
  let coverLocalUri: string | null = null;
  if (input.coverUri) {
    const ext = extensionOf(input.coverUri, 'jpg');
    cover_path = `${id}.${ext}`;
    coverLocalUri = await keepFile(input.coverUri, dirs.media(), `cover_${id}.${ext}`);
    rememberLocalMedia(cover_path, coverLocalUri);
  }
  const book: Book = {
    id,
    created_at: new Date().toISOString(),
    title: input.title,
    author: input.author,
    cover_path,
    rating: null,
    pending: true,
  };
  upsertBook(book);
  enqueue({ id: uuid(), kind: 'book', book, coverLocalUri, attempts: 0 });
  return book;
}

export function rateBook(bookId: string, rating: number): Promise<void> {
  return traced('action.rateBook', { bookId, rating }, async () => {
    patchBook(bookId, { rating });
    enqueue({ id: uuid(), kind: 'rating', bookId, rating, attempts: 0 });
  });
}

export function addTextEntry(bookId: string, text: string): Promise<void> {
  return traced('action.addTextEntry', { bookId, chars: text.length }, () => addTextEntryInner(bookId, text));
}

async function addTextEntryInner(bookId: string, text: string): Promise<void> {
  const entry: Entry = {
    id: uuid(),
    book_id: bookId,
    created_at: new Date().toISOString(),
    kind: 'text',
    text,
    media_path: null,
    duration_ms: null,
    transcript: null,
    transcript_status: 'none',
    pending: true,
  };
  upsertEntry(entry);
  enqueue({ id: uuid(), kind: 'entry', entry, mediaLocalUri: null, attempts: 0 });
}

export function addPhotoEntry(bookId: string, photoUri: string): Promise<void> {
  return traced('action.addPhotoEntry', { bookId }, () => addPhotoEntryInner(bookId, photoUri));
}

async function addPhotoEntryInner(bookId: string, photoUri: string): Promise<void> {
  const id = uuid();
  const ext = extensionOf(photoUri, 'jpg');
  const media_path = `${bookId}/${id}.${ext}`;
  const local = await keepFile(photoUri, dirs.media(), `photo_${id}.${ext}`);
  rememberLocalMedia(media_path, local);
  const entry: Entry = {
    id,
    book_id: bookId,
    created_at: new Date().toISOString(),
    kind: 'photo',
    text: null,
    media_path,
    duration_ms: null,
    transcript: null,
    transcript_status: 'none',
    pending: true,
  };
  upsertEntry(entry);
  enqueue({ id: uuid(), kind: 'entry', entry, mediaLocalUri: local, attempts: 0 });
}

export function addAudioEntry(bookId: string, audioUri: string, durationMs: number, createdAt?: string): Promise<void> {
  return traced('action.addAudioEntry', { bookId, durationMs, recovered: !!createdAt }, () =>
    addAudioEntryInner(bookId, audioUri, durationMs, createdAt),
  );
}

async function addAudioEntryInner(bookId: string, audioUri: string, durationMs: number, createdAt?: string): Promise<void> {
  const id = uuid();
  const ext = extensionOf(audioUri, 'm4a');
  const media_path = `${bookId}/${id}.${ext}`;
  const local = await keepFile(audioUri, dirs.media(), `audio_${id}.${ext}`);
  rememberLocalMedia(media_path, local);
  const entry: Entry = {
    id,
    book_id: bookId,
    created_at: createdAt ?? new Date().toISOString(),
    kind: 'audio',
    text: null,
    media_path,
    duration_ms: durationMs,
    transcript: null,
    transcript_status: 'pending',
    pending: true,
  };
  upsertEntry(entry);
  enqueue({ id: uuid(), kind: 'entry', entry, mediaLocalUri: local, attempts: 0 });
}
