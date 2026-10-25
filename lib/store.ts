// Local-first state, built on @xstate/store. Everything the screens render comes from here; the
// server is synced in the background by machines/outbox.ts and sync.ts. Cached to AsyncStorage so
// the library opens instantly and works offline.
//
// Why a store library and not hand-rolled useSyncExternalStore: the selector hook here caches the
// selection per snapshot, so a selector that returns a fresh value (`?? []`) can never put React in
// a render loop. That exact bug crashed build 1 on every book without entries.

import { useSelector } from '@xstate/react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createStore } from '@xstate/store';

import { captureError, info } from './telemetry';
import type { Book, Entry, PromptPool } from './types';

export type StoreContext = {
  books: Book[];
  /** by book id, newest first */
  entries: Record<string, Entry[]>;
  /** media_path -> local file uri for files this device created or downloaded */
  localMedia: Record<string, string>;
  /** Index of the prompt shown last, per pool, so the next pick is never the same one. */
  lastPrompt: Partial<Record<PromptPool, number>>;
  loaded: boolean;
};

const KEY = 'bokklubb.state.v1';

export const sortBooks = (books: Book[]) => [...books].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
export const sortEntries = (entries: Entry[]) => [...entries].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

/** Stable empty list for selectors, so "no entries yet" never allocates. */
export const NO_ENTRIES: Entry[] = [];

export const store = createStore({
  context: { books: [], entries: {}, localMedia: {}, lastPrompt: {}, loaded: false } as StoreContext,
  on: {
    hydrate: (
      ctx,
      e: { books: Book[]; entries: Record<string, Entry[]>; localMedia: Record<string, string>; lastPrompt: Partial<Record<PromptPool, number>> },
    ) => ({
      ...ctx,
      books: e.books,
      entries: e.entries,
      localMedia: e.localMedia,
      lastPrompt: e.lastPrompt,
      loaded: true,
    }),
    upsertBook: (ctx, e: { book: Book }) => ({
      ...ctx,
      books: sortBooks([...ctx.books.filter((b) => b.id !== e.book.id), e.book]),
    }),
    patchBook: (ctx, e: { id: string; patch: Partial<Book> }) => ({
      ...ctx,
      books: ctx.books.map((b) => (b.id === e.id ? { ...b, ...e.patch } : b)),
    }),
    upsertEntry: (ctx, e: { entry: Entry }) => {
      const list = ctx.entries[e.entry.book_id] ?? NO_ENTRIES;
      const others = list.filter((x) => x.id !== e.entry.id);
      return { ...ctx, entries: { ...ctx.entries, [e.entry.book_id]: sortEntries([...others, e.entry]) } };
    },
    patchEntry: (ctx, e: { bookId: string; id: string; patch: Partial<Entry> }) => {
      const list = ctx.entries[e.bookId] ?? NO_ENTRIES;
      return { ...ctx, entries: { ...ctx.entries, [e.bookId]: list.map((x) => (x.id === e.id ? { ...x, ...e.patch } : x)) } };
    },
    rememberLocalMedia: (ctx, e: { mediaPath: string; localUri: string }) => ({
      ...ctx,
      localMedia: { ...ctx.localMedia, [e.mediaPath]: e.localUri },
    }),
    /** Replace server-backed rows while keeping anything still pending upload. */
    mergeBooks: (ctx, e: { rows: Book[] }) => {
      const pending = ctx.books.filter((b) => b.pending && !e.rows.some((r) => r.id === b.id));
      return { ...ctx, books: sortBooks([...e.rows.map((r) => ({ ...r, pending: false })), ...pending]) };
    },
    mergeEntries: (ctx, e: { bookId: string; rows: Entry[] }) => {
      const current = ctx.entries[e.bookId] ?? NO_ENTRIES;
      const pending = current.filter((x) => x.pending && !e.rows.some((r) => r.id === x.id));
      return {
        ...ctx,
        entries: { ...ctx.entries, [e.bookId]: sortEntries([...e.rows.map((r) => ({ ...r, pending: false })), ...pending]) },
      };
    },
    rememberPrompt: (ctx, e: { pool: PromptPool; index: number }) => ({
      ...ctx,
      lastPrompt: { ...ctx.lastPrompt, [e.pool]: e.index },
    }),
    clear: () => ({ books: [], entries: {}, localMedia: {}, lastPrompt: {}, loaded: true }),
  },
});

