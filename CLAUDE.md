# PreBuy — Project Context

> **MAINTENANCE RULE.** Update this file (esp. "Current state", TODO, "Known issues") at the end of
> every working session and commit it. This is the cross-session memory.

> **DEPLOY-PASTE RULE.** When a change needs a manual deploy (SQL migration, edge-function paste),
> paste the full copy-ready SQL/code inline in chat and state JWT on/off. I deploy by copy/paste.

> **CHANGELOG RULE.** On every main-bound behavior change, add a `CHANGELOG.md` entry; if
> user-facing, also a friendly line in the in-app "What's new".

> **BRANCH CONVENTION.** One logical change per branch; `feat/… fix/… chore/… docs/…`.
> `main` = production (auto-deploys). Prefer surgical commits.
> **TEMP WORKING MODE (early dev, Brett 2026-06-27):** committing & pushing **straight to `main`**
> for speed — skip feature branches/PRs for now. Still: keep lint+tests+build green before each push;
> Cloudflare rollback is the safety net. Revert to branch+PR flow once there are real users/collaborators.

## What this is

Multi-tenant SaaS: a **horizontal pre-purchase _inspection platform_**. Each domain
(**aviation, marine/yacht, home, automotive, …**) is a pluggable **vertical**; **aviation is vertical #1**
(Brett's expertise → lead/reference implementation). Core flow, identical across verticals: enter an
**identifier** → pull the matching **checklist** → guide the inspector through it in **financial-risk
priority order** → capture findings via **dictation (Web Speech API) + photo/video** on a phone →
publish a polished **customer-facing report** (share link + PDF). Built multi-tenant from day one to resell.

**Go-big principle:** build the aviation vertical *concretely* on a *vertical-agnostic core*, so adding a
vertical = config + a small adapter, NOT a rewrite. Don't over-abstract ahead of the 2nd–3rd real vertical.

**Decisions locked (session 1, 2026-06-26):**
- Plain **JavaScript** (not TS).
- Checklists: **global seed library** (service-role seeded), each shop **clones & customizes** its own.
- Customer report: **tokenized share link, no login**, read-only + PDF. Served by an edge function
  (service role), NOT by anon RLS.
- Dictation: iPhone **Web Speech API** for live transcript → edge fn → **Claude** structures it into a
  finding. No audio storage to start. (iOS Safari reliability is a known risk — see native decision.)
- Tracker: **Jira** — connected. Site `zeftingaviation.atlassian.net`, project **PREB** (cloudId
  `d4270249-adb4-4ffc-ae91-bf5acfba0ad8`). 10 epics (PREB-1…10) + 35 stories (PREB-11…45) seeded;
  Foundation epic + its 6 stories marked Done. `docs/backlog.md` stays the home for design detail.
  ⚠️ The connected Linear workspace ("Yellowtag") is a **different company** — do NOT track PreBuy there.
- Signup: **open self-serve** — anyone can sign up, create a shop (org), and become its owner.
- Seeding: ship **both** an aircraft and a marine (boat) checklist to exercise the multi-asset engine.

**Product direction / open questions (see `docs/backlog.md`):**
- **Multi-vertical platform** (aviation lead; marine, home, automotive, … to follow). The engine
  (templates, risk order, capture, report) is vertical-agnostic; only the **identifier + its resolver**
  and the **checklist content** differ per vertical:
  - aviation → N-number → FAA registry · automotive → VIN → NHTSA vPIC (free) · marine → HIN (manual) ·
    home → address (manual now, property API later).
- Migration `002` (before any real data): add `vertical` + generic `identifier` + JSONB `attributes`
  bag on the subject, so plane/boat/house/car all fit one schema (no per-vertical migrations).
  Checklist library keyed by `vertical` + subtype. Identifier resolvers = pluggable per-vertical adapters.
- **Native iOS app: OPEN.** Web/PWA-first; native is a Phase-2 trigger if iOS Safari dictation or
  field connectivity fail real-world testing → then a React Native/Expo capture app, web keeps reports.

## Stack
- Frontend: React 19 + Vite 8 → Cloudflare Pages (push `main` = deploy). React Router 7.
- Backend: Supabase (Postgres + RLS + Auth + Edge Functions + Storage).
- Payments: Stripe · Email: Resend · Analytics: Plausible · AI: Anthropic via edge fn.
- Icons: lucide-react · Tests: Vitest.

## Key files
- `src/pages/…`, `src/components/…`, `src/lib/…` (`lib/supabase.js` = client; `lib/risk.js` = priority logic).
- `supabase/migrations/` — additive, numbered, run by paste in the SQL editor. `001_init.sql` = schema + RLS.
- `supabase/functions/` — edge functions (service role); see its README for the planned set + JWT settings.

## Data model (see 001_init.sql)
`orgs` → `memberships` (owner/admin/mechanic) → `checklist_templates` (+ `template_items`, `risk_weight`
drives ordering) → `inspections` (N-number, share_token, status draft→in_progress→review→published) →
`inspection_items` → `media`. `org_id` on every tenant table; org-scoped RLS via `user_org_ids()` /
`user_role_in()` SECURITY DEFINER helpers.

## Conventions / gotchas
- Privileged/secret work → edge function (service role) + own auth check. Never secrets in client.
- RLS: SECURITY DEFINER helpers (no self-referential recursion); UPDATE policies need WITH CHECK;
  edge-fn JWT OFF for pre-login flows. Membership/org writes go through the signup/invite edge fns.
- Snapshot before structural migrations. Tests (Vitest) on dangerous pure logic; CI gates build+test.
- **UX / help-from-the-onset (Brett's rule):** every user-facing feature ships with inline help —
  tooltips on non-obvious controls + an entry in the in-app **Help / FAQ**. Treat help text as part
  of "done," not a follow-up. Keep it current as features change (same discipline as "What's new").
  Use the shared `Tooltip` component and the `/help` page.

## Current state
- Session 1 (2026-06-26): Scaffolded Vite+React app. Installed stack deps. Wrote `001_init.sql`
  (schema + RLS), `lib/supabase.js`, `lib/risk.js` (+ tests), SPA `_redirects`, this file.
  Git initialized + pushed to GitHub (zeftav/prebuy, SSH). Supabase project created, `001_init.sql`
  run, RLS verified enforcing (unauth insert → 42501 denied). v0.1.0 (visible version + What's New
  panel) shipped. Cloudflare Pages live + verified at https://prebuy-2pm.pages.dev (build stamp shows
  real commit SHA; SPA fallback works). `docs/deploy.md` captures the full deploy setup.
  Jira backlog stood up (PREB). **Paused** session 1 here to set up a Claude Code **web/cloud** project
  (so prebuy is visible/workable from the Claude iOS app like Yellowtag; this was a *local* Mac session).
- Session 2 (2026-06-27, **first cloud session**): Built **PREB-3 Auth & onboarding** on branch
  `feat/auth`. v0.2.0. Supabase email/password sign-in/up (`lib/auth.jsx` `AuthProvider`/`useAuth`),
  `ProtectedRoute`, `/login` (PREB-20). `signup` edge fn — service role, **JWT OFF**, own token check,
  atomic org+owner with org-rollback + slug-collision retry (PREB-21). Create-shop UI + `lib/shops.js`
  (validated; +tests) with Dashboard routing membership-less users to onboarding (PREB-22). Shared
  accessible `Tooltip` + `InfoDot` (PREB-23). Data-driven `/help` FAQ (PREB-24). Home nav (Sign in /
  Help / CTA). Lint+test (23) + build all green.
  **Deploy still needed (Brett):** paste & deploy the `signup` edge fn with **Verify JWT OFF** (no
  manual secrets — uses auto-injected `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`). Until then,
  create-shop returns a network/_function-not-found_ error but auth + the rest work.
  Also added **password reset** (v0.2.1): `/forgot` (request link, no account-existence leak) →
  `/reset-password` (recovery session → set new password); `lib/password.js` shared rules (+tests).
  Documented **email** in `docs/deploy.md`: two channels — auth email via Supabase **custom SMTP
  (Resend)**, app email via edge-fn **Resend API**. Reset works on Supabase's built-in sender for
  your own account; wire Resend SMTP before real shops sign up. Lint + 29 tests + build green.
  **Merged to `main` (production) + `signup` edge fn deployed by Brett.** PREB-3 epic + stories
  20/21/22/23/24/46 all **Done**. Allowlisted Atlassian + GitHub + git/npm MCP/Bash in
  `.claude/settings.json` (applies to future sessions). Note: couldn't live-smoke-test the edge fn —
  cloud egress policy 403s on `*.supabase.co`, so verify create-shop from the deployed app/browser.
  Brett confirmed signup works end-to-end (real org created). Then built the **multi-vertical
  inspection flow** (v0.3.0): migration `002` (verticals/identifier/attributes), `lib/verticals.js`
  (aviation N-number + marine HIN, +tests), `lib/inspections.js` (+tests), Dashboard→inspection list
  with shop switcher, `/app/inspections/new` create form. Lint + 45 tests + build green; pushed to
  `main`. Brett bought `prebuy.app` via Cloudflare — cutover pending (steps in `docs/deploy.md`).
  **Course-correct (Brett):** vertical belongs to the **shop**, not the inspection — a shop does one
  vertical; multiple verticals = multiple shops per login. v0.3.1: migration `003` (`orgs.vertical`),
  `signup` edge fn sets it (**redeploy**), CreateShop picks it, NewInspection derives it from the shop.
  Brett **ran 002** in SQL editor (confirmed). ⚠️ **003 must be run** + **signup edge fn redeployed**.
  Future idea logged in `docs/backlog.md`: self-serve "add an industry" (shop builds own
  checklist/report, or concierge build) — not now.
- Session 2 cont. — **Canonical workflow** locked (docs/backlog.md): identify→assemble→customize→
  inspect→report. Built the **Identify stage** (v0.4.0): migration `004` trimmed `faa_registry` +
  `faa_aircraft_ref` (RLS read; seed incl. **N3704A → 1970 A36, S/N E-212**; bulk-load procedure in
  the file). `lib/aircraft.js` `lookupAircraft` (+tests). NewInspection is identifier-first: aviation
  "Look up" prefills make/model/year/serial; serial → `attributes`. Lint + 50 tests + build green;
  pushed to `main`. ⚠️ **migration 004 must be run** before lookup works (fixtures load with it).
  FAA full bulk-load = Brett, when wanted (trimmed ≈ <100 MB; lookups are single indexed reads).
- Session 2 cont. — **Stages assemble + inspect** (v0.5.0). Brett supplied the **ABS** Bonanza
  prepurchase checklist as reference (kept OUT of repo — copyrighted). Authored an original
  risk-weighted **Beech A36** checklist: migration `005` seeds a global template + ~30 `template_items`.
  `lib/checklist.js` instantiates the matching template into `inspection_items` on first open;
  `InspectionDetail` (`/app/inspections/:id`) walks items in `risk.js` order, mark
  ok/monitor/discrepancy/na + notes. `risk.js` `riskBand()` (+test). Lint + 51 tests + build green;
  pushed to `main`. ⚠️ **run migrations 004 + 005** (paste from chat) for lookup + the A36 checklist.
  New backlog epic: **logbook audit/research tool** (records/AD/damage/NTSB/title) — early, high value.
- Session 2 cont. — **Capture stage, part 1: dictation + AI findings** (v0.6.0). `lib/dictation.js`
  `useDictation` (Web Speech, graceful fallback, +tested `extractTranscript`); `structure-finding`
  edge fn (**Verify JWT ON**, `claude-opus-4-8` + structured outputs, needs `ANTHROPIC_API_KEY`
  secret) via `lib/findings.js`; InspectionDetail items get Dictate + Clean-up-with-AI; raw →
  `transcript`, cleaned → `findings`, AI severity/status applied. Consulted the `claude-api` skill
  for model/SDK. Lint + 54 tests + build green; pushed `main`. ⚠️ **deploy `structure-finding`
  (JWT ON) + set `ANTHROPIC_API_KEY`** for dictation cleanup to work. Two new backlog epics:
  **logbook audit tool** + **guided overview photo capture** (prompted shot list).
- Session 2 cont. — **Capture stage, part 2: photos** (v0.7.0). Migration `006` (`media.purpose` +
  private `inspection-media` Storage bucket + org-scoped Storage policies). `lib/media.js`
  (upload/list-with-signed-urls/delete; +tested pure helpers). **Guided overview capture**
  (`/app/inspections/:id/overview`) — per-vertical prompted shot list (`verticals.overviewShots`).
  **Per-item discrepancy photos** in InspectionDetail (Add photo + thumbnails). Lint + 59 tests +
  build green; pushed `main`. ⚠️ **run migration 006** for photos to work.
  **▶ Consolidated deploy list:** `docs/deploy-checklist.md` (single source for all pending manual
  steps). Pending for Brett (mobile): migrations **005 + 006**, deploy **structure-finding** (JWT
  ON) + **ANTHROPIC_API_KEY**; later Resend SMTP, FAA bulk-load, prebuy.app.
- Session 2 cont. — **Customization (stage 3, v0.8.0)** + **Report (stage 5, v0.9.0)**. Migration
  `007` (`inspection_items.owner_priority`); `risk.js` floats owner priorities to top (+tests);
  `addCustomItem`/`deleteInspectionItem`; InspectionDetail flag + add-item form + delete. Report:
  `report` edge fn (**JWT OFF**, service role, by `share_token`, published-only, signed media URLs);
  `lib/report.js` publish/unpublish/fetch + pure `reportSummary` (+tests); **public `/r/:token`**
  `ReportView` (read-only, risk-grouped findings + photos, Print/Save-PDF); publish bar with copyable
  link in detail. Lint + 64 tests + build green; pushed `main`. **All 5 workflow stages now built.**
  ⚠️ **run migrations 005+006+007**, deploy **structure-finding** (JWT ON)+`ANTHROPIC_API_KEY` and
  **report** (JWT OFF). Full pending list: `docs/deploy-checklist.md`.
- Session 2 cont. — **Logbook audit tool** (v0.10.0). Migration `008` (`logbooks` +
  `logbook_events`, org-scoped RLS). `lib/logbooks.js` `reconcileLogbooks`/`summarizeKind` —
  per-type gap/overlap detection + tracked hours (+tests); CRUD. `LogbookAudit` page
  (`/app/inspections/:id/logbooks`): add logbooks, reconciliation panel (gaps=missing-book,
  overlaps=dup-time), notable events (AD/337/overhaul/prop-strike/damage). Linked from detail.
  Lint + 70 tests + build green; pushed `main`. ⚠️ **run migration 008**. Backlog: **photo→OCR
  log import** (Claude vision) is the next logbook step.
- Session 2 cont. — **Logbook OCR import (beta, v0.11.0)**. Migration `009` (`media.purpose` +=
  `logbook`). `structure-logbook` edge fn (**JWT ON**, `claude-opus-4-8` vision, structured output,
  reuses `ANTHROPIC_API_KEY`): page images → draft logbooks + notable events. `lib/logbooks.js`
  `extractLogbooks` + pure `cleanDraftValue` (+test); `lib/media.js` `signedUrlsFor`. LogbookAudit
  "Scan & import" section: upload pages → review (tick-to-keep) → import. Lint + 72 tests + build
  green; pushed `main`. ⚠️ **run migration 009** + **deploy `structure-logbook` (JWT ON)**.
  **Deploys done by Brett (2026-06-27):** migrations 001-008, edge fns signup/structure-finding/report,
  `ANTHROPIC_API_KEY` — all live. Brett set Cloudflare DNS for **app.prebuy.app** (cutover in progress).
  Backlog: logbook-scan **equipment list** extraction + broker-style event highlighting; **marketing
  landing page** (apex `prebuy.app`, app at `app.prebuy.app`).
- Session 2 cont. — **Inspection provenance (v0.12.0)**. Migration `010` (`inspections.inspector_name`
  / `location` / `inspection_date`). Captured on NewInspection + editable card in InspectionDetail
  (`updateInspectionMeta`); `report` edge fn returns them; ReportView header shows who/where/when.
  ⚠️ **run migration 010 + REDEPLOY `report`**. Brett: app live at **app.prebuy.app** (cutover done);
  Cloudflare + Supabase Auth URLs updated. Brett supplied a real **broker listing** (58P Baron) as the
  target format for the records/equipment summary — distilled into `docs/backlog.md` (text not stored).
  **▶ NEXT (Brett's steer): redesign the report into a professional 2-part doc** — "Aircraft profile"
  (spec/currency cards, maintenance timeline, damage callout, categorized equipment, photos) + the
  inspection findings. Data dependency: **equipment/spec extraction** (extend `structure-logbook` →
  `inspections.attributes`). Then: marketing landing page · gear-rigging measurement form (needs Drive
  manuals) · invite teammates · server-side PDF · Resend SMTP.
- Session 2 cont. — **FAA bulk-load automated** + **app-wide footer fix** (v0.12.1). `scripts/faa/
  load-faa.mjs` (pg COPY → temp-staging-from-header → upsert trimmed cols, FK-safe, idempotent) +
  `.github/workflows/faa-load.yml` (manual + monthly cron; downloads FAA zip; needs repo secret
  `SUPABASE_DB_URL` = **direct/session** conn string, not the :6543 pooler). `docs/faa-load.md`. Full
  ~300k load **done 2026-06-27** — secret = **Session pooler** string (runners are IPv4-only and the
  Direct host is IPv6-only → `ENETUNREACH`; download also needs a browser User-Agent or the FAA 403s
  the zip). Monthly cron keeps it fresh. AppFooter now global (version/What's-New on every page).
  **structure-logbook (JWT ON) + migration 009 deployed by Brett** (logbook OCR scan, v0.11.0).
  All deploy-checklist items now ✅ except pre-launch email (Resend SMTP) + the marketing landing page.
- Session 2 cont. — **Aircraft Profile + two-part report redesign** (v0.13.0). `lib/profile.js` —
  canonical profile on `inspections.attributes.profile` (**no migration**; JSONB bag): summary,
  specs/times, currency/due dates, damage history, categorized equipment. Pure helpers (normalize,
  isProfileEmpty, profileRows, formatSpecValue, **currencyStatus** overdue/due-soon/ok) +tests (+12).
  `AircraftProfile.jsx` editor at `/app/inspections/:id/profile` (linked from detail tools).
  `report` edge fn now returns `inspection.profile` + `logbook_events` (newest-first). `ReportView`
  redesigned: **Part 1 Aircraft profile** (spec/currency cards w/ overdue flags, damage callout,
  maintenance timeline from events, equipment, photos) → **Part 2 Inspection findings** (existing).
  Part 1 blocks render only with data → legacy reports degrade cleanly. Lint + 84 tests + build green.
  ⚠️ **REDEPLOY `report` (JWT OFF)** for the profile/timeline (no migration).
- Session 2 cont. — **Scan-to-pre-fill the Aircraft Profile** (v0.14.0). Extended `structure-logbook`
  vision (schema+prompt) to also extract `specs`/`currency`/`equipment` (max_tokens→8192); additive,
  logbook import unaffected. `lib/profile.js`: `extractProfile` + pure `draftFromExtraction` &
  `mergeProfileDraft` (fill-blanks-only, dedupe equipment by name) +tests (+5). AircraftProfile has a
  "Scan to pre-fill" section (photograph records → review specs/currency/equipment → merge into form →
  Save). Lint + 89 tests + build green. ⚠️ **Deploys pending (Brett, batched):** REDEPLOY **`report`
  (JWT OFF)** [v0.13.0] + **`structure-logbook` (JWT ON)** [v0.14.0]; both no-migration.
- Session 2 cont. — **Broker-style narrative generator** (v0.15.0). New **`generate-summary`** edge fn
  (**JWT ON**, `claude-opus-4-8` + structured `{summary}`, reuses `ANTHROPIC_API_KEY`; client sends the
  context, no DB access). `lib/profile.js`: pure `buildSummaryContext` (+3 tests) + `generateNarrative`.
  AircraftProfile "Write with AI" drafts the report's opening summary from profile + logbook events +
  findings — original prose, balanced, grounded only in the data → editable Summary box. Help FAQ +3.
  Lint + 92 tests + build green. **Deployed by Brett** (report/structure-logbook/generate-summary).
- Session 2 cont. — **Capture UX + checklist coverage** (v0.15.1 + v0.16.0). v0.15.1: shared
  `PhotoPicker` (take-photo OR upload/choose, desktop+mobile) replaces the `capture`-forced inputs in
  all four capture points (frontend only). v0.16.0: **generic fallback checklist** — migration `011`
  seeds a model-agnostic "General Aircraft — Pre-Purchase Survey" (`vertical='aviation'`, `model IS
  NULL`, ~27 items); `findTemplateFor` falls back model-specific→generic, `ensureInspectionItems`
  threads a `generic` flag (detail shows a "started you on the general survey" notice). Add-item form
  gained a **Notes/what-to-check** field (→ item `description`). ⚠️ **Run migration 011.**
  Lint + 92 tests + build green.
- **⚠️ DESIGN DEBT — single vs MULTI-ENGINE (Brett, 2026-06-27).** The data model is implicitly
  single-engine (one `engine_smoh`/`prop_*` in the profile; logbook `kind` has no position). Aircraft
  can be 1..N engines/props and we must account for it across logbooks, profile specs, checklist
  (per-engine compressions etc.), `structure-logbook` extraction, and the report. **Convention: left
  engine = #1, right = #2.** Edge case: **push-pull (Cessna 337)** = front #1 / rear #2. Full design +
  touchpoints captured in `docs/backlog.md` → "Multi-engine".
- Session 2 cont. — **Multi-engine — profile + report** (v0.17.0, frontend-only, no migration/redeploy).
  `lib/profile.js`: profile gains `engine_count` + `layout` (conventional L/R · centerline front/rear
  for C337) + `engines[]`/`props[]` (airframe specs stay single); `normalizeProfile` resizes to count
  and **migrates legacy single-engine** (flat → slot #1); pure `engineLabel`/`propLabel`/`fieldRows`;
  `draft/merge/buildSummaryContext` updated. `aircraft.js` FAA lookup returns `engine_count` (num_eng) →
  `inspections.js` seeds `attributes.engine_count` at create (NewInspection passes it). AircraftProfile:
  engine-count + layout controls, a card per engine(+prop), scan review Engine/Prop groups (→ #1).
  ReportView: per-engine "Engines & propellers" blocks. Tests 98. ⚠️ **Still single-engine-only:**
  logbook position (per-engine reconcile) + per-engine checklist fan-out = next increment (backlog).
- Session 2 cont. — **Landing page** (v0.18.0, frontend-only). `Home.jsx` rebuilt into a real marketing
  page (hero+CTA, 5-step "how it works", feature grid, who-it's-for, closing CTA); `App.css` styles.
  Serves at `/` for app.prebuy.app + apex until a separate apex site exists. Backlog: noted inspection
  **search/filter** for the Dashboard.
- Session 2 cont. — **Home & marine verticals + seeded checklists** (v0.19.0). Brett supplied structured
  seed data (`supabase/seed/inspection-guidelines.json` — InterNACHI home SoP + synthesized marine scope).
  `verticals.js`: new **home** vertical (address identifier, manual) added to `VERTICAL_OPTIONS`;
  `validateIdentifier` keeps free-text identifiers' spaces/case (codes still normalized). Generator
  `scripts/seed/gen-checklist-sql.mjs` → migrations **012** (home, ~101 items) + **013** (marine, ~56)
  as global fallback templates (`model IS NULL`); area→category, inspect/describe/report_if→items,
  not_required kept in JSON for a future scope drawer. Slots into the existing engine, no schema change.
  Lint + 99 tests + build green. ⚠️ **Run migrations 012 + 013.**
- Session 2 cont. — **Multi-engine round 2** (v0.20.0). Migration `014` adds `position` to `logbooks` +
  `logbook_events`. `logbooks.js` `reconcileLogbooks(.,{engineCount,layout})` → position-aware `groups`
  (engine/prop split per position on a twin) + pure `groupLabel` + `POSITIONAL_KINDS`; CRUD carries
  position. `checklist.js` pure `fanOutTemplateItems` duplicates aviation Engine/Propeller items per
  engine at instantiation (title suffixed); single-engine/non-aviation untouched; existing inspections
  unaffected (only first-open instantiation). LogbookAudit: position pickers + per-engine reconcile +
  labels. `report` edge fn returns event `position`; ReportView timeline shows the engine. Tests 107.
  ⚠️ **Run migration 014 + redeploy `report` (JWT OFF).**
- Session 2 cont. — **Document attachments on items** (v0.21.0). Migration `015` (`media.kind`+='document',
  `media.purpose`+='attachment'). `media.js` `mediaKind`→'document' for non-image/video; caption holds
  the filename. InspectionDetail: "Attach file" (PDF/image) per item next to "Add photo"; photos→thumbs,
  docs→download links. `report` edge fn returns per-item `attachments`; ReportView renders them on
  findings + cleared items. Help FAQ +1. Tests 107. ⚠️ **Run migration 015** + the **one `report`
  redeploy (JWT OFF)** also covers v0.20.0 (event position).
- Session 2 cont. — **One-button guided photo walkthrough** (v0.22.0, frontend-only, additive). `verticals.js`
  `guidedCapture` flag (aviation/marine `full`, home `exterior`) + pure `guidedShots` (+tests).
  `OverviewCapture` run mode: Start → step each shot (prompt + capture → preview → Keep&continue
  auto-advance / Retake / Skip / Replace), resumes at first missing, progress X/N; per-shot list kept.
  Help FAQ updated. Tests 110.
- Session 2 cont. — **Broker listings (broker epic Phase 1)** (v0.23.0). Migration `016`
  (`inspections.mode` 'inspection'|'listing' + `source_inspection_id`). Mode is **per-job** (a shop does
  both — Brett's call). NewInspection mode picker; `checklist.js` skips checklist for listings;
  InspectionDetail listing layout (capture tools + publish, no checklist) + **"Start inspection from this
  listing"** same-org handoff (`startInspectionFromListing` clones profile/attributes + overview media +
  logbooks/events). `report`+ReportView: listing = Part 1 only ("<Asset> Listing"). Dashboard tags
  listings. Resend SMTP **live** (auth email works; `noreply@prebuy.app`). Lint + 110 tests + build green.
  ⚠️ **Run migration 016 + redeploy `report` (JWT OFF).**
- Session 2 cont. — **Landing-page repositioning** (v0.24.0, frontend-only). `Home.jsx` reframed to the
  whole deal lifecycle + many industries: audience trio (sellers/brokers · inspectors/surveyors · buyers),
  vertical-neutral how-it-works/features, industries strip, "Forged in aviation" origin band. `App.css`
  styles added.
- Session 2 cont. — **Cross-org broker handoff (broker epic Phase 2)** (v0.25.0). Migration `017`
  (`handoffs` table + RLS, broker-side). New **`claim-listing`** edge fn (**JWT ON**, service role):
  `preview` (listing summary) + `claim` (verifies caller's org membership, copies listing → inspection
  cross-org incl. **Storage object copies** + logbooks/events, marks claimed). `lib/handoff.js`
  (create/list/revoke/url + preview/claim). `ClaimListing` page at **`/claim/:token`** (ProtectedRoute).
  InspectionDetail listing → `HandoffPanel` (create/copy/revoke claim links). Lint + 111 tests + build
  green. ⚠️ **Run migration 017 + deploy `claim-listing` (JWT ON).**
  **NEXT:** auto-email invite (needs app-email RESEND_API_KEY) + searchable shop directory + expertise
  filter; then scope/disclaimer drawer, gear-rigging forms, invite teammates, server-side PDF; research project.
  **NEXT (broker Phase 2):** cross-org handoff — shop directory + invite + storage copy + claim link
  (+ expertise filtering later). Then scope/disclaimer drawer, gear-rigging forms, invite teammates,
  server-side PDF; broader landing-page story (all verticals / whole sale lifecycle); per-vertical
  identifier resolvers (USCG MIC, address/property, NHTSA vPIC); aircraft-as-entity; research project.
- Session 2 cont. — **Boat HIN lookup** (v0.26.0). The marine analog of the N-number lookup — first
  per-vertical resolver beyond aviation. Migration `018` (`marine_mic` ref table: mic PK / manufacturer /
  status + RLS read-only; TEST fixtures `ABC`/`ZZZ`). `lib/marine.js`: pure `normalizeHIN`/
  `inferModelYear`/`parseHIN` (12-char modern HIN → MIC·serial·build-month·model-year)/`shapeFromHIN`
  (+tests, 118 total) + `lookupHIN` (parse + MIC query; missing MIC just leaves builder null).
  `verticals.js` marine `hasLookup: true`. NewInspection dispatches the lookup by shop vertical
  (`lookupHIN` for marine, else `lookupAircraft`); notfound copy made vertical-neutral. Full USCG MIC
  bulk-load = backlog. ⚠️ **Run migration 018** (no edge fn). Lint + 118 tests + build green.
  **NEXT (Brett's steer): super-admin dashboard** — Brett has a strong one on Yellowtag; he'll export a
  feature outline to spec it. Likely: cross-org overview (orgs/users/inspections counts + recent
  activity), per-org drill-in, impersonate/support, system health — gated to a platform-owner role
  (NOT org RLS; service-role edge fn or a `super_admin` flag). Spec pending from Brett.

## Repo / access
- GitHub: `git@github.com:zeftav/prebuy.git` (`main` tracked). Auth via ed25519 SSH key on this Mac
  (added as a repo deploy key with write). No `gh` CLI installed yet.
- Supabase: project ref `zttsdwclhykekoytrmxx`. Uses the new key format — client key is
  `sb_publishable_…` (held in `.env` as `VITE_SUPABASE_ANON_KEY`); the secret key is `sb_secret_…`
  (edge functions only, never in client/git). 7 tables + RLS as per `001_init.sql`.
- Cloudflare Pages: live at https://prebuy-2pm.pages.dev. `main` → prod auto-deploy. Env vars +
  build settings documented in `docs/deploy.md`. Node pinned to 22 (`.nvmrc` + `NODE_VERSION`).

## TODO / Known issues
- [x] Connect GitHub remote (SSH, pushed 2026-06-26).
- [ ] (optional) Install `gh` CLI for the PR workflow / issue links.
- [x] Create Supabase project; run `001_init.sql` (RLS verified). (Auth redirect URLs: localhost only — revisit at Cloudflare time.)
- [x] Cloudflare Pages project — live at prebuy-2pm.pages.dev (2026-06-26).
- [x] Supabase Auth URLs set (pages.dev) + Cloudflare env vars confirmed (2026-06-26).
- [x] Migration `002` (v0.3.0, 2026-06-27): generalized `inspections`/`checklist_templates` to
      `vertical` + generic `identifier` + make/model/year + JSONB `attributes`; dropped aviation-only
      cols. ⚠️ **needs running** in the SQL editor (paste from chat) before create-inspection works.
- [ ] Seed first global checklist template(s) — aircraft + boat (still TODO; create-inspection works
      without a template, `template_id` nullable).
- [ ] Marine checklist content (HIN identifier wired; content pending boat-surveyor SME).
- [ ] Migrate to **prebuy.app** (bought via Cloudflare 2026-06-27): Pages custom domain + Supabase
      Auth URLs + Resend domain verify. Steps in `docs/deploy.md` → Not yet set up.
- [ ] Decide native iOS vs PWA after field-testing dictation + offline at a real hangar/dock.
- [ ] N-number → make/model lookup (FAA releasable aircraft registration DB).
- [x] Auth + org signup edge function (PREB-3, v0.2.0); deployed by Brett + verified live 2026-06-27.
- [x] Password reset flow (v0.2.1, 2026-06-27).
- [ ] Wire Resend SMTP in Supabase for production auth email (confirm/reset/invite); verify
      `prebuy.app` domain in Resend. See `docs/deploy.md` → Email. (Built-in sender OK for testing.)
- [ ] Capture flow (dictation + media), report view, PDF export.
- [x] Shared `Tooltip` component + `/help` FAQ page (PREB-23/24, 2026-06-27); keep populating per feature.
- [x] Jira: backlog stood up (project PREB, 10 epics / 35 stories, 2026-06-26).
