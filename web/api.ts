// Everything the page knows about the server: the feed function (one URL, four POST bodies) and
// what this browser remembers, the link's token and the pass a correct PIN earned. No Supabase key
// ever reaches the page; the function signs every image and sound URL for six hours.

import { crumb } from './telemetry';

// The dev server (npm run web) answers /__feed itself from web/fixture.json; the built page talks
// to the real function. The URL is baked in by web/vite.config.mts from the committed .env.
const FEED_URL: string = import.meta.env.DEV ? '/__feed' : __FEED_URL__;

export type Book = {
  id: string;
  created_at: string;
  title: string;
  author: string | null;
  rating: number | null;
  cover_url: string | null;
  complete: boolean;
};

export type EntryKind = 'text' | 'audio' | 'photo' | 'drawing';

export type Entry = {
  id: string;
  book_id: string;
  created_at: string;
  kind: EntryKind;
  text: string | null;
  prompt: string | null;
  media_url: string | null;
  duration_ms: number | null;
  transcript: string | null;
  transcript_status: 'none' | 'pending' | 'done' | 'failed';
};

export type Stats = { books: number; rainbow: number; audio: number; text: number; photo: number; drawing: number };
export type LibraryAnswer = { books: Book[]; stats: Stats };
export type BookAnswer = { book: Book; entries: Entry[] };

export class FeedError extends Error {
  constructor(
    public status: number,
    public body: Record<string, unknown>,
  ) {
    super(`feed ${status}`);
    this.name = 'FeedError';
  }
}

// ---- what the browser remembers --------------------------------------------------------------------

const TOKEN_KEY = 'bokklubb.token';
const PASS_KEY = 'bokklubb.pass';
const EXPIRES_KEY = 'bokklubb.pass.expires';

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Private mode or storage off: the page still works until it is closed.
  }
}

export const getToken = () => read(TOKEN_KEY);
export const rememberToken = (token: string) => write(TOKEN_KEY, token);

/** The pass, if the browser has one that has not expired. */
export function getPass(): string | null {
  const pass = read(PASS_KEY);
  const expires = Number(read(EXPIRES_KEY) ?? 0);
  if (!pass || !expires || expires < Date.now()) return null;
  return pass;
}
export function clearPass() {
  write(PASS_KEY, null);
  write(EXPIRES_KEY, null);
}

// ---- the function ----------------------------------------------------------------------------------

async function post(body: Record<string, unknown>, kind: string): Promise<{ status: number; data: Record<string, unknown> }> {
  const t0 = Date.now();
  let res: Response;
  try {
    res = await fetch(FEED_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (err) {
    crumb('fetch.fail', { kind, ms: Date.now() - t0 });
    throw err;
  }
  let data: Record<string, unknown> = {};
  if (res.status !== 204) {
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      data = {};
    }
  }
  crumb('fetch', { kind, status: res.status, ms: Date.now() - t0 });
  return { status: res.status, data };
}

export type LoginResult = { ok: true } | { ok: false; lockedUntil: string | null };

/** The link's token and the PIN for a pass, kept for a year. */
export async function login(token: string, pin: string): Promise<LoginResult> {
  const { status, data } = await post({ token, pin }, 'login');
  if (status === 200 && typeof data.pass === 'string' && typeof data.expiresAt === 'string') {
    write(PASS_KEY, data.pass);
    write(EXPIRES_KEY, String(new Date(data.expiresAt).getTime()));
    return { ok: true };
  }
  if (status === 401) return { ok: false, lockedUntil: typeof data.lockedUntil === 'string' ? data.lockedUntil : null };
  throw new FeedError(status, data);
}

async function screen<T>(body: Record<string, unknown>, kind: string): Promise<T> {
  const pass = getPass();
  if (!pass) throw new FeedError(401, {});
  const { status, data } = await post({ pass, ...body }, kind);
  if (status === 401) {
    clearPass();
    throw new FeedError(401, data);
  }
  if (status !== 200) throw new FeedError(status, data);
  return data as T;
}

export const fetchLibrary = () => screen<LibraryAnswer>({ screen: 'library' }, 'library');
export const fetchBook = (id: string) => screen<BookAnswer>({ screen: 'book', id }, 'book');

/** An error for the app_events table. Needs a pass; without one the page has nobody to tell. */
export async function report(error: Record<string, unknown>): Promise<void> {
  const pass = getPass();
  if (!pass) return;
  await fetch(FEED_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pass, error }), keepalive: true });
}
