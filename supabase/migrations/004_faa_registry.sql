-- 004_faa_registry.sql — FAA aircraft data for the Identify stage (N-number → prepopulate).
--
-- Trimmed on purpose: only the columns we use to prefill an inspection. NO registrant
-- names/addresses (PII) — just public aircraft type/registration facts. This keeps the
-- whole dataset small (~<100 MB for the full ~300k-row load) and lookups are single
-- indexed reads. A few fixtures are seeded so the flow works before the bulk load.
--
-- RLS: read-only to authenticated users (non-PII public data). No client writes — the
-- tables are loaded by the service role (bulk COPY, see the procedure at the bottom).

-- Aircraft reference (make/model) keyed by the FAA 7-char aircraft mfr/model code.
create table if not exists public.faa_aircraft_ref (
  code       text primary key,   -- ACFTREF 'CODE'
  mfr        text,               -- manufacturer, e.g. 'BEECH'
  model      text,               -- e.g. 'A36'
  type_acft  text,               -- type-aircraft code
  type_eng   text,               -- engine-type code
  num_eng    int,
  num_seats  int
);

-- Registry: one row per N-number, trimmed. We store the N-number WITH its leading
-- 'N' (normalized uppercase); the FAA file stores it without — prepend on load.
create table if not exists public.faa_registry (
  n_number        text primary key,
  serial          text,
  mfr_model_code  text references public.faa_aircraft_ref(code) on delete set null,
  year_mfr        int,
  updated_at      timestamptz not null default now()
);
create index if not exists faa_registry_code_idx on public.faa_registry(mfr_model_code);

alter table public.faa_aircraft_ref enable row level security;
alter table public.faa_registry     enable row level security;

create policy faa_ref_read on public.faa_aircraft_ref
  for select to authenticated using (true);
create policy faa_reg_read on public.faa_registry
  for select to authenticated using (true);

-- ----------------------------------------------------------------------------
-- Fixtures (work before the bulk load). Includes Brett's test case N3704A.
-- The ref `code` values here are placeholders for the fixtures; the real codes
-- come from ACFTREF on bulk load (the FK + join work regardless).
-- ----------------------------------------------------------------------------
insert into public.faa_aircraft_ref (code, mfr, model, type_acft, type_eng, num_eng, num_seats)
values
  ('FIX-A36', 'BEECH',  'A36',  '4', '1', 1, 6),
  ('FIX-172S','CESSNA', '172S', '4', '1', 1, 4)
on conflict (code) do nothing;

insert into public.faa_registry (n_number, serial, mfr_model_code, year_mfr)
values
  ('N3704A', 'E-212',    'FIX-A36',  1970),   -- 1970 Beech A36, S/N E-212
  ('N172SP', '172S8001', 'FIX-172S', 2004)
on conflict (n_number) do nothing;

-- ----------------------------------------------------------------------------
-- BULK LOAD (run later, when you want the full FAA dataset). Done by Brett with
-- the service role; not part of this migration. Procedure:
--
-- 1. Download the FAA "Aircraft Registration Database" (releasable) ZIP from
--    https://registry.faa.gov/database/ReleasableAircraft.zip  → unzip MASTER.txt
--    and ACFTREF.txt (comma-delimited, header row).
-- 2. Create staging tables matching the file columns, COPY the CSVs in (psql:
--    \copy stg_acftref FROM 'ACFTREF.txt' CSV HEADER ;  likewise stg_master).
-- 3. Upsert the trimmed columns we keep:
--      insert into public.faa_aircraft_ref (code, mfr, model, type_acft, type_eng, num_eng, num_seats)
--      select trim("CODE"), trim("MFR"), trim("MODEL"), trim("TYPE-ACFT"),
--             trim("TYPE-ENG"), nullif(trim("NO-ENG"),'')::int, nullif(trim("NO-SEATS"),'')::int
--      from stg_acftref
--      on conflict (code) do update set mfr=excluded.mfr, model=excluded.model;
--
--      insert into public.faa_registry (n_number, serial, mfr_model_code, year_mfr)
--      select 'N'||trim("N-NUMBER"), trim("SERIAL NUMBER"), trim("MFR MDL CODE"),
--             nullif(trim("YEAR MFR"),'')::int
--      from stg_master
--      on conflict (n_number) do update set serial=excluded.serial,
--             mfr_model_code=excluded.mfr_model_code, year_mfr=excluded.year_mfr,
--             updated_at=now();
-- 4. Drop the staging tables. Re-run monthly to refresh.
-- ----------------------------------------------------------------------------
