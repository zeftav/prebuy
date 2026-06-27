-- 001_init.sql — PreBuy initial schema + RLS
-- Run by paste in the Supabase SQL editor. Additive, numbered. Safe to run once.
-- Multi-tenant from day one: org_id on every tenant table + org-scoped RLS.
--
-- Customer-facing report access is intentionally NOT exposed via RLS here.
-- The public (no-login) report is served by a SECURITY-DEFINER edge function that
-- validates the share_token with the service role. Keep RLS strict; never add an
-- anon-readable policy to these tables.

-- ----------------------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto";  -- gen_random_uuid()

-- ----------------------------------------------------------------------------
-- Helper: updated_at trigger
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------

-- Tenants (inspection shops)
create table if not exists public.orgs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique,
  created_at  timestamptz not null default now()
);

-- User <-> org links with role. The first owner row is created by the signup
-- edge function (service role), not by the client.
create table if not exists public.memberships (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'mechanic'
              check (role in ('owner','admin','mechanic')),
  created_at  timestamptz not null default now(),
  unique (org_id, user_id)
);
create index if not exists memberships_user_idx on public.memberships(user_id);
create index if not exists memberships_org_idx  on public.memberships(org_id);

-- Checklist templates. Global library rows have org_id null + is_global true and
-- are seeded with the service role. A shop "clones" a global template into an
-- org-owned copy (source_template_id points back to the global one).
create table if not exists public.checklist_templates (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid references public.orgs(id) on delete cascade,
  is_global           boolean not null default false,
  source_template_id  uuid references public.checklist_templates(id) on delete set null,
  make                text not null,
  model               text not null,
  name                text not null,
  version             int  not null default 1,
  created_at          timestamptz not null default now(),
  -- a row is either global (no org) or org-owned (has org), never both/neither
  constraint template_ownership check (
    (is_global and org_id is null) or (not is_global and org_id is not null)
  )
);
create index if not exists templates_make_model_idx on public.checklist_templates(make, model);
create index if not exists templates_org_idx on public.checklist_templates(org_id);

-- Template line items. risk_weight drives the financial-risk ordering: higher =
-- inspect first (engine, spar, corrosion, AD compliance).
create table if not exists public.template_items (
  id            uuid primary key default gen_random_uuid(),
  template_id   uuid not null references public.checklist_templates(id) on delete cascade,
  category      text not null,
  title         text not null,
  description   text,
  sort_order    int  not null default 0,
  risk_weight   int  not null default 0,         -- 0..100, higher = higher financial risk
  est_cost_low  numeric(10,2),
  est_cost_high numeric(10,2),
  ata_chapter   text,
  created_at    timestamptz not null default now()
);
create index if not exists template_items_template_idx on public.template_items(template_id);

