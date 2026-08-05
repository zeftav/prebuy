-- 033_events_report_default_off.sql
-- Notable events are now OPT-IN on the customer report (like parts), so a book full
-- of routine entries doesn't flood the report. Flip the default to false and reset
-- existing events to hidden (the feature is new — nothing curated yet). Idempotent.

alter table public.logbook_events alter column show_on_report set default false;
update public.logbook_events set show_on_report = false where show_on_report is true;
