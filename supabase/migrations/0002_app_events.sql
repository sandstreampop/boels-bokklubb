-- Telemetry from the app: breadcrumbs, errors, crashes. Written by lib/telemetry.ts, read with
-- scripts/logs.mjs (npm run logs). Behind the family login like everything else.

create table if not exists public.app_events (
  id uuid primary key,
  received_at timestamptz not null default now(),
  at timestamptz not null,
  install_id text,
  session_id text not null,
  seq integer not null,
  level text not null check (level in ('debug', 'info', 'warn', 'error', 'fatal')),
  event text not null,
  data jsonb,
  app jsonb
);

create index if not exists app_events_at_idx on public.app_events (at desc);
create index if not exists app_events_session_idx on public.app_events (session_id, seq);
create index if not exists app_events_level_idx on public.app_events (level, at desc);

alter table public.app_events enable row level security;

drop policy if exists "family insert events" on public.app_events;
create policy "family insert events" on public.app_events
  for insert to authenticated with check (true);

drop policy if exists "family read events" on public.app_events;
create policy "family read events" on public.app_events
  for select to authenticated using (true);
