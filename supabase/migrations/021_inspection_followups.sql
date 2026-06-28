-- 021_inspection_followups.sql — per-inspection "to-investigate" / follow-up list.
--
-- A running backlog of open questions the inspector jots as they go ("noticed X,
-- needs more research", "want to look deeper", "waiting on logbooks", "second
-- opinion"). These are TODOs / open questions, deliberately kept SEPARATE from
-- inspection_items so findings (conclusions) stay clean. The inspector works the
-- list down before publishing; each one resolves into a finding, a note, or is
-- dismissed. Items flagged show_on_report surface in the customer report as the
-- "Recommended for further evaluation" section.
--
-- Org-scoped RLS like the rest of the tenant tables. Per-inspection.

create table if not exists public.inspection_followups (
  id                 uuid primary key default gen_random_uuid(),
  inspection_id      uuid not null references public.inspections(id) on delete cascade,
  org_id             uuid not null references public.orgs(id) on delete cascade,
  -- Optional link to the checklist item that prompted it (one-tap "flag for follow-up").
  inspection_item_id uuid references public.inspection_items(id) on delete set null,
  note               text not null,
  reason             text not null default 'research'
                     check (reason in ('research', 'look-deeper', 'awaiting-records', 'second-opinion', 'other')),
  status             text not null default 'open'
                     check (status in ('open', 'resolved', 'dismissed')),
  -- Opt-in: surface this on the customer report's "Recommended for further evaluation".
  show_on_report     boolean not null default false,
  created_by         uuid references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists inspection_followups_inspection_idx on public.inspection_followups(inspection_id);
create index if not exists inspection_followups_org_idx on public.inspection_followups(org_id);

alter table public.inspection_followups enable row level security;

drop policy if exists inspection_followups_all on public.inspection_followups;
create policy inspection_followups_all on public.inspection_followups
  for all using (org_id in (select public.user_org_ids()))
  with check    (org_id in (select public.user_org_ids()));
