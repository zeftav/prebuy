-- 031_report_revisions.sql
-- Report versioning: publishing a report freezes a SNAPSHOT (a revision). The
-- public share link serves the latest published revision, so edits made afterward
-- stay in draft until the next revision is published. History is retained.
-- Additive + idempotent.

create table if not exists public.report_revisions (
  id            uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  org_id        uuid not null references public.orgs(id) on delete cascade,
  revision      integer not null,
  snapshot      jsonb not null,
  note          text,
  published_by  uuid references auth.users(id) on delete set null,
  published_at  timestamptz not null default now(),
  created_at    timestamptz not null default now(),
  unique (inspection_id, revision)
);

create index if not exists report_revisions_inspection_idx on public.report_revisions(inspection_id);

-- Pointer to the latest published revision (handy for the in-app UI).
alter table public.inspections add column if not exists current_revision integer;

-- RLS: org members may read + create their org's revisions. The public report is
-- served by the edge fn (service role), which bypasses RLS.
alter table public.report_revisions enable row level security;

drop policy if exists report_revisions_read on public.report_revisions;
create policy report_revisions_read on public.report_revisions
  for select using (org_id in (select public.user_org_ids()));

drop policy if exists report_revisions_insert on public.report_revisions;
create policy report_revisions_insert on public.report_revisions
  for insert with check (org_id in (select public.user_org_ids()));
