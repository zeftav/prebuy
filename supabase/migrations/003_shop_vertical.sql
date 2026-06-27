-- 003_shop_vertical.sql — vertical lives on the SHOP (org), not per inspection.
-- Decision (Brett, 2026-06-27): a shop does one vertical (e.g. aviation). Someone
-- who does both planes and boats creates two shops under the same login (we
-- already support multiple shops per user). So the vertical is chosen once at
-- shop creation; inspections inherit it.
--
-- inspections.vertical (added in 002) stays — it's denormalized from the shop at
-- creation time so reports/queries don't need a join. RLS unchanged (org-scoped).

alter table public.orgs
  add column if not exists vertical text not null default 'aviation'
    check (vertical in ('aviation','marine','home','automotive'));
