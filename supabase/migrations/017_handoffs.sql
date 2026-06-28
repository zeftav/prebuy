-- 017_handoffs.sql — cross-org broker handoff. A broker creates a handoff for one
-- of their listings; the resulting tokenized claim link lets ANOTHER shop (org)
-- claim it, which copies the listing into their org as a full inspection. The copy
-- (incl. cross-org Storage objects) runs in the `claim-listing` edge fn (service
-- role) — RLS here only governs the broker side (create/see/revoke their handoffs).

create table if not exists public.handoffs (
  id                    uuid primary key default gen_random_uuid(),
  listing_id            uuid not null references public.inspections(id) on delete cascade,
  from_org_id           uuid not null references public.orgs(id) on delete cascade,
  token                 uuid not null default gen_random_uuid() unique,
  to_email              text,        -- intended recipient (record / future auto-invite)
  to_shop_name          text,        -- broker's label for the target shop
  status                text not null default 'pending' check (status in ('pending', 'claimed', 'revoked')),
  claimed_org_id        uuid references public.orgs(id) on delete set null,
  claimed_inspection_id uuid references public.inspections(id) on delete set null,
  created_by            uuid references auth.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  claimed_at            timestamptz
);

create index if not exists handoffs_from_org_idx on public.handoffs(from_org_id);
create index if not exists handoffs_listing_idx on public.handoffs(listing_id);

alter table public.handoffs enable row level security;

-- Broker side only: members of the originating org manage their handoffs. The
-- claim path is service-role (edge fn), so claimers need no direct table access.
drop policy if exists handoffs_select on public.handoffs;
create policy handoffs_select on public.handoffs
  for select using (from_org_id in (select public.user_org_ids()));

drop policy if exists handoffs_insert on public.handoffs;
create policy handoffs_insert on public.handoffs
  for insert with check (from_org_id in (select public.user_org_ids()));

drop policy if exists handoffs_update on public.handoffs;
create policy handoffs_update on public.handoffs
  for update using (from_org_id in (select public.user_org_ids()))
  with check (from_org_id in (select public.user_org_ids()));
