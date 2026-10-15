-- ScopeGuard subscription foundation
-- SAFE/STAGED: this migration is not active merely by existing in GitHub.
-- It does not modify current application code or current production behavior.
-- Apply separately only after review/testing.

create table if not exists public.company_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  plan_id text not null default 'trial'
    check (plan_id in (
      'trial',
      'pro_monthly',
      'pro_yearly',
      'business_monthly',
      'business_yearly',
      'business_lifetime'
    )),
  status text not null default 'trialing'
    check (status in ('trialing','active','past_due','canceled','expired')),
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  current_period_started_at timestamptz,
  current_period_ends_at timestamptz,
  lifetime_access boolean not null default false,
  billing_provider text,
  billing_customer_id text,
  billing_subscription_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id)
);

create index if not exists company_subscriptions_company_id_idx
  on public.company_subscriptions(company_id);

comment on table public.company_subscriptions is
  'ScopeGuard company-level plan state. Billing-provider integration will be connected later.';

comment on column public.company_subscriptions.plan_id is
  'trial, pro_monthly, pro_yearly, business_monthly, business_yearly, or business_lifetime';

comment on column public.company_subscriptions.lifetime_access is
  'True only for a completed Business Lifetime purchase.';
