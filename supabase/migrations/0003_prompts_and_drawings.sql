-- Build 6: a prompt stored on every new entry, and drawings as a fourth entry kind.
-- Rerunnable like the others.

alter table public.entries add column if not exists prompt text;
alter table public.entries drop constraint if exists entries_kind_check;
alter table public.entries add constraint entries_kind_check
  check (kind in ('text', 'audio', 'photo', 'drawing'));
