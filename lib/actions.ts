// What the screens call. Each action updates the local store immediately and queues the server work.

import { dirs, extensionOf, keepFile } from './files';
import { uuid } from './ids';
import { enqueue } from './outbox';
import { patchBook, rememberLocalMedia, upsertBook, upsertEntry } from './store';
import type { Book, Entry } from './types';

export async function addBook(input: { title: string; author: string | null; coverUri: string | null }): Promise<Book> {
  const id = uuid();
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
  await enqueue({ id: uuid(), kind: 'book', book, coverLocalUri, attempts: 0 });
  return book;
}

export async function rateBook(bookId: string, rating: number): Promise<void> {
  patchBook(bookId, { rating });
  await enqueue({ id: uuid(), kind: 'rating', bookId, rating, attempts: 0 });
}

export async function addTextEntry(bookId: string, text: string): Promise<void> {
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
  await enqueue({ id: uuid(), kind: 'entry', entry, mediaLocalUri: null, attempts: 0 });
}

export async function addPhotoEntry(bookId: string, photoUri: string): Promise<void> {
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
  await enqueue({ id: uuid(), kind: 'entry', entry, mediaLocalUri: local, attempts: 0 });
}

export async function addAudioEntry(bookId: string, audioUri: string, durationMs: number, createdAt?: string): Promise<void> {
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
  await enqueue({ id: uuid(), kind: 'entry', entry, mediaLocalUri: local, attempts: 0 });
}
