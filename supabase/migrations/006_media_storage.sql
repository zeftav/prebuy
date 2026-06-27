-- 006_media_storage.sql — photo/video capture: media.purpose + a private Storage
-- bucket with org-scoped access.
--
-- Two photo modes (see docs/backlog.md):
--   • 'overview'    — early guided shot list documenting the whole asset (linked to
--                     the inspection, not an item).
--   • 'discrepancy' — photos of a specific finding (linked to an inspection_item).
--
-- Files live in a PRIVATE bucket, pathed `<org_id>/<inspection_id>/<file>` so a
-- single storage policy can scope access by the org folder. The `media` table
-- (001) already has org-scoped RLS; this adds the Storage-side policies.

-- Distinguish the two photo modes.
alter table public.media
  add column if not exists purpose text not null default 'discrepancy'
    check (purpose in ('overview', 'discrepancy'));

-- Private bucket (no public URLs — the app serves signed URLs).
insert into storage.buckets (id, name, public)
values ('inspection-media', 'inspection-media', false)
on conflict (id) do nothing;

-- Org-scoped Storage policies: a user may touch an object only when its top path
-- segment (the org_id) is one of their orgs. Cast to uuid so a non-uuid prefix
-- fails closed. Idempotent via drop-if-exists.
drop policy if exists "inspection_media_read"   on storage.objects;
drop policy if exists "inspection_media_insert" on storage.objects;
drop policy if exists "inspection_media_delete" on storage.objects;

create policy "inspection_media_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'inspection-media'
    and (storage.foldername(name))[1]::uuid in (select public.user_org_ids())
  );

create policy "inspection_media_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'inspection-media'
    and (storage.foldername(name))[1]::uuid in (select public.user_org_ids())
  );

create policy "inspection_media_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'inspection-media'
    and (storage.foldername(name))[1]::uuid in (select public.user_org_ids())
  );