-- A single inspection job.
create table if not exists public.inspections (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.orgs(id) on delete cascade,
  n_number        text not null,
  aircraft_make   text,
  aircraft_model  text,
  aircraft_year   int,
  aircraft_serial text,
  customer_name   text,
  customer_email  text,
  template_id     uuid references public.checklist_templates(id) on delete set null,
  assigned_to     uuid references auth.users(id) on delete set null,
  status          text not null default 'draft'
                  check (status in ('draft','in_progress','review','published')),
  share_token     uuid not null default gen_random_uuid(),
  published_at    timestamptz,
  created_by      uuid references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists inspections_org_idx on public.inspections(org_id);
create index if not exists inspections_share_idx on public.inspections(share_token);
create trigger inspections_set_updated_at
  before update on public.inspections
  for each row execute function public.set_updated_at();

-- Per-job line items, instantiated from the template at job start.
create table if not exists public.inspection_items (
  id                uuid primary key default gen_random_uuid(),
  inspection_id     uuid not null references public.inspections(id) on delete cascade,
  org_id            uuid not null references public.orgs(id) on delete cascade,
  template_item_id  uuid references public.template_items(id) on delete set null,
  category          text not null,
  title             text not null,
  description       text,
  sort_order        int  not null default 0,
  risk_weight       int  not null default 0,
  status            text not null default 'pending'
                    check (status in ('pending','ok','monitor','discrepancy','na')),
  severity          int,                          -- 0..100, set when a discrepancy is found
  findings          text,                         -- cleaned, customer-facing finding
  transcript        text,                         -- raw dictation transcript
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists inspection_items_inspection_idx on public.inspection_items(inspection_id);
create index if not exists inspection_items_org_idx on public.inspection_items(org_id);
create trigger inspection_items_set_updated_at
  before update on public.inspection_items
  for each row execute function public.set_updated_at();

-- Photos/videos in Storage, linked to an item.
create table if not exists public.media (
  id                  uuid primary key default gen_random_uuid(),
  inspection_id       uuid not null references public.inspections(id) on delete cascade,
  inspection_item_id  uuid references public.inspection_items(id) on delete cascade,
  org_id              uuid not null references public.orgs(id) on delete cascade,
  storage_path        text not null,
  kind                text not null check (kind in ('photo','video')),
  caption             text,
  created_at          timestamptz not null default now()
);
create index if not exists media_item_idx on public.media(inspection_item_id);
create index if not exists media_org_idx  on public.media(org_id);

-- ----------------------------------------------------------------------------
-- SECURITY DEFINER helpers (avoid self-referential RLS recursion)
-- ----------------------------------------------------------------------------

-- The orgs the current user belongs to. Runs as definer so it can read
-- memberships without tripping memberships' own RLS policy.
create or replace function public.user_org_ids()
returns setof uuid
language sql
security definer
set search_path = public
stable
as $$
  select org_id from public.memberships where user_id = auth.uid();
$$;

-- The current user's role in a given org (null if not a member).
create or replace function public.user_role_in(p_org uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select role from public.memberships
  where user_id = auth.uid() and org_id = p_org
  limit 1;
$$;

-- ----------------------------------------------------------------------------
-- Enable RLS
-- ----------------------------------------------------------------------------
alter table public.orgs                enable row level security;
alter table public.memberships         enable row level security;
alter table public.checklist_templates enable row level security;
alter table public.template_items      enable row level security;
alter table public.inspections         enable row level security;
alter table public.inspection_items    enable row level security;
alter table public.media               enable row level security;

-- ----------------------------------------------------------------------------
-- Policies
-- ----------------------------------------------------------------------------

-- orgs: members can read; admins/owners can rename. Creation is via signup edge fn.
create policy orgs_select on public.orgs
  for select using (id in (select public.user_org_ids()));
create policy orgs_update on public.orgs
  for update using (public.user_role_in(id) in ('owner','admin'))
  with check    (public.user_role_in(id) in ('owner','admin'));

-- memberships: members can see co-members. Writes (invites/role changes) go
-- through an edge function with the service role.
create policy memberships_select on public.memberships
  for select using (org_id in (select public.user_org_ids()));

-- checklist_templates: read global + own; manage only own (non-global).
create policy templates_select on public.checklist_templates
  for select using (is_global or org_id in (select public.user_org_ids()));
create policy templates_insert on public.checklist_templates
  for insert with check (not is_global and org_id in (select public.user_org_ids()));
create policy templates_update on public.checklist_templates
  for update using (not is_global and org_id in (select public.user_org_ids()))
  with check     (not is_global and org_id in (select public.user_org_ids()));
create policy templates_delete on public.checklist_templates
  for delete using (not is_global and org_id in (select public.user_org_ids()));

-- template_items: visible/editable if the parent template is.
create policy template_items_select on public.template_items
  for select using (
    template_id in (
      select id from public.checklist_templates
      where is_global or org_id in (select public.user_org_ids())
    )
  );
create policy template_items_write on public.template_items
  for all using (
    template_id in (
      select id from public.checklist_templates
      where not is_global and org_id in (select public.user_org_ids())
    )
  )
  with check (
    template_id in (
      select id from public.checklist_templates
      where not is_global and org_id in (select public.user_org_ids())
    )
  );

-- inspections / inspection_items / media: full CRUD scoped to the user's orgs.
create policy inspections_all on public.inspections
  for all using (org_id in (select public.user_org_ids()))
  with check    (org_id in (select public.user_org_ids()));

create policy inspection_items_all on public.inspection_items
  for all using (org_id in (select public.user_org_ids()))
  with check    (org_id in (select public.user_org_ids()));

create policy media_all on public.media
  for all using (org_id in (select public.user_org_ids()))
  with check    (org_id in (select public.user_org_ids()));
