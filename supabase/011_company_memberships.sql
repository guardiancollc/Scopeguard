-- ScopeGuard company membership / worker foundation
-- STAGED ONLY: not active until explicitly applied to Supabase.

create table if not exists public.company_memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  user_id uuid not null,
  role text not null default 'worker'
    check (role in ('owner','admin','foreman','worker')),
  status text not null default 'active'
    check (status in ('active','disabled')),
  invited_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, user_id)
);

create index if not exists company_memberships_user_idx
  on public.company_memberships(user_id);
create index if not exists company_memberships_company_idx
  on public.company_memberships(company_id);

create table if not exists public.company_invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  email text not null,
  role text not null default 'worker'
    check (role in ('admin','foreman','worker')),
  token_hash text not null unique,
  status text not null default 'pending'
    check (status in ('pending','accepted','revoked','expired')),
  invited_by uuid not null,
  expires_at timestamptz not null,
  accepted_by uuid,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists company_invitations_company_idx
  on public.company_invitations(company_id);
create index if not exists company_invitations_email_idx
  on public.company_invitations(lower(email));

comment on table public.company_memberships is
  'Maps authenticated ScopeGuard users to companies and roles.';
comment on table public.company_invitations is
  'Pending team invitations. Raw invite tokens are never stored; only a hash is persisted.';
