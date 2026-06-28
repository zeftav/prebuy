-- 015_media_attachments.sql — allow document attachments on inspection items
-- (e.g. an oil-analysis lab PDF on the engine item), beyond photos/videos.
-- Adds media.kind 'document' and media.purpose 'attachment'. Idempotent.

alter table public.media drop constraint if exists media_kind_check;
alter table public.media
  add constraint media_kind_check check (kind in ('photo', 'video', 'document'));

alter table public.media drop constraint if exists media_purpose_check;
alter table public.media
  add constraint media_purpose_check check (purpose in ('overview', 'discrepancy', 'logbook', 'attachment'));
