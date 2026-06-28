-- 020_marine_mic_seed.sql — seed a verified real MIC so the boat HIN lookup names
-- a real builder before the full USCG list is bulk-loaded (see docs/marine-mic-
-- load.md). HUN = Hunter Marine (Marlow-Hunter), Alachua FL — verified against the
-- USCG manufacturer database. The bulk loader upserts the rest later (idempotent;
-- it will overwrite this row if the official list differs).
--
-- Idempotent: safe to re-run.

insert into public.marine_mic (mic, manufacturer, status) values
  ('HUN', 'Hunter Marine (Marlow-Hunter)', 'active')
on conflict (mic) do update set
  manufacturer = excluded.manufacturer,
  status = excluded.status,
  updated_at = now();
