-- 010_inspection_meta.sql — inspection provenance for the report header:
-- when, where, and who performed the inspection.

alter table public.inspections
  add column if not exists inspector_name  text,
  add column if not exists location        text,   -- airport/facility, e.g. "KPKV, Port Lavaca TX"
  add column if not exists inspection_date  date;
