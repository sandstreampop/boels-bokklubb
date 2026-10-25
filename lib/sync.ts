// Pulls from the server into the local store. Called on screen focus; never blocks the UI.

import { mergeBooksFromServer, mergeEntriesFromServer } from './store';
import { supabase } from './supabase';
import type { Book, Entry } from './types';

export async function pullBooks(): Promise<void> {
  const { data, error } = await supabase.from('books').select('*').order('created_at', { ascending: false });
  if (error || !data) return;
  mergeBooksFromServer(data as Book[]);
}

export async function pullEntries(bookId: string): Promise<void> {
  const { data, error } = await supabase
    .from('entries')
    .select('*')
    .eq('book_id', bookId)
    .order('created_at', { ascending: false });
  if (error || !data) return;
  mergeEntriesFromServer(bookId, data as Entry[]);
}
