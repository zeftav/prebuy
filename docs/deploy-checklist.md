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
- [x] ✅ `012_seed_home_checklist.sql` — generic **home** inspection checklist (InterNACHI-based,
      ~101 items). (2026-06-28)
- [x] ✅ `013_seed_marine_checklist.sql` — generic **boat** survey checklist (~56 items). (2026-06-28)
- [x] ✅ `014_logbook_position.sql` — `position` on `logbooks` + `logbook_events` (per-engine logbook
      tracking). (2026-06-28)
- [x] ✅ `015_media_attachments.sql` — `media.kind`+= 'document', `media.purpose`+= 'attachment'
      (oil-analysis / doc uploads on items). (2026-06-28)
- [x] ✅ Redeployed `report` (JWT OFF) — event `position` (timeline engine labels) + per-item
      `attachments`. (2026-06-28)
- [x] ✅ `016_inspection_mode.sql` — `inspections.mode` + `source_inspection_id` (broker listings), and
      `report` redeployed (JWT OFF) so listings publish as a listing/spec-sheet. (2026-06-28)
- [x] ✅ `017_handoffs.sql` — `handoffs` table + RLS (cross-org broker handoff), and **`claim-listing`**
      edge fn deployed (JWT ON). Powers `/claim/:token`. (2026-06-28)
- [x] ✅ `018_marine_mic.sql` — `marine_mic` reference table + RLS read (powers the **boat HIN lookup**;
      builder from MIC). Seeds TEST fixtures only. No edge fn. (run 2026-06-28)
- [x] ✅ `019_super_admin.sql` — `super_admins` table + `is_super_admin()` RPC + `ai_usage` log table
      (powers the **platform-owner dashboard**). RLS on, no client policies. (run 2026-06-28)
- [x] ✅ `020_marine_mic_seed.sql` — Hunter Marine seed. **Superseded** by the full USCG MIC load
      (GitHub Action "Load USCG MIC list" ran 2026-06-28; ~16k builders; auto-refresh quarterly), so
      running 020 is unnecessary.
- [x] ✅ `021_inspection_followups.sql` — `inspection_followups` table + org-scoped RLS (per-inspection
      "to-investigate" list). Idempotent. (v0.32.0, 2026-06-28)
- [x] ✅ `022_media_logbook_pdf.sql` — `media.sort_order` / `rotation` / `show_on_report` + `logbook_pdf`
      purpose (logbook page manager + compiled PDF). Idempotent. (v0.34.0, 2026-06-28)
- [x] ✅ `023_media_logbook_link.sql` — `media.logbook_id` (per-logbook scans/PDFs). Idempotent.
      (v0.35.0, 2026-06-29)
- [x] ✅ `024_logbook_record_kinds.sql` — extend `logbooks.kind` with `ad` + `form_337` (scan AD reports
      & 337s as their own records). Idempotent. (v0.36.0, 2026-06-29)
