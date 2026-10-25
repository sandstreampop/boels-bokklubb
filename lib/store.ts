// Local-first state. Everything the screens render comes from here; the server is synced in the
// background by outbox.ts. Cached to AsyncStorage so the library opens instantly and works offline.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

import type { Book, Entry } from './types';

type State = {
  books: Book[];
  entries: Record<string, Entry[]>; // by book id, newest first
  /** media_path -> local file uri for files this device created or downloaded */
  localMedia: Record<string, string>;
  loaded: boolean;
};

const KEY = 'bokklubb.state.v1';

let state: State = { books: [], entries: {}, localMedia: {}, loaded: false };
const listeners = new Set<() => void>();
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function emit() {
  for (const l of listeners) l();
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(persist, 150);
}

async function persist() {
  try {
    const { loaded: _loaded, ...rest } = state;
    await AsyncStorage.setItem(KEY, JSON.stringify(rest));
  } catch {
    // Storage full or unavailable; in-memory state still works.
  }
}

export async function loadState(): Promise<void> {
  if (state.loaded) return;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<State>;
      state = {
        books: parsed.books ?? [],
        entries: parsed.entries ?? {},
        localMedia: parsed.localMedia ?? {},
        loaded: true,
      };
    } else {
      state = { ...state, loaded: true };
    }
  } catch {
    state = { ...state, loaded: true };
  }
  for (const l of listeners) l();
}

export function getState(): State {
  return state;
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(state));
}

export const sortBooks = (books: Book[]) =>
  [...books].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

export const sortEntries = (entries: Entry[]) =>
  [...entries].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

// ---- mutations -------------------------------------------------------------------------------

export function upsertBook(book: Book) {
  const others = state.books.filter((b) => b.id !== book.id);
  state = { ...state, books: sortBooks([...others, book]) };
  emit();
}

export function patchBook(id: string, patch: Partial<Book>) {
  state = { ...state, books: state.books.map((b) => (b.id === id ? { ...b, ...patch } : b)) };
  emit();
}

export function upsertEntry(entry: Entry) {
  const list = state.entries[entry.book_id] ?? [];
  const others = list.filter((e) => e.id !== entry.id);
  state = { ...state, entries: { ...state.entries, [entry.book_id]: sortEntries([...others, entry]) } };
  emit();
}

export function patchEntry(bookId: string, id: string, patch: Partial<Entry>) {
  const list = state.entries[bookId] ?? [];
  state = {
    ...state,
    entries: { ...state.entries, [bookId]: list.map((e) => (e.id === id ? { ...e, ...patch } : e)) },
  };
  emit();
}

export function rememberLocalMedia(mediaPath: string, localUri: string) {
  state = { ...state, localMedia: { ...state.localMedia, [mediaPath]: localUri } };
  emit();
}

/** Replace server-backed rows while keeping anything still pending upload. */
export function mergeBooksFromServer(rows: Book[]) {
  const pending = state.books.filter((b) => b.pending && !rows.some((r) => r.id === b.id));
  state = { ...state, books: sortBooks([...rows.map((r) => ({ ...r, pending: false })), ...pending]) };
  emit();
}

export function mergeEntriesFromServer(bookId: string, rows: Entry[]) {
  const current = state.entries[bookId] ?? [];
  const pending = current.filter((e) => e.pending && !rows.some((r) => r.id === e.id));
  state = {
    ...state,
    entries: { ...state.entries, [bookId]: sortEntries([...rows.map((r) => ({ ...r, pending: false })), ...pending]) },
  };
  emit();
}

export function clearAll() {
  state = { books: [], entries: {}, localMedia: {}, loaded: true };
  emit();
}
