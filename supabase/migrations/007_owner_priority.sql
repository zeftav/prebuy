-- 007_owner_priority.sql — customization stage: let a shop flag an inspection item
-- as an owner-requested priority so it surfaces near the top regardless of its
-- baseline financial-risk weight. Per-job (on the editable inspection_items copy).

alter table public.inspection_items
  add column if not exists owner_priority boolean not null default false;
