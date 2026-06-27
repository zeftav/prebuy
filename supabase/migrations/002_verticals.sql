-- 002_verticals.sql — generalize the subject from aviation-only to multi-vertical
-- Run by paste in the Supabase SQL editor. Additive where it can be; the aviation-
-- only columns are dropped because `inspections` has no real data yet (verified:
-- only orgs/memberships exist). Snapshot first if you're unsure.
--
-- Why: PreBuy is a horizontal pre-purchase inspection platform. Aircraft, boat,
-- house, and car must all fit one schema with NO per-vertical migrations. We add a
-- `vertical` + a generic `identifier` (N-number / HIN / VIN / address) + common
-- make/model/year + a JSONB `attributes` bag for the long tail. Checklist library
-- is keyed by `vertical` (+ optional `asset_type` subtype).
--
-- RLS: unchanged. Every policy keys off `org_id`, which is untouched. JWT: N/A
-- (schema migration, not an edge function).

-- ----------------------------------------------------------------------------
-- inspections: drop aviation-only shape, add vertical-agnostic shape
-- ----------------------------------------------------------------------------
alter table public.inspections
  add column if not exists vertical    text not null default 'aviation'
    check (vertical in ('aviation','marine','home','automotive')),
  add column if not exists asset_type  text,                 -- subtype, e.g. 'airplane','sailboat'
  add column if not exists identifier  text,                 -- N-number / HIN / VIN / address
  add column if not exists make        text,
  add column if not exists model       text,
  add column if not exists year        int,
  add column if not exists attributes  jsonb not null default '{}'::jsonb;

-- Carry any aviation data forward (no-op on an empty table, safe if not).
update public.inspections set identifier = n_number where identifier is null and n_number is not null;
update public.inspections set make = aircraft_make   where make  is null and aircraft_make  is not null;
update public.inspections set model = aircraft_model where model is null and aircraft_model is not null;
update public.inspections set year = aircraft_year   where year  is null and aircraft_year  is not null;
update public.inspections
  set attributes = jsonb_set(attributes, '{serial}', to_jsonb(aircraft_serial))
  where aircraft_serial is not null;

-- identifier is required going forward.
alter table public.inspections alter column identifier set not null;

-- Drop the aviation-specific columns (now generalized above).
alter table public.inspections
  drop column if exists n_number,
  drop column if exists aircraft_make,
  drop column if exists aircraft_model,
  drop column if exists aircraft_year,
  drop column if exists aircraft_serial;

create index if not exists inspections_identifier_idx on public.inspections(identifier);
create index if not exists inspections_vertical_idx   on public.inspections(vertical);

-- ----------------------------------------------------------------------------
-- checklist_templates: key the library by vertical (+ optional subtype)
-- ----------------------------------------------------------------------------
alter table public.checklist_templates
  add column if not exists vertical    text not null default 'aviation'
    check (vertical in ('aviation','marine','home','automotive')),
  add column if not exists asset_type  text,
  add column if not exists attributes  jsonb not null default '{}'::jsonb;

create index if not exists templates_vertical_idx on public.checklist_templates(vertical);
