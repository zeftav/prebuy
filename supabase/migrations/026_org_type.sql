-- 026_org_type.sql — account type per shop (org): inspector / broker / both.
--
-- Chosen at signup. It tailors the experience:
--   • inspector → full guided inspections (checklist, findings, report)
--   • broker    → listings only (profile, photos, logbooks, publish, hand off)
--   • both      → either, chosen per job
-- It does NOT change RLS or the data model — a "listing" is still just an
-- inspection with mode='listing' (migration 016). This only drives which UI a
-- shop sees. Existing orgs default to 'inspector' so nothing changes for them.

alter table public.orgs
  add column if not exists org_type text not null default 'inspector'
  check (org_type in ('inspector', 'broker', 'both'));
