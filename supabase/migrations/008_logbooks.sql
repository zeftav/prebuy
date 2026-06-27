-- 008_logbooks.sql — logbook audit / research tool.
--
-- Tracks an aircraft's records across MULTIPLE physical logbooks per type
-- (airframe / engine / propeller), so we can reconcile time continuity, surface
-- gaps (possible missing logbooks) and overlaps, and capture notable events
-- (ADs, 337s, overhauls, prop strikes, damage). Times use tach/Hobbs hours.
--
-- Org-scoped RLS like the rest of the tenant tables. Per-inspection.

create table if not exists public.logbooks (
  id            uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  org_id        uuid not null references public.orgs(id) on delete cascade,
  kind          text not null default 'airframe'
                check (kind in ('airframe', 'engine', 'propeller', 'other')),
  label         text,                       -- e.g. "Airframe Book 2"
  start_date    date,
  start_tach    numeric(10,1),
  end_date      date,
  end_tach      numeric(10,1),
  sort_order    int  not null default 0,
  notes         text,
  created_at    timestamptz not null default now()
);
create index if not exists logbooks_inspection_idx on public.logbooks(inspection_id);
create index if not exists logbooks_org_idx on public.logbooks(org_id);

-- Notable events found while auditing the logs.
create table if not exists public.logbook_events (
  id            uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  org_id        uuid not null references public.orgs(id) on delete cascade,
  logbook_id    uuid references public.logbooks(id) on delete set null,
  event_date    date,
  tach          numeric(10,1),
  category      text not null default 'other'
                check (category in ('ad', '337', 'overhaul', 'prop_strike', 'damage', 'other')),
  title         text not null,
  description   text,
  created_at    timestamptz not null default now()
);
create index if not exists logbook_events_inspection_idx on public.logbook_events(inspection_id);
create index if not exists logbook_events_org_idx on public.logbook_events(org_id);

alter table public.logbooks        enable row level security;
alter table public.logbook_events  enable row level security;

create policy logbooks_all on public.logbooks
  for all using (org_id in (select public.user_org_ids()))
  with check    (org_id in (select public.user_org_ids()));

create policy logbook_events_all on public.logbook_events
  for all using (org_id in (select public.user_org_ids()))
  with check    (org_id in (select public.user_org_ids()));
