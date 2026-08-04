-- 030_logbook_event_next_due.sql
-- Next-due for recurring items (esp. ADs read off an AD compliance report): a due
-- date and/or due hours, so the AD chart can show "next due". Additive + idempotent.

alter table public.logbook_events add column if not exists next_due_date date;
alter table public.logbook_events add column if not exists next_due_hours numeric(10,1);
