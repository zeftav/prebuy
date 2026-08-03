-- 029_logbook_source_page.sql
-- Hotlink each extracted item back to the page of its logbook's compiled PDF.
-- The scan reads a 1-based page number for each event/part; we store it so the UI
-- can open the logbook PDF at that page (#page=N). Additive + idempotent.

alter table public.logbook_events add column if not exists source_page integer;
alter table public.logbook_parts  add column if not exists source_page integer;
