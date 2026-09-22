create table if not exists public.email_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google')),
  email text not null,
  refresh_token_encrypted text not null,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, provider)
);
alter table public.email_connections enable row level security;
-- Tokens are intentionally server-only. No browser RLS policies are created.
