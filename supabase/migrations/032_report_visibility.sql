-- 032_report_visibility.sql
-- Per-record control over what appears on the customer report. Notable events
-- stay shown by default (the maintenance timeline is a feature) but can be held
-- back; parts/components are opt-IN (not on the report unless chosen). Timed-items
-- (compliance) visibility rides their existing attributes bag — no column here.
-- Additive + idempotent.

alter table public.logbook_events add column if not exists show_on_report boolean not null default true;
alter table public.logbook_parts  add column if not exists show_on_report boolean not null default false;
