// Pulls from the server into the local store. Called on screen focus; never blocks the UI.

import { mergeBooksFromServer, mergeEntriesFromServer } from './store';
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
