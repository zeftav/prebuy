-- 034_report_views.sql — report "read receipt": one row per real open of a
-- published report's share link. Written by the `report` edge function (service
-- role) on the serve path; read by the shop (org-scoped RLS). Idempotent.

create table if not exists public.report_views (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  org_id uuid not null references public.orgs(id) on delete cascade,
  revision integer,
  viewed_at timestamptz not null default now()
);

create index if not exists report_views_inspection_idx
  on public.report_views (inspection_id, viewed_at desc);

alter table public.report_views enable row level security;

-- Org members can read their own shop's report views. No client insert/update/
-- delete — the report edge function writes via the service role (which bypasses RLS).
drop policy if exists report_views_select on public.report_views;
create policy report_views_select on public.report_views
  for select using (org_id in (select public.user_org_ids()));
