-- 016_inspection_mode.sql — a job is either a full pre-purchase 'inspection' or a
-- broker 'listing' (capture-only: profile + photos + logbooks + narrative, no
-- checklist/findings). Mode is per-job, not per-shop — a shop can do both.
-- `source_inspection_id` records lineage when an inspection is started from a
-- listing (the handoff). Additive + idempotent.

alter table public.inspections
  add column if not exists mode text not null default 'inspection'
    check (mode in ('inspection', 'listing'));

alter table public.inspections
  add column if not exists source_inspection_id uuid references public.inspections(id) on delete set null;
