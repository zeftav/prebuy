-- 028_records_onboarding.sql — records onboarding + searchable part numbers.
--
-- A shop can onboard an aircraft it's seeing for the first time as a 'records'
-- job: same logbook-audit workflow (scan → per-logbook PDF → parse times/events),
-- but with no prepurchase checklist — an internal records resource. It's still an
-- inspection row (reuses all the tooling); mode='records' drives the UI.
--
-- Logbook scans also extract notable part numbers/components into logbook_parts,
-- so the aircraft's records become searchable ("do we have records of this part?").

-- Extend the per-job mode with 'records'.
alter table public.inspections drop constraint if exists inspections_mode_check;
alter table public.inspections
  add constraint inspections_mode_check check (mode in ('inspection', 'listing', 'records'));

-- Parts/components pulled from logbook entries, per aircraft (inspection).
create table if not exists public.logbook_parts (
  id            uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  org_id        uuid not null references public.orgs(id) on delete cascade,
  logbook_id    uuid references public.logbooks(id) on delete cascade,
  part_number   text,
  description   text,
  event_date    date,
  tach          numeric(10,1),
  created_at    timestamptz not null default now()
);
create index if not exists logbook_parts_inspection_idx on public.logbook_parts(inspection_id);
create index if not exists logbook_parts_org_idx on public.logbook_parts(org_id);

alter table public.logbook_parts enable row level security;
drop policy if exists logbook_parts_all on public.logbook_parts;
create policy logbook_parts_all on public.logbook_parts
  for all using (org_id in (select public.user_org_ids()))
  with check    (org_id in (select public.user_org_ids()));
