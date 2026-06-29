-- 023_media_logbook_link.sql — tie logbook page scans (and the compiled PDF) to a
-- specific logbook.
--
-- The logbook audit is now scan-driven: you pick a logbook's type/position, snap
-- its pages, and we attach those media rows (purpose='logbook' pages and the
-- purpose='logbook_pdf' compile) to that logbook. Deleting a logbook removes its
-- pages/PDF rows (cascade); the Storage objects are cleaned up in the client
-- before the row delete.

alter table public.media
  add column if not exists logbook_id uuid references public.logbooks(id) on delete cascade;

create index if not exists media_logbook_idx on public.media(logbook_id);
