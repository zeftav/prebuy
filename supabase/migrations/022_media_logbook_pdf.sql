-- 022_media_logbook_pdf.sql — logbook page manager + compiled PDF.
--
-- Logbook pages are captured as media rows (purpose='logbook'). This adds:
--   • a `logbook_pdf` purpose for the compiled, downloadable PDF of the book;
--   • `sort_order` so pages can be reordered in the page manager;
--   • `rotation` (0/90/180/270) so a sideways page can be turned before compiling;
--   • `show_on_report` so the compiled PDF can optionally appear (as a download
--     link) on the customer report.
-- All additive; existing media rows default to sort_order 0 / rotation 0 / off.

alter table public.media drop constraint if exists media_purpose_check;
alter table public.media
  add constraint media_purpose_check
  check (purpose in ('overview', 'discrepancy', 'logbook', 'attachment', 'logbook_pdf'));

alter table public.media add column if not exists sort_order     int     not null default 0;
alter table public.media add column if not exists rotation       int     not null default 0;
alter table public.media add column if not exists show_on_report boolean not null default false;