// ---- reading ---------------------------------------------------------------------------------------

/** Select from the store in a component. The selection is cached per snapshot; return anything. */
export function useStore<T>(selector: (ctx: StoreContext) => T, compare?: (a: T, b: T) => boolean): T {
  return useSelector(store, (snap) => selector(snap.context), compare);
}

export const getState = () => store.getSnapshot().context;

export const selectBook = (id: string | undefined) => (s: StoreContext) => (id ? s.books.find((b) => b.id === id) : undefined);
export const selectEntries = (id: string | undefined) => (s: StoreContext) => (id ? (s.entries[id] ?? NO_ENTRIES) : NO_ENTRIES);

// ---- fresh entries ----------------------------------------------------------------------------------

/**
 * Ids of entries created on this device in this launch and not yet shown. The card that first
 * renders one takes it and plays the reward (bounce, sparkle, autoplay). Entries from sync never
 * get here. Not persisted: a relaunch shows everything calmly.
 */
const fresh = new Set<string>();
export const markFresh = (id: string) => fresh.add(id);
export const takeFresh = (id: string) => fresh.delete(id);

// ---- mutations (thin names for the rest of lib/) ---------------------------------------------------

export const upsertBook = (book: Book) => store.trigger.upsertBook({ book });
export const patchBook = (id: string, patch: Partial<Book>) => store.trigger.patchBook({ id, patch });
export const upsertEntry = (entry: Entry) => store.trigger.upsertEntry({ entry });
export const patchEntry = (bookId: string, id: string, patch: Partial<Entry>) => store.trigger.patchEntry({ bookId, id, patch });
export const rememberLocalMedia = (mediaPath: string, localUri: string) => store.trigger.rememberLocalMedia({ mediaPath, localUri });
export const mergeBooksFromServer = (rows: Book[]) => store.trigger.mergeBooks({ rows });
export const mergeEntriesFromServer = (bookId: string, rows: Entry[]) => store.trigger.mergeEntries({ bookId, rows });
export const rememberPrompt = (pool: PromptPool, index: number) => store.trigger.rememberPrompt({ pool, index });

// ---- persistence -----------------------------------------------------------------------------------

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let lastPersisted: StoreContext | null = null;

store.subscribe((snap) => {
  if (!snap.context.loaded || snap.context === lastPersisted) return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => void persist(snap.context), 150);
});

async function persist(ctx: StoreContext) {
  try {
    const { loaded: _loaded, ...rest } = ctx;
    await AsyncStorage.setItem(KEY, JSON.stringify(rest));
    lastPersisted = ctx;
  } catch (err) {
    // Storage full or unavailable; in-memory state still works.
    captureError('store.persist', err, { books: ctx.books.length });
  }
}

/** Reads the cached state once. Later calls are no-ops. */
export async function loadState(): Promise<void> {
  if (getState().loaded) return;
  let parsed: Partial<StoreContext> = {};
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) parsed = JSON.parse(raw) as Partial<StoreContext>;
  } catch (err) {
    captureError('store.load', err);
  }
  store.trigger.hydrate({
    books: parsed.books ?? [],
    entries: parsed.entries ?? {},
    localMedia: parsed.localMedia ?? {},
    lastPrompt: parsed.lastPrompt ?? {},
  });
  info('store.loaded', { books: getState().books.length, cached: Object.keys(parsed).length > 0 });
}
