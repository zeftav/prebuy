-- 018_marine_mic.sql — USCG Manufacturer Identifier Codes for the marine Identify
-- stage (HIN → prefill builder). The first 3 chars of a Hull Identification Number
-- are the MIC, assigned by the US Coast Guard; the MIC list is public. We store
-- just MIC → manufacturer (a small reference table, like faa_aircraft_ref). The
-- rest of the HIN (serial, model year) is parsed client-side (lib/marine.js) and
-- needs no table. A few fixtures are seeded; the full USCG MIC list can be bulk-
-- loaded later (see docs/backlog.md → identifier resolvers).
--
-- RLS: read-only to authenticated users (public reference data). No client writes.

create table if not exists public.marine_mic (
  mic           text primary key,    -- 3-char Manufacturer Identifier Code (uppercase)
  manufacturer  text not null,       -- builder name
  status        text,                -- e.g. 'active' / 'inactive' (optional)
  updated_at    timestamptz not null default now()
);

alter table public.marine_mic enable row level security;

drop policy if exists marine_mic_read on public.marine_mic;
create policy marine_mic_read on public.marine_mic
  for select to authenticated using (true);

-- Fixtures so the HIN flow is testable before the full USCG MIC list is loaded.
-- MICs are exactly 3 chars. These are TEST entries (incl. one matching the example
-- HIN 'ABC12345D404'); real builder names come from the USCG bulk load — we don't
-- assert real company→MIC mappings here to avoid shipping wrong data.
insert into public.marine_mic (mic, manufacturer, status) values
  ('ABC', 'Example Boat Works (test)', 'active'),
  ('ZZZ', 'Test Marine Co. (test)', 'active')
on conflict (mic) do update set manufacturer = excluded.manufacturer, status = excluded.status, updated_at = now();
