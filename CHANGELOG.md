# Changelog

All notable changes that hit `main` (production) are recorded here.
User-facing entries are also summarized in-app (see `src/lib/releases.js`).

## [0.23.0] — 2026-06-28

### Added
- **Broker listings (Phase 1 of the broker epic).** A job now has a **mode** — `inspection` (full) or
  `listing` (broker, capture-only). Mode is per-job, so a shop can do both.
  - `supabase/migrations/016_inspection_mode.sql` — `inspections.mode` ('inspection'|'listing') +
    `source_inspection_id` (handoff lineage). **Needs running.**
  - New form (`NewInspection`) — pick "Pre-purchase inspection" or "Broker listing."
  - `checklist.js` — listings skip checklist instantiation; `getInspection` returns `mode` +
    `source_inspection_id`.
  - `InspectionDetail` — listing layout: capture tools (profile/photos/logbooks) + publish, no
    checklist; **"Start inspection from this listing"** handoff (same org) via
    `startInspectionFromListing` — clones profile/attributes + overview media + logbooks/events into a
    new full inspection. `inspections.js` +test (mode).
  - `report` edge fn + `ReportView` — listings publish as a single-purpose **listing/spec-sheet**
    (report Part 1 only; findings half suppressed; title "<Asset> Listing"). **Redeploy `report` (JWT OFF).**
  - Dashboard tags listings.

### Notes
- **Cross-org handoff** (broker → a *different* inspecting shop: shop directory + invite + storage copy +
  claim) is Phase 2 — see `docs/backlog.md`. This ships the listing workflow + same-org handoff.

## [0.22.1] — 2026-06-28

### Changed
- **Multiple photos per overview shot.** `OverviewCapture` now groups overview media by caption (a shot
  can hold many photos) instead of one-per-shot. Guided run: "Keep & add another" vs "Keep & continue";
  the per-shot list shows all thumbs with individual delete + an "Add another" picker. No DB change
  (already multiple `media` rows; the one-per-caption assumption was only in the UI). The report gallery
  already renders all overview photos. Frontend only.

## [0.22.0] — 2026-06-28

### Added
- **One-button guided photo walkthrough** (additive — the per-shot list stays). Frontend only; no
  migration/redeploy.
  - `verticals.js` — `guidedCapture: 'full' | 'exterior' | 'off'` per vertical (aviation/marine `full`,
    home `exterior`) + pure `guidedShots(key)` (full list, or exterior+roof only for homes). Tests +.
  - `OverviewCapture.jsx` — "Start guided walkthrough" enters a run mode that steps through the shots
    one at a time: prompt + camera/upload → local preview → **Keep & continue** (auto-advances) or
    **Retake**; **Skip**; **Replace** when a shot already exists; resumes at the first missing shot;
    progress "Shot X of N". Uploads on accept (object-URL preview, no orphan uploads). Home shows a note
    that interior/system shots are added freeform.
  - Help FAQ updated.

## [0.21.0] — 2026-06-28

### Added
- **Document attachments on inspection items** (e.g. oil-analysis lab PDFs on the engine item).
  - `supabase/migrations/015_media_attachments.sql` — `media.kind` adds `document`, `media.purpose` adds
    `attachment`. **Needs running.**
  - `lib/media.js` — `mediaKind` returns `document` for non-image/video MIME (PDF etc.); upload stores the
    original filename in `caption`. Test updated.
  - `InspectionDetail` — "Attach file" (PDF/image) on each item alongside "Add photo"; photos render as
    thumbnails, documents as download links (delete supported).
  - `report` edge fn + `ReportView` — per-item `attachments` (signed URL + filename) returned and rendered
    on findings and on cleared items. **Redeploy `report` (JWT OFF)** — same fn as v0.20.0, so one
    redeploy covers both.
  - Help FAQ entry added.

## [0.20.0] — 2026-06-28

