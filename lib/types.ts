export type Book = {
  id: string;
  created_at: string;
  title: string;
  author: string | null;
  cover_path: string | null;
  rating: number | null;
  /** Set locally until the row has reached the server. */
  pending?: boolean;
};

export type EntryKind = 'text' | 'audio' | 'photo';

export type Entry = {
  id: string;
  book_id: string;
  created_at: string;
  kind: EntryKind;
  text: string | null;
  media_path: string | null;
  duration_ms: number | null;
  transcript: string | null;
  transcript_status: 'none' | 'pending' | 'done' | 'failed';
  pending?: boolean;
};
