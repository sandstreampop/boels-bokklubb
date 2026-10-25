// Pulls from the server into the local store. Called on screen focus; never blocks the UI.

import { getState, mergeBooksFromServer, mergeEntriesFromServer } from './store';
import { supabase } from './supabase';
import { captureError, debug } from './telemetry';
import type { Book, Entry } from './types';

export async function pullBooks(): Promise<void> {
  const t0 = Date.now();
  try {
    const { data, error } = await supabase.from('books').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    if (!data) return;
    debug('sync.books.ok', { rows: data.length, ms: Date.now() - t0 });
    mergeBooksFromServer(data as Book[]);
  } catch (err) {
    captureError('sync.books', err, { ms: Date.now() - t0 }, 'warn');
  }
}

export async function pullEntries(bookId: string): Promise<void> {
  const t0 = Date.now();
  try {
    const { data, error } = await supabase
      .from('entries')
      .select('*')
      .eq('book_id', bookId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    if (!data) return;
    debug('sync.entries.ok', { bookId, rows: data.length, ms: Date.now() - t0 });
    mergeEntriesFromServer(bookId, data as Entry[]);
  } catch (err) {
    captureError('sync.entries', err, { bookId, ms: Date.now() - t0 }, 'warn');
  }
}

/** Every entry of every book in one query, so rings and totals are right without opening each book. */
export async function pullAllEntries(): Promise<void> {
  const t0 = Date.now();
  try {
    const { data, error } = await supabase.from('entries').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    if (!data) return;
    const byBook = new Map<string, Entry[]>();
    for (const row of data as Entry[]) {
      const list = byBook.get(row.book_id) ?? [];
      list.push(row);
      byBook.set(row.book_id, list);
    }
    for (const b of getState().books) mergeEntriesFromServer(b.id, byBook.get(b.id) ?? []);
    debug('sync.entries.all.ok', { rows: data.length, books: byBook.size, ms: Date.now() - t0 });
  } catch (err) {
    captureError('sync.entries.all', err, { ms: Date.now() - t0 }, 'warn');
  }
}
