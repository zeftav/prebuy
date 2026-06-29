-- 025_logbook_review_note.sql — surface AI reading uncertainty on a logbook.
--
-- When the vision scan can't confidently read part of a logbook (smudged figure,
-- faded handwriting), it returns what it's unsure about. We store a concise note
-- on the logbook so the inspector sees a "verify against the PDF" advisory and can
-- clear it once checked. Presence of review_note = needs review; null = cleared.

alter table public.logbooks add column if not exists review_note text;
