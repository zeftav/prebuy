-- 027_checklist_phase.sql — two-phase inspections.
--
-- Uploaded checklists (e.g. Savvy's Beechcraft prebuy) run in two passes: Phase 1
-- items first (report + authorize), then Phase 2. Each item carries its phase so
-- the inspection view can group and work them a phase at a time. Nullable — legacy
-- / single-phase checklists just leave it null and render as one list.

alter table public.template_items   add column if not exists phase int;
alter table public.inspection_items add column if not exists phase int;
