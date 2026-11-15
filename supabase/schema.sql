create table if not exists public.levi_state (
  id text primary key check (id = 'main'),
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.levi_state enable row level security;

revoke all on public.levi_state from public, anon, authenticated;
grant all on public.levi_state to service_role;
