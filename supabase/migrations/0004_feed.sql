-- Build 8: the read-only web version for relatives (docs/PRD-build-8.md). One row, key 'link',
-- counts wrong PINs on the secret link and holds the lock after the fifth. Rerunnable.

create table if not exists public.feed_attempts (
  key text primary key,
  failures integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.feed_attempts enable row level security;
-- No policies: only the service role, inside the feed function, touches this table.
