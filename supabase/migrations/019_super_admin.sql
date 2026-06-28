-- 019_super_admin.sql — platform owner ("super admin") capability + AI usage log.
-- This sits ABOVE the per-org RLS model: a super admin reads across every tenant.
-- We DON'T do that with broad RLS (which would weaken tenant isolation); instead,
-- privileged cross-tenant work runs in JWT-ON edge functions (admin-orgs,
-- admin-ai-cost) that re-check super-admin then use the service-role key. The only
-- thing the client needs is a cheap "am I a super admin?" check → is_super_admin().
--
-- Two-tier model: a hardcoded founder list (duplicated in the client AuthProvider
-- and every gated edge fn — never lockable-out) PLUS this manageable table. So
-- is_super_admin() intentionally checks the TABLE only; SQL/edge code that must also
-- honor the founder checks `is_super_admin() OR auth.email() = '<founder>'`.
--
-- RLS: no policies on either table — only the service role (gated edge fns) writes
-- super_admins / ai_usage, and the client reads super-admin status via the RPC,
-- which never exposes the roster itself.

-- ----------------------------------------------------------------------------
-- super_admins — DB-managed platform owners (founders are hardcoded, see above).
-- ----------------------------------------------------------------------------
create table if not exists public.super_admins (
  email       text primary key,
  added_by    text,
  created_at  timestamptz not null default now()
);
alter table public.super_admins enable row level security;
-- No policies on purpose: service-role only. The client uses is_super_admin().

-- Membership check for the current user. SECURITY DEFINER so it can read
-- super_admins under RLS; returns only a boolean, never the list.
create or replace function public.is_super_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.super_admins
    where lower(email) = lower(coalesce(auth.email(), ''))
  );
$$;
grant execute on function public.is_super_admin() to authenticated;

-- ----------------------------------------------------------------------------
-- ai_usage — one row per AI edge-function call (tokens, for cost attribution).
-- Written fire-and-forget by structure-finding / structure-logbook /
-- generate-summary with the service role; read (aggregated) by admin-ai-cost.
-- org_id is best-effort (the caller passes it when known) → null = unattributed.
-- ----------------------------------------------------------------------------
create table if not exists public.ai_usage (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid references public.orgs(id) on delete set null,
  user_email     text,
  function_name  text not null,
  model          text,
  input_tokens   int  not null default 0,
  output_tokens  int  not null default 0,
  created_at     timestamptz not null default now()
);
create index if not exists ai_usage_created_idx on public.ai_usage(created_at);
create index if not exists ai_usage_org_idx     on public.ai_usage(org_id);
alter table public.ai_usage enable row level security;
-- No policies: service-role writes, admin-ai-cost (service role) reads.
