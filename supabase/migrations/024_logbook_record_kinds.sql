-- 024_logbook_record_kinds.sql — add AD-report and Form-337 as scannable record
-- "logbook" kinds.
--
-- Beyond the airframe/engine/propeller books, shops commonly scan AD compliance
-- reports and stacks of FAA Form 337s. They live as their own scanned record
-- (pages + compiled PDF) under the logbook audit, alongside the time-tracked
-- books. They carry no tach span, so reconciliation ignores them.

alter table public.logbooks drop constraint if exists logbooks_kind_check;
alter table public.logbooks
  add constraint logbooks_kind_check
  check (kind in ('airframe', 'engine', 'propeller', 'ad', 'form_337', 'other'));
