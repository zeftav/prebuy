-- 014_logbook_position.sql — per-engine/per-prop position on logbooks + events, so
-- a multi-engine aircraft reconciles each engine's (and prop's) times separately.
-- Convention matches the profile: position 1 = left/front engine, 2 = right/rear.
-- NULL = single-engine, airframe, or unassigned. Additive + idempotent.

alter table public.logbooks add column if not exists position smallint;
alter table public.logbook_events add column if not exists position smallint;
