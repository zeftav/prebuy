# Deploy checklist — pending manual steps

Single place for the manual steps that have to happen in the Supabase / Cloudflare
dashboards (the app code is already on `main`). Work top to bottom. Each migration's
full SQL is in `supabase/migrations/<file>` — open the file and paste it into the
Supabase **SQL editor**. Edge-function bodies are in `supabase/functions/<name>/index.ts`.

Update the checkboxes as you go.

> **Status legend:** ✅ done · ⬜ pending · 🔁 needs re-running/redeploy

## 1. Database migrations (Supabase → SQL editor)

Run in order. All are idempotent (safe to re-run).

- [x] ✅ `001_init.sql` — schema + RLS
- [x] ✅ `002_verticals.sql` — generic vertical/identifier/attributes
- [x] ✅ `003_shop_vertical.sql` — `orgs.vertical`
- [x] ✅ `004_faa_registry.sql` — FAA tables + N3704A fixture
- [x] ✅ `005_seed_a36_checklist.sql` — A36 Bonanza checklist (template + ~30 items). (2026-06-27)
- [x] ✅ `006_media_storage.sql` — photos: `media.purpose` + private bucket + Storage policies. (2026-06-27)
- [x] ✅ `007_owner_priority.sql` — `inspection_items.owner_priority`. (2026-06-27)
- [x] ✅ `008_logbooks.sql` — `logbooks` + `logbook_events` tables. (2026-06-27)
- [ ] ⬜ `009_media_logbook_purpose.sql` — allow `media.purpose = 'logbook'` (for OCR page scans).
- [ ] ⬜ `010_inspection_meta.sql` — `inspections.inspector_name` / `location` / `inspection_date`
      (report header: who/where/when).

## 2. Edge functions (Supabase → Edge Functions)

- [x] ✅ `signup` — Verify JWT **OFF**. (Deployed; redeployed for `vertical`.)
- [x] ✅ `structure-finding` — Verify JWT **ON**. Powers "Clean up with AI". (2026-06-27)
- [x] ✅ `report` — Verify JWT **OFF**. Serves the public report at `/r/<token>`. (2026-06-27)
  - [ ] 🔁 **Redeploy** `report` — updated in v0.12.0 to include inspector/location/inspection-date.
- [ ] ⬜ `structure-logbook` — Verify JWT **ON**. Paste from `supabase/functions/structure-logbook/index.ts`.
      Logbook OCR import (Claude vision). Reuses `ANTHROPIC_API_KEY` (no new secret).

## 3. Secrets (Supabase → Edge Functions → Secrets)

- [x] ✅ `ANTHROPIC_API_KEY` — set; used by `structure-finding`. (2026-06-27)

## 4. After 1–3: smoke test (in the live app)

- [ ] Open the **N3704A** inspection → checklist appears, risk-ordered.
- [ ] Mark an item, **Dictate** a note, **Clean up with AI** → returns a finding + severity.
- [ ] **Add photo** on an item, and run the **Photo walkthrough** → thumbnails appear.

## 5. Before real shops sign up (not blocking dev)

- [ ] ⬜ **Resend SMTP** for auth email (confirm/reset/invite). Steps in `docs/deploy.md` → Email.
      Verify `prebuy.app` domain in Resend. (Built-in sender is fine for your own testing.)
- [ ] ⬜ (optional) **Confirm-email** toggle: Authentication → Providers → Email. OFF = instant
      session while testing; ON = users must click a link (the app handles both).

## 6. Optional / when ready

- [ ] ⬜ **FAA full bulk-load** — pour the full ~300k-aircraft dataset into `faa_registry` /
      `faa_aircraft_ref`. Procedure is in the comments at the bottom of `004_faa_registry.sql`
      (download FAA releasable ZIP → COPY MASTER/ACFTREF → upsert trimmed columns). The N3704A
      fixture covers testing until then.
- [x] ✅ **`app.prebuy.app` live** (2026-06-27) — Cloudflare Pages custom domain added + Supabase Auth
      URLs updated. SPA now serves at `app.prebuy.app`; report links + auth redirects follow the origin
      automatically (no code change). Apex `prebuy.app` reserved for the marketing/landing page.
      ⬜ Still: verify `prebuy.app` in Resend (for email); point the **apex** at the landing page once built.
- [ ] ⬜ **Marketing/landing page** at the apex (basic product page, à la yellowtag.app) with a CTA
      into `app.prebuy.app`. See `docs/backlog.md` → Marketing site.

---

_Keep this current: when a new migration/function/secret lands, add it here with ⬜ and note it in
the chat/PR so it doesn't get missed._