### Added
- **Multi-engine round 2 — logbook position + per-engine checklist fan-out.**
  - `supabase/migrations/014_logbook_position.sql` — `position smallint` on `logbooks` +
    `logbook_events`. **Needs running.**
  - `lib/logbooks.js` — `reconcileLogbooks(logbooks, {engineCount, layout})` now returns position-aware
    `groups` (engine/prop split by position on a twin; airframe/other by kind) instead of `byKind`;
    new pure `groupLabel`; `POSITIONAL_KINDS`; CRUD carries `position`. Tests +.
  - `lib/checklist.js` — pure `fanOutTemplateItems` duplicates aviation Engine/Propeller template items
    per engine at instantiation (title suffixed `— Engine #1 (Left)` etc.), single-engine/non-aviation
    unchanged; `ensureInspectionItems` uses it (engine count from profile/attributes). Tests +.
  - `LogbookAudit` — engine/prop position pickers on the add-logbook + add-event forms (shown on a twin),
    per-engine reconciliation panel, and position labels in the lists.
  - `report` edge fn + `ReportView` — events carry `position`; the maintenance timeline shows the engine
    label. **Redeploy `report` (JWT OFF).** No other deploy.

## [0.19.2] — 2026-06-27

### Fixed
- **Mobile horizontal overflow (app-wide).** `box-sizing: border-box` was only set on `#root`, so
  `.home` (and any `width:100%` + padding element) rendered 32px wider than the viewport → iOS Safari
  zoomed out on load. Added a global `*, *::before, *::after { box-sizing: border-box }` in `index.css`.
- **Stray edge lines on phones.** `#root`'s `border-inline` (the desktop framed-column look) now drops
  to `0` under 600px, so there are no hairlines down the screen edges on mobile.

## [0.19.1] — 2026-06-27

### Fixed
- **Landing page mobile styling.** Added a `max-width: 600px` block in `App.css`: hide the "How it
  works" nav anchor + tighten the top bar, smaller hero type/padding, full-width stacked CTAs, and
  tighter section/who/CTA-band spacing. Tagged the anchor `home__navhow` in `Home.jsx`.

## [0.19.0] — 2026-06-27

### Added
- **Home & marine verticals with seeded checklists.**
  - `src/lib/verticals.js` — new **home** vertical (identifier = address, manual; overview shot list)
    added to `VERTICAL_OPTIONS` (now aviation · marine · home; surfaces in Create Shop automatically).
    `validateIdentifier` no longer upper-cases/strips free-text identifiers (addresses keep spaces/case);
    codes (N-number, HIN) still normalize. Tests updated (+1).
  - `supabase/seed/inspection-guidelines.json` — committed source data (InterNACHI home SoP, Oct 2022,
    rephrased/free-use; synthesized marine pre-purchase scope from ABYC domains).
  - `scripts/seed/gen-checklist-sql.mjs` — generator that turns the JSON into the two seed migrations
    (area → category; `inspect`→item, `describe`→"Record: …", `report_if`→defect-check item;
    `not_required`/limitations kept in JSON for a future scope drawer, not seeded as tasks). PreBuy-
    authored per-area risk weights drive the existing risk ordering.
  - `supabase/migrations/012_seed_home_checklist.sql` (~101 items) + `013_seed_marine_checklist.sql`
    (~56 items) — global fallback templates (`model IS NULL`) for the home/marine verticals; slot into
    the existing instantiate → capture → report flow with no engine changes. **Both need running.**

## [0.18.0] — 2026-06-27

