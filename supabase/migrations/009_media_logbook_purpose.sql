-- 009_media_logbook_purpose.sql — allow storing scanned logbook page photos as
-- media (purpose 'logbook'), for the OCR import (Claude vision reads these pages).
-- Extends the media.purpose check added in 006.

alter table public.media drop constraint if exists media_purpose_check;
alter table public.media
  add constraint media_purpose_check check (purpose in ('overview', 'discrepancy', 'logbook'));