- [x] ✅ `025_logbook_review_note.sql` — `logbooks.review_note` (flag what a scan couldn't read).
      Idempotent. (v0.37.0, 2026-06-29)
- [x] ✅ `026_org_type.sql` — `orgs.org_type` (inspector/broker/both; default inspector). Idempotent.
      (v0.38.0, 2026-06-29)
- [x] ✅ `027_checklist_phase.sql` — `phase` on `template_items` + `inspection_items` (two-phase
      inspections). Idempotent. (v0.39.0, 2026-06-30)
- [x] ✅ `028_records_onboarding.sql` — `inspections.mode` += 'records' + `logbook_parts` table
      (searchable part numbers). Idempotent. (v0.40.0, 2026-06-30)
- [x] ✅ `029_logbook_source_page.sql` — `source_page` on `logbook_events` + `logbook_parts` (hotlink
      each record to its logbook PDF page). Idempotent. (v0.46.0, 2026-08-03)
- [x] ✅ `030_logbook_event_next_due.sql` — `next_due_date` / `next_due_hours` on `logbook_events`
      (AD next-due on the AD compliance chart). Idempotent. (v0.47.0, 2026-08-03)
- [x] ✅ `031_report_revisions.sql` — `report_revisions` table + `inspections.current_revision`
      (published report versioning). Org-scoped RLS. Idempotent. (v0.49.0, 2026-08-03)
- [x] ✅ `032_report_visibility.sql` — `show_on_report` on `logbook_events` (default true) + `logbook_parts`
      (default false) — per-record report curation. Idempotent. (v0.53.0, 2026-08-03)
- [ ] ⬜ `033_events_report_default_off.sql` — flip `logbook_events.show_on_report` default → false + reset
      existing to hidden (events now opt-in on the report). Idempotent. **No report redeploy.** (v0.53.1, 2026-08-03)

## 2. Edge functions (Supabase → Edge Functions)

- [x] ✅ `signup` — Verify JWT **OFF**. (Deployed; redeployed for `vertical`.)
  - [x] ✅ **REDEPLOYED `signup` (JWT OFF) for v0.38.0** (2026-06-29) — persists `org_type` (inspector/broker/both).
- [x] ✅ `structure-finding` — Verify JWT **ON**. Powers "Clean up with AI". (2026-06-27)
- [x] ✅ `report` — Verify JWT **OFF**. Serves the public report at `/r/<token>`. (2026-06-27)
  - [x] ✅ Redeployed `report` for v0.12.0 (inspector/location/inspection-date). (2026-06-27)
  - [x] ✅ Redeployed `report` for v0.13.0 (profile + logbook_events) — and many times since
        (latest covers follow-ups + per-logbook PDFs). JWT **OFF**.
- [x] ✅ `structure-logbook` — Verify JWT **ON**. Logbook OCR import (Claude vision). (2026-06-27)
  - [x] ✅ Redeployed `structure-logbook` for v0.14.0 (scan-to-pre-fill specs/currency/equipment). (2026-06-27)
  - [x] ✅ **REDEPLOYED `structure-logbook` (JWT ON) for v0.36.0** (2026-06-29) — context-aware reads
        (engine/prop report their own time; AD/337 read as events).
  - [x] ✅ **REDEPLOYED `structure-logbook` (JWT ON) for v0.37.0** (2026-06-29) — returns `unclear`
        (flags illegible reads → logbook "verify against PDF" advisory).
  - [x] ✅ **REDEPLOYED `structure-logbook` (JWT ON) for v0.40.0** (2026-06-30) — also returns `parts`
        (searchable part numbers). Needs migration 028.
  - [x] ✅ **REDEPLOYED `structure-logbook` (JWT ON) for v0.45.0 + v0.46.0** (2026-08-03) — returns
        `compliance` (recurring inspection dates → auto-fills the Timed-items tool) + `limits` (MM
        life-limited scan) [v0.45.0], and a `page` per event/part for the PDF-page hotlinks [v0.46.0].
        Migration 029 also run. Reuses `ANTHROPIC_API_KEY`.
  - [x] ✅ **REDEPLOYED `structure-logbook` (JWT ON) for v0.47.0** (2026-08-03) — AD events now carry
        `next_due_date` / `next_due_hours` (AD next-due on the chart). Migration 030 also run. Reuses
        `ANTHROPIC_API_KEY`.
  - [x] ✅ **REDEPLOYED `structure-logbook` (JWT ON) for v0.55.0** (2026-08-05) — accepts an optional
        `pdf_url` and reads it as a document input (the MM life-limited scan now takes a **PDF** upload,
        not just photos). No migration; reuses `ANTHROPIC_API_KEY`.
  - [x] ✅ **REDEPLOYED `structure-logbook` (JWT ON) for v0.59.0** (2026-08-06) — prefixes each `unclear`
        note with `"p.N — …"` so the "hard to read" review flag can hotlink each item to its PDF page. No
        migration; reuses `ANTHROPIC_API_KEY`.
- [x] ✅ **REDEPLOYED `report` (JWT OFF) for v0.48.0 + v0.49.0 + v0.50.0** (2026-08-03) — **report
      revisions** (serve latest frozen snapshot + self-verifying `publish` action), `kind` on media
      (**video** on the report), and `inspection.compression` (**compression table**). Migration 031 also
      run. Stays JWT OFF (publish self-verifies the Bearer).
- [x] ✅ **REDEPLOYED `report` (JWT OFF) for v0.51.0** (2026-08-03) — returns `caption` on item photos so
      **borescope images group per cylinder** on the report. No migration.
- [x] ✅ **REDEPLOYED `report` (JWT OFF) for v0.53.0** (2026-08-03) — filters held notable events, returns
      opted-in **parts/components** ("Components & parts" section). Migration 032 also run.
- [x] ✅ **`generate-summary`** (new, v0.15.0) — Verify JWT **ON**. "Write with AI" broker narrative.
      Reuses `ANTHROPIC_API_KEY`. (2026-06-27)
- [x] ✅ **`research-asset`** (new, v0.30.0) — Verify JWT **ON**. "Research with AI" — drafts the profile
      from make/model via Claude + web search. Reuses `ANTHROPIC_API_KEY`. (deployed 2026-06-28)
  - [x] ✅ Redeployed `research-asset` (JWT ON) for v0.30.3 — low effort + fewer searches (no timeout). (2026-06-28)
- [x] ✅ **`structure-walkaround`** (new, v0.31.0) — Verify JWT **ON**. Dictate-the-whole-walk-around →
      parsed/mapped findings. Reuses `ANTHROPIC_API_KEY`. (deployed 2026-06-28)
  - [x] ✅ **REDEPLOYED `report` (JWT OFF) for v0.32.0 + v0.34.0 + v0.35.0** (2026-06-29) — returns report-visible
        follow-ups ("Recommended for further evaluation") and inspection-level `documents` (compiled
        logbook PDFs flagged "Show on report" → Records section; v0.35.0 makes these per-logbook, no
        further fn change). One redeploy covers all. (needs migrations 021 + 022 + 023)
- [x] ✅ **REDEPLOYED `structure-finding`, `structure-logbook`, `generate-summary`** (v0.27.0) — all
      three now log token usage to `ai_usage` (fire-and-forget, service role) for the platform AI-cost
      view. JWT **ON**. (2026-06-28)
- [x] ✅ **`admin-orgs`** (new, v0.27.0/0.27.1) — JWT **ON**. Platform-owner shop list + engagement +
      roster + rename/delete + `org_detail` support view. (deployed 2026-06-28)
- [x] ✅ **`admin-ai-cost`** (new, v0.27.0) — JWT **ON**. Aggregates `ai_usage` → estimated cost.
      (deployed 2026-06-28)
- [x] ✅ **`parse-checklist`** (new, v0.39.0) — Verify JWT **ON**. (deployed 2026-06-30) Uploaded checklist PDF → phase-tagged
      items (Claude document input). Reuses `ANTHROPIC_API_KEY`. Needs migration 027. (2026-06-30)
- [x] ✅ **REDEPLOYED `report` (JWT OFF) for v0.39.0** (2026-06-30) — also returns `inspection.gear_rigging` (Beech
      gear-rigging table on the report). No migration (lives in `attributes`). (2026-06-30)
- [ ] 🔁 **REDEPLOY `report` (JWT OFF) for v0.43.0** — also returns `inspection.compliance` (timed-items /
      compliance table on the report). No migration (lives in `attributes`). (2026-08-03)

## 3. Secrets (Supabase → Edge Functions → Secrets)

- [x] ✅ `ANTHROPIC_API_KEY` — set; used by `structure-finding`. (2026-06-27)

## 4. After 1–3: smoke test (in the live app)

- [ ] Open the **N3704A** inspection → checklist appears, risk-ordered.
- [ ] Mark an item, **Dictate** a note, **Clean up with AI** → returns a finding + severity.
- [ ] **Add photo** on an item, and run the **Photo walkthrough** → thumbnails appear.

## 5. Before real shops sign up (not blocking dev)

- [x] ✅ **Resend SMTP** for auth email (confirm/reset/invite) — live (2026-06-28). `prebuy.app`
      verified in Resend (Cloudflare integration); Supabase custom SMTP → `smtp.resend.com:465`,
      username `resend`, sender `noreply@prebuy.app`. Password reset tested end-to-end. (Gotcha: a typo
      in the SMTP username → `535 "Invalid username"`; it must be exactly `resend`.)
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
- [x] ✅ **USCG MIC bulk-load** (boat builder lookup) — done (2026-06-28): Actions → "Load USCG MIC list"
      loaded the official `uscgboating.org/downloads/MIC.csv` (~16k builders). Needed `ENCODING 'WIN1252'`
      (file is Windows-1252; 0x91 smart quotes). Quarterly auto-refresh keeps it current.

---

_Keep this current: when a new migration/function/secret lands, add it here with ⬜ and note it in
the chat/PR so it doesn't get missed._