### Added
- **Landing page.** `src/pages/Home.jsx` rebuilt into a real marketing front page (hero + CTA, a
  "how it works" 5-step flow, a feature grid, who-it's-for, and a closing CTA band); styles in
  `App.css`. Serves at `/` for both `app.prebuy.app` and the apex until a separate site exists.
  Frontend only.

### Backlog
- Noted **inspection search/filter** (Dashboard, for shops with many inspections) in `docs/backlog.md`.

## [0.17.0] — 2026-06-27

### Added
- **Multi-engine aircraft** — engines & props are now a position-indexed set (frontend only; the
  profile lives in the existing `attributes.profile` JSONB — no migration, no edge-fn redeploy).
  - `lib/profile.js` — profile gains `engine_count` + `layout` (`conventional` L/R · `centerline`
    front/rear for the Cessna 337) and `engines[]` / `props[]` arrays; airframe specs stay single.
    `normalizeProfile` resizes arrays to `engine_count` and **migrates legacy single-engine profiles**
    (flat `engine_smoh`/`prop_since` → slot #1). New pure `engineLabel`/`propLabel`/`fieldRows`,
    updated `draftFromExtraction`/`mergeProfileDraft`/`buildSummaryContext`. Tests +13 (98 total).
  - `lib/aircraft.js` — FAA lookup now returns `engine_count` (from `faa_aircraft_ref.num_eng`);
    `lib/inspections.js` seeds it into `attributes.engine_count` at creation (NewInspection passes it).
  - `AircraftProfile.jsx` — engine-count selector + layout, a card per engine (with its prop), and the
    scan-to-pre-fill review now has Engine/Prop groups (fills engine #1).
  - `ReportView.jsx` — Part 1 renders an "Engines & propellers" section, one labeled block per engine.

### Known gaps (tracked in docs/backlog.md → Multi-engine)
- Logbook **position** (per-engine reconcile) and **per-engine checklist fan-out** are the next
  increment; the scan currently attributes engine specs to engine #1.

## [0.16.0] — 2026-06-27

### Added
- **Generic fallback checklist** — every aircraft inspection now gets a checklist.
  - `supabase/migrations/011_generic_aviation_checklist.sql` — a model-agnostic, risk-weighted
    "General Aircraft — Pre-Purchase Survey" global template (identified by `vertical='aviation'` +
    `model IS NULL`), ~27 original items (records → engine → prop → structure → gear → systems → flight).
    **Needs running.**
  - `lib/checklist.js` `findTemplateFor` now falls back: model-specific template first (e.g. A36),
    else the vertical's generic template. `ensureInspectionItems` threads a `generic` flag; the
    inspection shows a "started you on the general aircraft survey" notice when the fallback is used.
- **Notes field on custom items** — the "Add item" form now has a "Notes / what to check" textarea
  (maps to the item's `description`, shown as guidance on the item). `addCustomItem` accepts it.

### Changed
- **Photo inputs: take OR upload, on desktop + mobile.** New shared `src/components/PhotoPicker.jsx`
  renders two buttons — a camera input (`capture="environment"`) and a plain file input (no `capture`,
  opens the library/file picker). Replaces the single `capture`-forced inputs in InspectionDetail
  (discrepancy photos), OverviewCapture (walkthrough), AircraftProfile (scan to pre-fill), and
  LogbookAudit (scan pages). Frontend only — no deploy/migration.

## [0.15.0] — 2026-06-27

### Added
- **Broker-style narrative generator** — "Write with AI" on the Aircraft profile drafts the report's
  opening summary from the structured data.
  - `supabase/functions/generate-summary/index.ts` — new edge fn (**JWT ON**, reuses
    `ANTHROPIC_API_KEY`, `claude-opus-4-8` + structured output `{ summary }`). The client sends the
    assembled context (no DB access in the fn). Original prose grounded only in the provided facts —
    balanced (strengths + open discrepancies), no invented figures, never copied from a listing.
    **Deploy required (JWT ON).** No migration.
  - `src/lib/profile.js` — pure `buildSummaryContext(inspection, profile, events, items)` (assembles
    asset + non-empty specs/currency/damage/equipment + notable maintenance + findings/counts; +3
    tests) and `generateNarrative(context)` (edge call).
  - `src/pages/AircraftProfile.jsx` — "Write with AI" button on the Summary section: lazily loads
    items + events, builds the context, fills the editable Summary box (review before Save).
  - `src/pages/Help.jsx` — FAQ entries for the Aircraft profile / two-part report, scan-to-pre-fill,
    and AI summary.

## [0.14.0] — 2026-06-27

### Added
- **Scan-to-pre-fill the Aircraft Profile** (beta) — extend the logbook vision pass to also draft the
  spec sheet.
  - `structure-logbook` edge fn — schema + prompt now also extract `specs`, `currency`, and a
    categorized `equipment` list (avionics + additional) alongside logbooks/events; `max_tokens`
    raised to 8192. Backward-compatible (Logbook audit ignores the new fields). **Redeploy required
    (JWT ON).**
  - `src/lib/profile.js` — `extractProfile(imageUrls)` calls the edge fn; pure `draftFromExtraction`
    (numbers→strings, drop 0/blank, filter nameless equipment) and `mergeProfileDraft` (fill blanks
    only — never clobber existing values; append equipment deduped by name). +tests (+5).
  - `src/pages/AircraftProfile.jsx` — new "Scan to pre-fill" section: photograph records → review
    proposed specs/currency/equipment (tick to keep) → merged into the form for review before Save.
    Reuses the private media upload + signed-URL flow.

## [0.13.0] — 2026-06-27

### Added
- **Aircraft Profile + two-part customer report.** The report is now a professional document:
  Part 1 *Aircraft profile* (spec sheet) → Part 2 *Inspection findings*.
  - `src/lib/profile.js` — canonical profile shape stored on `inspections.attributes.profile`
    (no migration; `attributes` is an existing JSONB bag): narrative summary, specs & times,
    currency/due dates, damage history, categorized equipment (avionics + additional). Pure
    helpers — `normalizeProfile`, `isProfileEmpty`, `profileRows`, `formatSpecValue`,
    `currencyStatus` (overdue / due-soon / ok) — with tests (`profile.test.js`, +12).
  - `src/pages/AircraftProfile.jsx` — editor at `/app/inspections/:id/profile`; linked from the
    inspection tools row. Inline help via `InfoDot`.
  - `report` edge fn — now returns `inspection.profile` and the `logbook_events` (newest first) so
    the report can render the spec sheet + a dated maintenance timeline. **Redeploy required (JWT OFF).**
  - `src/pages/ReportView.jsx` — redesigned into the two-part layout: spec/currency cards (with
    overdue/due-soon flags), explicit damage callout (or a clean "no damage history" note),
    maintenance timeline, categorized equipment, photo gallery, then the existing findings. Part 1
    blocks render only when they have data, so legacy reports degrade to just the findings.

## [0.12.1] — 2026-06-27

### Fixed
- **Version + "What's new" footer is now app-wide.** Extracted it into `src/components/AppFooter.jsx`
  and render it once globally in `App.jsx` (pinned to the bottom via an `.app__content` flex wrapper),
  so every in-app page carries it — previously it was only on Home. Hidden on the public report
  (`/r/:token`). Removed Home's duplicate footer + stale status line.

## [0.12.0] — 2026-06-27

### Added
- **Inspection provenance on the report** — who / where / when.
  - `supabase/migrations/010_inspection_meta.sql` — `inspections.inspector_name`, `location`,
    `inspection_date`.
  - Captured on the New Inspection form and editable any time from the inspection (an "inspection
    details" card); `lib/inspections.js` `updateInspectionMeta`.
  - `report` edge fn returns them; `ReportView` shows Inspected-by / Location / Inspection-date in the
    report header (date prefers the recorded inspection date, falls back to publish date).
  - **Redeploy `report`** + run migration 010.

## [0.11.0] — 2026-06-27

### Added
- **Logbook OCR import (beta)** — photograph logbook pages → Claude vision → draft → review → import.
  - `supabase/migrations/009_media_logbook_purpose.sql` — allow `media.purpose = 'logbook'`.
  - `supabase/functions/structure-logbook/index.ts` — vision edge fn (**Verify JWT ON**, reuses
    `ANTHROPIC_API_KEY`): page images → structured draft of logbooks + notable maintenance events.
  - `src/lib/logbooks.js` `extractLogbooks` + pure `cleanDraftValue` (+ test); `src/lib/media.js`
    `signedUrlsFor`.
  - `LogbookAudit` gains a "Scan & import" section: upload pages → review proposed logbooks/events
    with tick-to-keep → import the selected ones.
- **Docs/backlog:** logbook-scan extraction targets (broker-style notable-event highlighting; a
  summarized equipment list as an aside) and a **marketing/landing-page** epic (apex `prebuy.app`,
  app at `app.prebuy.app`).

## [0.10.0] — 2026-06-27

### Added
- **Logbook audit / research tool** (structured first slice).
  - `supabase/migrations/008_logbooks.sql` — `logbooks` (per-type, with date + tach spans) and
    `logbook_events` tables, org-scoped RLS.
  - `src/lib/logbooks.js` — `reconcileLogbooks` / `summarizeKind`: per-type sort + gap/overlap
    detection + tracked-hours totals (+ tests); CRUD for logbooks and events.
  - `src/pages/LogbookAudit.jsx` (`/app/inspections/:id/logbooks`) — add logbooks, a reconciliation
    panel (tracked hours + gap/overlap warnings per type), and notable events (AD / 337 / overhaul /
    prop-strike / damage). Linked from the inspection via a new tools row.
  - `/help` logbook entry; backlog logs the **photo→OCR import** follow-up (Claude vision).

## [0.9.0] — 2026-06-27

### Added
- **Report stage** — publish an inspection to a customer-facing report (workflow stage 5).
  - `supabase/functions/report/index.ts` — public edge fn (**Verify JWT OFF**, service role) that
    returns a *published* inspection by `share_token` (drafts 404), with media as signed URLs.
  - `src/lib/report.js` — `publishInspection` / `unpublishInspection`, `reportUrl`, `fetchReport`,
    and a pure `reportSummary` (+ tests). `getInspection` now selects `share_token` + `published_at`.
  - `src/pages/ReportView.jsx` (`/r/:token`, public) — read-only report: summary counts, findings
    grouped (discrepancies → monitor → checked-OK) and risk-ordered, per-finding + overview photos,
    "Print / Save PDF" via the browser. Print-optimized (`report.css`).
  - `InspectionDetail` — Publish / Unpublish bar with a copyable share link + "View report".
  - `/help` report entry.

## [0.8.0] — 2026-06-27

### Added
- **Customization stage** — shops tailor the per-job checklist.
  - `supabase/migrations/007_owner_priority.sql` — `inspection_items.owner_priority`.
  - `src/lib/risk.js` — owner-priority items float to the top within their status band (+ tests).
  - `src/lib/checklist.js` — `addCustomItem` / `deleteInspectionItem`; item select now carries
    `template_item_id` + `owner_priority`.
  - `InspectionDetail` — flag an item as owner priority, add a custom item (title/category/priority
    band High·Med·Low → risk weight, optional owner-priority), and delete custom (non-template) items.

## [0.7.0] — 2026-06-27

### Added
- **Capture — photos** (workflow stage 4, part 2): a private Storage bucket + two photo modes.
  - `supabase/migrations/006_media_storage.sql` — adds `media.purpose` ('overview' | 'discrepancy'),
    creates the private `inspection-media` bucket, and org-scoped Storage policies (object path
    `<org_id>/<inspection_id>/<file>`).
  - `src/lib/media.js` — upload (with orphan cleanup), list with signed URLs, delete; pure
    `sanitizeFilename` / `mediaStoragePath` / `mediaKind` (+ tests).
  - **Guided overview capture** (`/app/inspections/:id/overview`) — a prompted, per-vertical shot
    list (aircraft ~15 angles; boat ~10) of big-picture documentation photos, with progress + retake.
    Shot lists live on the vertical registry (`overviewShots`).
  - **Per-item discrepancy photos** — "Add photo" on each checklist item with thumbnails + delete.
  - `/help` photos entry.

## [0.6.0] — 2026-06-27

### Added
- **Capture — dictation + AI-structured findings** (workflow stage 4, part 1).
  - `src/lib/dictation.js` — `useDictation` hook over the Web Speech API with graceful
    fallback where unsupported (iOS-Safari risk), plus a pure `extractTranscript` (+ tests).
    Live transcript only; no audio stored.
  - `supabase/functions/structure-finding/index.ts` — edge fn (**Verify JWT ON**) that sends the
    raw transcript to Claude (`claude-opus-4-8`, structured outputs) and returns a clean finding +
    suggested severity + status. Needs `ANTHROPIC_API_KEY` edge-function secret.
  - `src/lib/findings.js` — client for the edge fn.
  - `InspectionDetail` items gain a **Dictate** mic and **Clean up with AI** button; the raw
    transcript is saved to `inspection_items.transcript`, the cleaned text to `findings`, and the
    AI's severity/status applied (you can override).
  - `/help` entry on dictation.
- **Backlog:** logged two more early-process epics — the **logbook audit/research tool** and the
  **guided overview photo capture** (standard prompted shot list, big-picture not discrepancy).

## [0.5.0] — 2026-06-27

### Added
- **Guided inspection detail view + first checklist content** (workflow stages assemble → inspect).
  - `supabase/migrations/005_seed_a36_checklist.sql` — PreBuy-authored **Beech A36 Bonanza**
    pre-purchase checklist as a global template + ~30 risk-weighted `template_items` (records, engine,
    structure, gear, prop, systems, flight). Original wording, structured after — and informed by —
    the ABS survey checklist (reference only; not embedded).
  - `src/lib/checklist.js` — instantiate the matching global template into per-job `inspection_items`
    on first open (`ensureInspectionItems`), plus item updates.
  - `src/lib/risk.js` — `riskBand()` helper (+ test).
  - `src/pages/InspectionDetail.jsx` (`/app/inspections/:id`) — walks items in `risk.js` order
    (highest financial risk first, unresolved ahead of resolved); mark ok/monitor/discrepancy/na +
    finding notes; progress counter. Dashboard rows link here.
  - `/help` updated; backlog gains the **logbook audit/research tool** epic + workflow provenance.

## [0.4.0] — 2026-06-27

### Added
- **Identify stage — FAA N-number lookup + prepopulation** (first step of the canonical workflow).
  - `supabase/migrations/004_faa_registry.sql` — trimmed `faa_registry` + `faa_aircraft_ref` tables
    (no registrant PII), RLS read-only to authenticated users, seeded with fixtures incl. the
    `N3704A → 1970 Beech A36, S/N E-212` test case. Includes the bulk-load procedure for the full
    FAA releasable dataset (run by service role; ~<100 MB trimmed).
  - `src/lib/aircraft.js` — `lookupAircraft(nNumber)` + pure `normalizeNNumber`/`shapeAircraft` (+ tests).
  - `NewInspection` is now identifier-first: for aviation shops, "Look up" pulls make/model/year/serial
    from the registry (inspector can still edit); serial is stored in `inspections.attributes`.
  - `lib/verticals.js` gains a `hasLookup` flag (aviation true, marine manual for now).
  - `/help`: entry on FAA lookup.

## [0.3.1] — 2026-06-27

### Changed
- **Vertical is now a property of the shop, not the inspection** (decision: a shop does one
  vertical; multiple verticals = multiple shops under one login).
  - `supabase/migrations/003_shop_vertical.sql` — adds `orgs.vertical` (default `aviation`).
  - `supabase/functions/signup/index.ts` — accepts + sets `vertical` on the new org (**redeploy**,
    still Verify JWT OFF; defaults to aviation so it's backward-compatible).
  - `CreateShop` now picks the shop's type; `NewInspection` derives the vertical from the shop
    (identifier field/labels fixed to it) instead of asking each time.
  - `lib/shops.js` — `createShop(name, vertical)`; `fetchMemberships` returns `orgs.vertical`.
  - `/help` updated to explain one-type-per-shop.

## [0.3.0] — 2026-06-27

### Added
- **Multi-vertical inspection flow (aircraft + boat).**
  - `supabase/migrations/002_verticals.sql` — generalizes `inspections` + `checklist_templates`:
    adds `vertical`, `asset_type`, generic `identifier`, `make`/`model`/`year`, and a JSONB
    `attributes` bag; drops the aviation-only `n_number`/`aircraft_*` columns (table was empty).
    RLS unchanged (still `org_id`-scoped).
  - `src/lib/verticals.js` — per-vertical registry (aviation → N-number, marine → HIN) with
    adaptive labels/placeholders and identifier validation (+ tests). Adding a vertical = an entry
    here + a seeded checklist, not a schema change.
  - `src/lib/inspections.js` — `validateInspectionDraft` (pure, tested), `createInspection`,
    `listInspectionsForOrg`.
  - `src/pages/Dashboard.jsx` — now the active shop's inspection list, with a shop switcher for
    multi-shop users (remembered in localStorage).
  - `src/pages/NewInspection.jsx` (`/app/inspections/new`) — create form whose identifier field +
    make/model labels adapt to the chosen vertical; tooltips on the identifier.
  - `/help` — entries on starting an inspection and multi-vertical support.

### Changed
- Dashboard is no longer a bare shop list; shop management moved into a switcher + "New shop" link.

## [0.2.1] — 2026-06-27

### Added
- **Self-serve password reset.** "Forgot your password?" on the sign-in screen → `/forgot`
  (request a link; same confirmation shown whether or not the account exists, so account
  existence isn't leaked) → `/reset-password` sets a new password from the recovery session.
  - `src/lib/auth.jsx` — `sendPasswordReset` + `updatePassword` helpers.
  - `src/lib/password.js` — shared `validatePassword` / `passwordsMatch` rules (+ tests),
    reused by signup and reset so the minimum stays in one place.
  - `/help` "I forgot my password" answer now describes the real flow.

### Docs
- `docs/deploy.md` — **Email (Resend)** section: Supabase custom-SMTP setup for auth email
  (confirm/reset/invite) plus the separate edge-function Resend-API path for app email; noted
  the `/reset-password` redirect is covered by the existing wildcard.

## [0.2.0] — 2026-06-27

### Added
- **Auth & onboarding (PREB-3).** Supabase email/password sign-up + sign-in, protected routes,
  and self-serve shop creation.
  - `src/lib/auth.jsx` — `AuthProvider` + `useAuth` (session restore, `onAuthStateChange` sync).
  - `src/components/ProtectedRoute.jsx` — gate that defers render until session is known, then
    redirects to `/login` preserving the intended destination (PREB-20).
  - `src/pages/Login.jsx` — combined sign-in/sign-up screen; friendly auth-error mapping;
    handles the email-confirmation-pending case.
  - `supabase/functions/signup/index.ts` — service-role edge function (**Verify JWT OFF**) that
    validates the caller's token itself, then creates `orgs` + owner `memberships` atomically
    (rolls back the org if the membership write fails; retries slug on collision) (PREB-21).
  - `src/pages/CreateShop.jsx` + `src/lib/shops.js` — mobile-friendly create-shop flow with a
    live slug preview; Dashboard routes a membership-less user here (PREB-22).
  - `src/pages/Dashboard.jsx` — authenticated landing listing the user's shops.
- **Shared `Tooltip` component (PREB-23)** — accessible (hover + focus, Escape, `aria-describedby`),
  with an `InfoDot` affordance; used on the password and shop-name fields.
- **`/help` FAQ page (PREB-24)** — public, data-driven, seeded with onboarding/auth Q&A; linked
  from Home, Login, Dashboard, and Create-shop.
- Home page now links to Sign in / Help and a "Create your shop" CTA.
- Tests: `src/lib/shops.test.js` covers shop-name validation, slugify, and active-org selection.

## [0.1.0] — 2026-06-26

### Added
- Visible app version + build stamp in the footer (`v{version} · build {sha}`).
- In-app "What's new" panel (`src/components/WhatsNew.jsx`) driven by `src/lib/releases.js`,
  with an unseen-release indicator tracked in localStorage.
- `src/lib/version.js` — version/build accessors + semver compare helper (+ unit tests).
- Project scaffolding: React 19 + Vite 8, React Router 7, Supabase JS, lucide-react, Vitest.
- `supabase/migrations/001_init.sql` — initial multi-tenant schema + RLS (orgs, memberships,
  checklist templates/items, inspections, inspection items, media) with SECURITY DEFINER helpers.
- `src/lib/risk.js` — financial-risk ordering for the guided inspection flow (+ unit tests).
- `src/lib/supabase.js` — Supabase client.
- SPA fallback (`public/_redirects`) for Cloudflare Pages.
