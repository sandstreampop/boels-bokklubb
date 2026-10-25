-- Boels bokklubb: schema, row level security, storage buckets.
-- Single family login: every authenticated user has full access.

create extension if not exists "pgcrypto";

create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  title text not null,
  author text,
  cover_path text,
  rating smallint check (rating between 1 and 5)
);

create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('text', 'audio', 'photo')),
  text text,
  media_path text,
  duration_ms integer,
  transcript text,
  transcript_status text not null default 'none' check (transcript_status in ('none', 'pending', 'done', 'failed'))
);

create index if not exists entries_book_created_idx on public.entries (book_id, created_at desc);

alter table public.books enable row level security;
alter table public.entries enable row level security;

drop policy if exists "family all books" on public.books;
create policy "family all books" on public.books
  for all to authenticated using (true) with check (true);

drop policy if exists "family all entries" on public.entries;
create policy "family all entries" on public.entries
  for all to authenticated using (true) with check (true);

-- Storage: two private buckets. Covers are small JPEGs, media holds audio and photos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('covers', 'covers', false, 10485760, array['image/jpeg', 'image/png', 'image/heic']),
  ('media', 'media', false, 104857600, array['image/jpeg', 'image/png', 'image/heic', 'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/aac', 'audio/mpeg', 'audio/wav'])
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "family read storage" on storage.objects;
create policy "family read storage" on storage.objects
  for select to authenticated using (bucket_id in ('covers', 'media'));

drop policy if exists "family write storage" on storage.objects;
create policy "family write storage" on storage.objects
  for insert to authenticated with check (bucket_id in ('covers', 'media'));

drop policy if exists "family update storage" on storage.objects;
create policy "family update storage" on storage.objects
  for update to authenticated using (bucket_id in ('covers', 'media'));

drop policy if exists "family delete storage" on storage.objects;
create policy "family delete storage" on storage.objects
  for delete to authenticated using (bucket_id in ('covers', 'media'));
