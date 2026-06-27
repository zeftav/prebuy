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
- [x] ✅ `009_media_logbook_purpose.sql` — allow `media.purpose = 'logbook'` (OCR page scans). (2026-06-27)
- [x] ✅ `010_inspection_meta.sql` — `inspections.inspector_name` / `location` / `inspection_date`. (2026-06-27)
- [x] ✅ `011_generic_aviation_checklist.sql` — model-agnostic "General Aircraft" fallback template
      (drops NOT NULL on make/model, then seeds the generic template). (2026-06-27)
- [ ] ⬜ `012_seed_home_checklist.sql` — generic **home** inspection checklist (InterNACHI-based,
      ~101 items). **Run in the SQL editor** (pasted in chat).
- [ ] ⬜ `013_seed_marine_checklist.sql` — generic **boat** survey checklist (~56 items). **Run in the
      SQL editor** (pasted in chat). Order doesn't matter vs 012.

## 2. Edge functions (Supabase → Edge Functions)

- [x] ✅ `signup` — Verify JWT **OFF**. (Deployed; redeployed for `vertical`.)
- [x] ✅ `structure-finding` — Verify JWT **ON**. Powers "Clean up with AI". (2026-06-27)
- [x] ✅ `report` — Verify JWT **OFF**. Serves the public report at `/r/<token>`. (2026-06-27)
  - [x] ✅ Redeployed `report` for v0.12.0 (inspector/location/inspection-date). (2026-06-27)
  - [ ] 🔁 **REDEPLOY `report` for v0.13.0** — now also returns `inspection.profile` + `logbook_events`
        for the two-part report (Aircraft profile + maintenance timeline). JWT still **OFF**. No new
        migration (profile lives in the existing `inspections.attributes` JSONB).
- [x] ✅ `structure-logbook` — Verify JWT **ON**. Logbook OCR import (Claude vision). (2026-06-27)
  - [ ] 🔁 **REDEPLOY `structure-logbook` for v0.14.0** — vision now also extracts specs / currency /
        equipment for the Aircraft profile "Scan to pre-fill" (additive; logbook import unaffected).
        JWT still **ON**; reuses `ANTHROPIC_API_KEY`. No migration.
- [ ] ⬜ **DEPLOY `generate-summary`** (new, v0.15.0) — Verify JWT **ON**. Powers "Write with AI" on the
      Aircraft profile (broker-style narrative). Reuses `ANTHROPIC_API_KEY`; no migration.

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

- [x] ✅ **FAA full bulk-load** — done (2026-06-27). Repo secret `SUPABASE_DB_URL` set to the
      **Session pooler** string (IPv4-reachable from GitHub runners; the Direct host is IPv6-only and
      hit `ENETUNREACH`). GitHub **Actions → "Load FAA registry"** loaded ~300k aircraft; re-runs
      monthly on the cron. Steps + the 403/IPv6 gotchas in `docs/faa-load.md`.
- [x] ✅ **`app.prebuy.app` live** (2026-06-27) — Cloudflare Pages custom domain added + Supabase Auth
      URLs updated. SPA now serves at `app.prebuy.app`; report links + auth redirects follow the origin
      automatically (no code change). Apex `prebuy.app` reserved for the marketing/landing page.
      ⬜ Still: verify `prebuy.app` in Resend (for email); point the **apex** at the landing page once built.
- [ ] ⬜ **Marketing/landing page** at the apex (basic product page, à la yellowtag.app) with a CTA
      into `app.prebuy.app`. See `docs/backlog.md` → Marketing site.

---

_Keep this current: when a new migration/function/secret lands, add it here with ⬜ and note it in
the chat/PR so it doesn't get missed._
