// What the screens call. Each action updates the local store immediately and queues the server work.

import { dirs, extensionOf, keepFile } from './files';
import { uuid } from './ids';
import { enqueue } from './machines/outbox';
import { markFresh, patchBook, rememberLocalMedia, upsertBook, upsertEntry } from './store';
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

export function addTextEntry(bookId: string, text: string, prompt: string | null): Promise<void> {
  return traced('action.addTextEntry', { bookId, chars: text.length, prompt }, () => addTextEntryInner(bookId, text, prompt));
}

async function addTextEntryInner(bookId: string, text: string, prompt: string | null): Promise<void> {
  const entry: Entry = {
    id: uuid(),
    book_id: bookId,
    created_at: new Date().toISOString(),
    kind: 'text',
    text,
    prompt,
    media_path: null,
    duration_ms: null,
    transcript: null,
    transcript_status: 'none',
    pending: true,
  };
  markFresh(entry.id);
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
    prompt: null,
    media_path,
    duration_ms: null,
    transcript: null,
    transcript_status: 'none',
    pending: true,
  };
  markFresh(entry.id);
  upsertEntry(entry);
  enqueue({ id: uuid(), kind: 'entry', entry, mediaLocalUri: local, attempts: 0 });
}

export function addDrawingEntry(bookId: string, pngUri: string, prompt: string | null): Promise<void> {
  return traced('action.addDrawingEntry', { bookId, prompt }, () => addDrawingEntryInner(bookId, pngUri, prompt));
}

async function addDrawingEntryInner(bookId: string, pngUri: string, prompt: string | null): Promise<void> {
  const id = uuid();
  const media_path = `${bookId}/${id}.png`;
  const local = await keepFile(pngUri, dirs.media(), `drawing_${id}.png`);
  rememberLocalMedia(media_path, local);
  const entry: Entry = {
    id,
    book_id: bookId,
    created_at: new Date().toISOString(),
    kind: 'drawing',
    text: null,
    prompt,
    media_path,
    duration_ms: null,
    transcript: null,
    transcript_status: 'none',
    pending: true,
  };
  markFresh(entry.id);
  upsertEntry(entry);
  enqueue({ id: uuid(), kind: 'entry', entry, mediaLocalUri: local, attempts: 0 });
}

/** A drawing becomes the cover of a book that has none. Covers are never replaced once set. */
export function setDrawnCover(bookId: string, pngUri: string): Promise<void> {
  return traced('action.setDrawnCover', { bookId }, async () => {
    const cover_path = `${bookId}.png`;
    const local = await keepFile(pngUri, dirs.media(), `cover_${bookId}.png`);
    rememberLocalMedia(cover_path, local);
    patchBook(bookId, { cover_path });
    enqueue({ id: uuid(), kind: 'cover', bookId, coverPath: cover_path, coverLocalUri: local, attempts: 0 });
  });
}

export function addAudioEntry(
  bookId: string,
  audioUri: string,
  durationMs: number,
  prompt: string | null,
  createdAt?: string,
): Promise<void> {
  return traced('action.addAudioEntry', { bookId, durationMs, prompt, recovered: !!createdAt }, () =>
    addAudioEntryInner(bookId, audioUri, durationMs, prompt, createdAt),
  );
}

async function addAudioEntryInner(
  bookId: string,
  audioUri: string,
  durationMs: number,
  prompt: string | null,
  createdAt?: string,
): Promise<void> {
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
    prompt,
    media_path,
    duration_ms: durationMs,
    transcript: null,
    transcript_status: 'pending',
    pending: true,
  };
  if (!createdAt) markFresh(entry.id);
  upsertEntry(entry);
  enqueue({ id: uuid(), kind: 'entry', entry, mediaLocalUri: local, attempts: 0 });
}
