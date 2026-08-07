# Changelog

All notable changes that hit `main` (production) are recorded here.
User-facing entries are also summarized in-app (see `src/lib/releases.js`).

## [0.63.0] — 2026-08-06

### Added
- **Filter + sort the inspection items list.** A control bar over the items list filters to All /
  Discrepancies / Airworthiness / Monitor / Not-inspected, and sorts by Risk (default), Severity (AI
  estimate, high→low), Est. cost (repair-estimate line total, high→low), or Airworthiness-first. Default
  keeps the existing risk/checklist order, so nothing changes unless you use it; a "shown of total" count
  appears when a filter narrows the list. Sorts read data already on the page (item `severity`, the repair
  estimate, the airworthiness flag) — frontend only, no migration, no redeploy.

## [0.62.0] — 2026-08-06

### Added
- **Airworthiness toggle on each discrepancy.** A discrepancy can now be flagged as an **airworthiness
  item** — one that must be corrected for an annual / return-to-service signoff — to differentiate it from
  advisory squawks. In the inspection, each discrepancy shows an "Airworthiness item — required for
  signoff" toggle and a red ✈ badge in the item header when set. On the customer report, airworthiness
  discrepancies get an **"Airworthiness"** badge and the Discrepancies section leads with a count
  ("N of M are airworthiness items that must be corrected for a return-to-service / annual signoff"). New
  `lib/airworthiness.js` (pure + tested): `normalizeAirworthiness` / `isAirworthinessItem` /
  `airworthinessCount` + `saveItemAirworthiness`. Stored on `inspections.attributes.airworthiness`
  (`{ [item_id]: true }`, JSONB — no migration).

### Deploy
- ⚠️ **REDEPLOY `report` (JWT OFF)** — returns `inspection.airworthiness` so the badges/count render.
  **This one redeploy also covers v0.61.0** (`inspection.estimate` for the Estimated repairs table). No
  migration.

## [0.61.0] — 2026-08-06

### Added
- **Per-discrepancy repair estimates (labor + parts) with a rollup — for shops that don't use an external
  work-order system.** Each discrepancy item in the inspection gets an "Repair estimate" block: labor
  hours + parts cost (+ an optional note for a part number / sublet / assumption); the line total prices
  the hours at the inspection's labor rate. A new **"Repairs estimate"** summary panel at the bottom of the
  inspection sets the shop labor rate and rolls up labor hours, labor $, parts $, and a grand total across
  every priced discrepancy — and has a **"Show this estimate on the customer report"** toggle (default
  **off**, since dollar figures are opt-in). When on, the report gets an **"Estimated repairs"** table
  (each discrepancy with labor / parts / line total + a grand total and a "preliminary estimate" caveat).
  New `lib/estimate.js` (pure + tested): `normalizeEstimate` / `normalizeItemEstimate` / `hasEstimate` /
  `lineTotal` / `estimateStats` / `formatUsd` + `saveItemEstimate` / `saveEstimateSettings`. Stored on
  `inspections.attributes.estimate` (JSONB — no migration).

### Deploy
- ⚠️ **REDEPLOY `report` (JWT OFF)** — returns `inspection.estimate` so the opt-in "Estimated repairs"
  table can render. No migration. (Capture + rollup are frontend-only; the report table needs this.)

## [0.60.0] — 2026-08-06

### Added
- **Suppress equipment from the customer report.** Each equipment item (avionics / additional, per the
  vertical) now has an "On report" checkbox in the Aircraft Profile, plus **All / None** bulk toggles per
  group — so you can hold back items you don't want on the report (installed-but-inop, personal gear,
  duplicates) while keeping them in your working profile. Equipment rows carry a `hidden` flag
  (`profile.js` new `equipList` normalizer preserves it; defaults shown); `ReportView` filters hidden rows
  and drops a group/section that ends up empty; `buildSummaryContext` also excludes hidden items so the
  AI-written summary doesn't mention them. Held rows show dimmed in the editor. Stored in the profile bag
  (`attributes.profile`) — **no migration**; the report computes visibility client-side — **no redeploy**.

## [0.59.0] — 2026-08-05

### Added
- **"Hard to read" advisory is now an actionable review — see each flagged item and correct it.** The
  illegible-entry flag (`logbooks.review_note`, fed by the scan's `unclear[]`) used to be one blob of text
  with a single "Mark reviewed" button. It's now a `ReviewFlag` component you expand to see **each flagged
  item on its own line**, each with a **PDF page hotlink** (jump to the exact page to verify) and its own
  **Resolve** (clear items one at a time) plus "Mark all reviewed." New pure `parseReviewNotes` splits the
  stored note and pulls a leading `p.N` page ref out of each line.
- **Inline event editing.** Scanned/added logbook events were delete-only, so a mis-read date/tach/figure
  had no correction path. `EventRow` gains a pencil → an `EditEvent` form (type / title / date / tach /
  description) that saves via `updateLogbookEvent` (new `onUpdateEvent` handler). This is the "fix it" step
  for the illegible-review workflow, and useful on its own.
- **Scan tags each unclear note with its page.** `structure-logbook` now prefixes each `unclear` note with
  `"p.N — …"`; `offsetDraftPages` shifts that inline page ref to absolute across multi-batch reads (so the
  page link is correct on big books). Frontend degrades gracefully (no page link) if not yet redeployed.

### Deploy
- ⚠️ **Redeploy `structure-logbook` (JWT ON)** — for the per-item page numbers on the review flag. No
  migration; reuses `ANTHROPIC_API_KEY`. The review panel, resolve, and event editing all work without it.

## [0.58.0] — 2026-08-05

### Added
- **Review queue for uncertain scan matches (so nothing in the logbook is silently missed).** The
  logbook-scan auto-fill was all-or-nothing: a confident match filled a timed/compliance item, and
  anything the scan read but couldn't confidently place was dropped — making a blank item look like
  "never done" when the entry might really be in the books, just mis-matched. Matching is now three-tier:
  confident (exact key / full label / part-number) auto-fills as before; **uncertain** (partial word
  overlap, or a part with partial affinity to a tracked life-limit item) is captured as a **suggestion**
  instead of dropped; no-affinity reads stay out (they're already in the searchable parts list). Uncertain
  suggestions surface in a new **"Review from logbook scans"** panel on the Timed-items tool: each shows
  what the scan read, a best-guess "Assign to" item, and editable date/tach — Approve writes it onto the
  chosen item, Dismiss drops it. `compliance.js`: `mergeScanCompliance` / `mergeScanParts` now also return
  `suggestions`; new pure `suggestionId` / `mergeSuggestions` (dedupe across re-scans) / `pruneSuggestions`
  (drop once the item is satisfied) (+tests). Stored on `attributes.compliance.suggestions` (JSONB — no
  migration); `LogbookAudit.processBook` collects+persists them at scan time; `Compliance.jsx` renders the
  review panel. Internal-only (not on the customer report). Frontend only — no migration, no redeploy.

## [0.57.0] — 2026-08-05

### Fixed
- **Life-limited items never replaced now read "not yet due" instead of unknown.** Many life-limited
  parts have an hours limit (e.g. 2000 hr) that the airframe hasn't reached (e.g. 1600 hr) — never
  complied with, but not due either. `dueStatus` previously fell through to `unknown` when a life-limit
  item had no recorded last-complied tach. It now baselines a life-limit (`source: 'mm-scan'` or
  `category: 'life-limit'`) to **airframe time zero** when never replaced — the original part was
  installed when the aircraft was new — so it becomes due at the limit itself: at 1600 hr against a
  2000-hr life it's **Current, 400 hrs left**, and only goes overdue once the airframe passes the limit.
  Baseline-0 is the conservative direction (a real later replacement only pushes the due point further
  out, so an "ok" verdict stays valid). A blank last-done on a *standard recurring* item (annual, IFR,
  vacuum pump) still stays `unknown` — we don't assume those were done at manufacture. `dueStatus` now
  returns an `assumedNew` flag; the Timed-items chart shows "since new" and labels the limit "life X hrs"
  (vs "every X hrs" for recurring), and the report's compliance table shows "Since new" as the
  last-complied. Frontend only (status is computed client-side) — no migration, no redeploy.

## [0.56.0] — 2026-08-05

### Added
- **Logbook cards auto-number + are renameable.** Multiple books of the same type no longer all read
  "Airframe" — they auto-number "Airframe 1 / 2 / 3" in chronological (start-tach/date) order, and each
  card has a pencil to give it a meaningful name ("Airframe 1998–2012", "Engine #1 logbook"). New pure
  `logbookDisplayLabel(book, ordered, { engineCount, layout })` in `logbooks.js` (+tests): a user-set name
  (a `label` that differs from the default type name) wins; otherwise it falls back to the type name,
  auto-numbered only when >1 book shares the same kind + position. `LogbookCard` renders from it and gets
  an inline rename form (`updateLogbook({ label })`; clearing the field reverts to the auto label). The
  card previously labeled purely from kind+position and ignored the stored `label`. Frontend only — no
  migration, no redeploy (the `logbooks.label` column already exists).

## [0.55.1] — 2026-08-05

### Fixed
- **Logbook PDF compile more robust + self-diagnosing.** Several books were failing background processing
  at the "Building PDF" step with a generic "Couldn't build the PDF" and no clue why. `compileLogbookPdf`'s
  image loader (`loadDrawable`, formerly `loadBitmap`) now falls back to an `<img>` decode when
  `createImageBitmap` is unavailable or throws (Safari/iOS is flaky with it and can't decode HEIC library
  photos that way but decodes them natively in an `<img>`), and throws a specific message on a failed page
  fetch / decode / encode. `processBook` now appends the real error to the banner (e.g. "Couldn't build
  the PDF (Couldn't fetch a page (400)). …") so the actual cause is visible instead of hidden. Frontend
  only — no migration, no redeploy.

## [0.55.0] — 2026-08-05

### Added
- **PDF upload for the MM life-limited scan.** MM airworthiness-limitations sections almost always come
  out of the manual as a PDF, so the "Scan MM life-limited pages" tool now accepts a PDF directly instead
  of forcing you to photograph each page. `structure-logbook` accepts an optional `pdf_url` in the payload
  and, when present, sends the file to the model as a document input (`{ type: 'document', source: { type:
  'url', url } }`) rather than requiring images (the no-pages guard now allows a PDF-only request).
  `extractLogbooks(imageUrls, orgId, context, pdfUrl=null)` grew a 4th `pdfUrl` param. `PhotoPicker` gained
  a `pdf` flag that adds `application/pdf` to the **Upload** picker's accept (the camera/capture input stays
  image-only — you can't photograph a PDF). `Compliance.jsx` `MmScan.onPick` partitions PDFs vs images:
  each PDF is uploaded (purpose `logbook`), signed, and read as a document; any photos still go through the
  batched image path; the `limits` from every call are merged before `limitsToComplianceItems`.

### Deploy
- ⚠️ **Redeploy `structure-logbook` (JWT ON)** — no migration, reuses `ANTHROPIC_API_KEY`. Frontend
  (PhotoPicker / Compliance / extractLogbooks) ships with `main`.

## [0.54.0] — 2026-08-03

### Added
- **MM life-limited items fill their last-complied from logbook-scanned parts.** New pure
  `mergeScanParts(items, parts)` in `compliance.js` (+tests) matches a scanned `logbook_parts` entry to a
  life-limited / custom compliance item by token-based label match (plural-tolerant, every significant
  label word must appear) or part number, and fills last_date/last_tach when newer (skips the standard
  recurring set, which fills from `compliance[]`). Wired both ways: `LogbookAudit.processBook` merges the
  scan's `parts[]` into the compliance items alongside `compliance[]`; `Compliance.addMmItems` pre-fills
  newly-added MM items from `listParts` — so it works whether you scan the logbooks or the MM first. The
  life-limited chart + report table (already attributes-driven) reflect it. **No migration, no deploy.**

## [0.53.1] — 2026-08-03

### Changed
- **Notable events now opt-IN on the report** (like parts). Migration `033` flips
  `logbook_events.show_on_report` default to `false` and resets existing events to hidden. The `report`
  fn filter (`show_on_report != false`) already yields only opted-in records — **no report redeploy**.
  `EventRow` toggle reads `=== true`.
- **Bulk "On report: All / None"** controls on the Notable events + Parts sections (`LogbookAudit`,
  `setAllEventsReport`/`setAllPartsReport` — one query each) and on the Timed-items list (Compliance
  page `setAllReport`), so you don't toggle every record individually.

### Deploy
- **Run migration `033_events_report_default_off.sql`.** No report redeploy, no new secret.

## [0.53.0] — 2026-08-03

### Added
- **Per-record report visibility** for scanned records — notable events, parts/components, and timed
  items. Migration `032` adds `show_on_report` to `logbook_events` (default **true** — timeline stays a
  feature) and `logbook_parts` (default **false** — parts are opt-in). Timed-items visibility rides
  `attributes.compliance` (`show_on_report` per item, no column). `report` edge fn filters held events,
  returns opted-in parts as a new **"Components & parts"** report section, and `ReportView`'s compliance
  table skips held items. UI toggles: an "on report" flag on each event + part in `LogbookAudit`
  (shared `ReportToggle`), and an "On report" checkbox per item on the Compliance page. `logbooks.js`
  `updateLogbookEvent`/`updatePart`; `compliance.js` carries/persists `show_on_report`.

### Deploy
- **Run migration `032_report_visibility.sql`** and **REDEPLOY `report` (Verify JWT OFF)** (filters events,
  returns opted-in parts). No new secret.

## [0.52.0] — 2026-08-03

### Added
- **Aircraft profile auto-suggested from logbook scans.** `structure-logbook` already returns
  `specs`/`currency`/`equipment` (same fn the profile scan uses), but the logbook-scan client path
  discarded them. Now `extractLogbooks` carries them and `mergeExtractDrafts` merges them across batches
  (specs/currency fill-blanks, equipment concatenates). `LogbookAudit.processBook` builds a profile draft
  (`draftFromExtraction`) and `mergeProfileDraft`s it into `attributes.profile` (fill-blanks only, never
  clobbering) at scan time — so no separate scan is needed for records already in the logbooks. The
  profile page's "Scan to pre-fill" copy reframed for records *not* in the logbooks. **No deploy** (edge
  fn already returns these fields since v0.14.0). (+tests)

## [0.51.1] — 2026-08-03

### Fixed
- **Compression form (and its borescope uploader) not showing on some checklist items.** v0.50.2's
  `/\bcompression\b/i` was too strict — the trailing word boundary missed plural/combined titles (e.g.
  "compressions", "compression/leakdown"), so the form didn't render on those items. Loosened to
  `/\bcompression/i`, which still excludes "compressor" (turbo / A/C) but matches the real variants. (+tests)

### Changed
- **Checklist item dot now reflects status, not static risk.** The dot was the financial-risk band
  (fixed per item → looked random). It now mirrors the item's result: **hollow = not reviewed yet**, then
  green (OK) · amber (Monitor) · red (Discrepancy) · grey (N/A) — matching the status buttons. Risk moved
  to the tooltip. Frontend only.

## [0.51.0] — 2026-08-03

### Added
- **Borescope images per cylinder** on the compression item. The `CompressionForm` gains a per-cylinder
  borescope uploader (in test order): each shot is stored as normal per-item media tagged in the caption
  with its cylinder (`cyl:N`) — **no schema change**. Multi-file + video, upload-first (borescopes dump
  several files off their camera roll), plus take-a-shot. `lib/compression.js` `cylCaption`/`cylTag`
  (+tests). Tagged shots are kept out of the item's generic gallery. `report` edge fn now returns
  `caption` on item photos; `ReportView` `CompressionSection` groups borescope images under each cylinder,
  and the generic finding gallery excludes cylinder-tagged shots.

### Deploy
- Capture side is frontend-only (works now). The **per-cylinder grouping on the report** needs a
  **`report` redeploy (Verify JWT OFF)** for the photo `caption`. Until then borescope shots just appear
  in the item's general photo gallery on the report (not broken, just not grouped). No migration.

## [0.50.2] — 2026-08-03

### Fixed
- **Compression form no longer attaches to "compressor" items.** `isCompressionItem` matched any title
  containing "compress", so "Check turbo and compressor rotation" (and A/C-compressor items) got the
  compression form + report table. Tightened to `/\bcompression\b/i` (matches the test, not "compressor").
  `ReportView` compression section now also gates on `isCompressionItem`, so any stray data saved on a
  non-compression item is hidden (including on already-published report snapshots, filtered at render).
  Frontend only. (+tests)

## [0.50.1] — 2026-08-03

### Added
- **Auto-save status on the item notes field.** The findings/notes textarea now debounce-saves as you
  type (1.2s) in addition to on blur, and shows a live status: **Unsaved… → Saving… → Saved ✓**, with a
  **tap-to-retry** on failure. `patchItem` returns its error so the row can reflect the result; the
  debounce pauses during live dictation (which saves on stop). Frontend only.

## [0.50.0] — 2026-08-03

### Added
- **Differential compression test entry** on the compression checklist item. New `lib/compression.js`
  (pure + tested, 10): `isCompressionItem` (title match), `normalizeCompression`, `cylinderStatus`
  (below master orifice → 'low'), `compressionStats`, `isCompressionEmpty`, `saveItemCompression`.
  `InspectionDetail` renders a `CompressionForm` on any compression item — the day's **master orifice**
  reading + a value per cylinder (XX/80) + adjustable cylinder count (default 6) + notes; cylinders below
  the master orifice are flagged. Entry fields are ordered **1-3-5-2-4-6** (`cylinderOrder`, odds-then-evens,
  how a tech goes around the engine) but each is labeled/stored by its true cylinder number; the report
  table stays numeric 1→N. Stored on **`inspections.attributes.compression`** keyed by item id
  (**no migration**, and no change to the items query — safe before the pending DB deploys).
- **Report compression table.** `report` edge fn returns `inspection.compression`; `ReportView`
  `CompressionSection` prints a per-cylinder table (low readings flagged) for any item with data.

### Deploy
- Capture side is frontend-only (attributes). The report table needs the **pending `report` redeploy**
  (already required for v0.48.0/0.49.0) — one redeploy covers all three. No migration.

## [0.49.0] — 2026-08-03

### Added
- **Published report revisions.** Publishing now freezes a **snapshot** (a revision) instead of serving
  live data, so edits made after publishing stay in draft until the next revision is published. Migration
  `031` adds `report_revisions` (org-scoped RLS) + `inspections.current_revision`.
  - `report` edge fn rewritten as two actions in one fn: **serve** `{token}` (public — returns the latest
    frozen revision's snapshot, media paths re-signed per request; falls back to live assembly for legacy
    published inspections) and **publish** `{action:'publish', inspection_id, note?}` + Bearer (self-verifies
    the JWT + org membership, assembles a snapshot with storage **paths**, inserts the next revision, stamps
    `status/published_at/current_revision`). Assembly + signing factored into `assemble()` / `signPayload()`.
  - `lib/report.js`: `publishInspection` now calls the fn's publish action (returns
    `{revision, published_at, share_token}`); new `listRevisions`. `InspectionDetail` `PublishBar` shows the
    current revision, a **"Publish revision N"** button, a draft-until-next-revision hint, and revision
    history. `ReportView` footer shows "Revision N". `getInspection` selects `current_revision`.

### Deploy
- **Run migration `031_report_revisions.sql`** and **REDEPLOY `report` (Verify JWT OFF)** — the redeploy
  also covers v0.48.0 (video `kind` on the report). The publish action self-verifies the Bearer token, so
  the function stays JWT OFF. No new secret.

## [0.48.0] — 2026-08-03

### Added
- **Video capture** at the inspection photo points. `PhotoPicker` gains a `video` flag →
  `accept="image/*,video/*"` (scan/OCR pickers stay image-only). Enabled on per-item **discrepancy**
  media (`InspectionDetail`) and the **photo walkthrough** (`OverviewCapture`); both render `<video>` for
  `kind === 'video'`. The data layer already supported video (`media.kind` allows `'video'` since
  `001_init.sql`; `mediaKind()` + `uploadMedia` tag it) — **no migration**. `report` edge fn now returns
  `kind` on overview + item media; `ReportView` plays clips inline (`.report__figure video` styled).

### Deploy
- **REDEPLOY `report` (Verify JWT OFF)** so videos render on the customer report. The capture side is
  frontend-only. No migration. (Storage note: Supabase's per-file size cap — default 50 MB — bounds clip
  length; raise it in the bucket settings if longer clips are needed.)

## [0.47.1] — 2026-08-03

### Changed
- **Phased checklists follow the checklist's own order.** For two-phase / uploaded checklists (e.g.
  Savvy), `InspectionDetail` now orders items within each phase by the template `sort_order` (the document
  sequence) instead of financial-risk order — new pure `orderByChecklist` in `risk.js` (+tests). Standard
  (non-phased) checklists keep the risk-ranked order. Display-only, so it applies **retroactively** to
  in-progress inspections (items already carry `sort_order`/`phase`; no data change). Frontend only.

## [0.47.0] — 2026-08-03

### Changed
- **Logbook audit reorg.** The records **search bar moved back to the top** of the page with matches
  rendering directly beneath it (extracted `EventRow`/`PartRow` reused by the results panel + the full
  lists below). **AD compliance** is no longer a long inline list burying the page — it's a compact card
  that links to a new **AD compliance chart page** (`/app/inspections/:id/ad-compliance`,
  `AdCompliancePage`): every AD de-duped by number with recurring flag, last-complied, **next due**, a
  status (overdue / due-soon / current), source chips (report vs logbooks), a page hotlink, and the
  cross-check advisories, worst-first.

### Added
- **AD next-due.** `structure-logbook` reads `next_due_date` / `next_due_hours` for recurring ADs off an
  AD compliance report (migration `030` adds the columns to `logbook_events`); `lib/ad.js`
  `compileAdCompliance` carries next-due (+tests); the AD chart computes overdue/due-soon from it.

### Deploy
- **Run migration `030_logbook_event_next_due.sql`** and **REDEPLOY `structure-logbook` (Verify JWT ON)**
  for AD next-due. The search/AD-card/AD-chart reorg is frontend-only. Reuses `ANTHROPIC_API_KEY`.

## [0.46.1] — 2026-08-03

### Added
- **Re-read a logbook** (backfill for books scanned before v0.45/0.46). A "Re-read" action on each
  `LogbookCard` enqueues `processBook` with `mode: 'reread'` — it clears the book's extracted events/parts
  (`deleteScanRecordsForLogbook`) so re-reading the same pages doesn't duplicate them, then reads all
  pages fresh (page base 0), storing `source_page` and merging compliance. Behind a two-step confirm
  (replaces any manual entries on that book). Frontend only — no deploy.

## [0.46.0] — 2026-08-03

### Added
- **Hotlink each record to its scanned PDF page.** `structure-logbook` now returns a 1-based `page` on
  each event + part (which page image it was read from). `lib/logbooks.js` `offsetDraftPages` (+tests)
  turns per-batch page numbers into positions across the whole read set; `processBook` shifts by the
  existing page count on an amend and stores `source_page` on events/parts (migration `029` adds the
  columns). The Logbook audit renders a **"p.N"** `PageLink` on each event, part and AD (via a
  `logbook_id → signed PDF url` map + the `#page=N` fragment) that opens the logbook's compiled PDF at
  that page. `lib/ad.js` `compileAdCompliance` carries a `ref` (logbook + page) to the most-recent
  scanned occurrence for the AD link. Page links are internal-only (not on the customer report).

### Deploy
- **Run migration `029_logbook_source_page.sql`** and **REDEPLOY `structure-logbook` (Verify JWT ON)**
  (the redeploy also covers v0.45.0's `compliance` + `limits`). No new secret.

## [0.45.0] — 2026-08-03

### Added
- **Timed items auto-populate from logbook scans.** `structure-logbook` now also extracts a `compliance[]`
  array (most-recent annual / pitot-static 91.411 / altimeter / transponder 91.413 / ELT + battery 91.207 /
  vacuum pump / Beech wing-bolt, with date + tach). The scan pipeline (`processBook`) reads it and
  auto-fills the Timed-items tool via `mergeScanCompliance` (only when the scan is newer than what's
  recorded), persisted to `attributes.compliance`.
- **Scan MM life-limited pages.** `structure-logbook` gains a `limits[]` output + a `mm_limits` context
  (Airworthiness-Limitations / life-limited table → item, part number, hours/cycles/months). New `MmScan`
  section on the Compliance page: upload MM pages → review the extracted limits → add as `mm-scan`
  compliance items (`limitsToComplianceItems`). Both helpers pure + tested.
- `lib/logbooks.js` `extractLogbooks`/`mergeExtractDrafts` carry `compliance` + `limits`.

### Deploy
- **REDEPLOY `structure-logbook` (Verify JWT ON)** for the new `compliance` + `limits` extraction. No
  migration; reuses `ANTHROPIC_API_KEY`.

### Backlog (from this session, not yet built)
- Let the inspector **edit/correct items flagged during processing** inline.
- **Hotlink each item** (event / part / AD / compliance) to the section of the scanned PDF it came from.

## [0.44.0] — 2026-08-03

### Added
- **AD compliance resource + comparison.** New `lib/ad.js` (pure + tested): `parseAdNumbers` (modern +
  legacy AD-number formats), `compileAdCompliance(events, logbooks)` de-dupes AD-category events by AD
  number and attributes each to a source by the source logbook's kind — `kind='ad'` → the scanned AD
  compliance report, anything else → the logbooks — then diffs the two: ADs on the report but not in the
  logbooks (**unverified**) and ADs in the logbooks but not on the report. `LogbookAudit` renders an **AD
  compliance** section (compiled list with recurring flag, latest date/tach, source chips + the
  cross-check advisories). No new AI — reuses the AD events already read off scans.
- **Duplicate-scan flag** (analysis level, per the product call). `lib/logbooks.js` `duplicateEvents`
  (+tests) groups identical entries (category/title/date/tach); the audit surfaces "N possible duplicate
  entries — a page may have been scanned twice."

### Deploy
- Frontend only — no migration/redeploy.

### Next
- **MM life-limited scan** (photograph the Maintenance Manual limits pages → auto-add timed items) is the
  remaining increment; it needs a vision-extraction path (edge fn).

## [0.43.0] — 2026-08-03

### Added
- **Timed items & compliance tool** (`/app/inspections/:id/compliance`, linked from the inspection tools
  for aviation). Tracks recurring inspections + life-limited items for the airframe. `lib/compliance.js`
  (pure + tested, 21 cases): a baked-in standard aviation set (`annual` 12mo, `pitot_static`/`altimeter`
  91.411 24mo, `transponder` 91.413 24mo, `elt` 91.207 12mo, `elt_battery` by-date, `vacuum_pump` ~500hr)
  plus make-specific (`wing_bolts` for Beech); `normalizeCompliance` merges stored last-complied onto the
  defaults + custom items; `dueStatus` computes next-due by calendar months and/or hours (worst-of governs)
  → overdue / due-soon / current / unknown; `complianceRows`/`complianceStats`/`saveCompliance`. Stored on
  `inspections.attributes.compliance` (JSONB — **no migration**). The page: current-airframe-time field
  (prefilled from the profile), per-item last-complied date/tach + note + not-applicable, add-custom-item,
  status badges, worst-first order.
- **Report compliance table.** `report` edge fn now returns `inspection.compliance`; `ReportView` renders
  a "Timed items & compliance" table in Part 1 (recorded items only, worst-first, colored status).

### Deploy
- **REDEPLOY `report` (Verify JWT OFF)** so the report returns `inspection.compliance`. No migration, no
  new secret. (Frontend/tool works without it; only the report table needs the redeploy.)

### Next
- MM life-limited-items **scan** (photograph the Maintenance Manual limits pages → auto-add items) is the
  follow-up increment. Duplicate-page handling to be addressed at the analysis level.

## [0.42.2] — 2026-08-03

### Fixed
- **Logbook records search results now sit directly under the search bar.** The `lb__searchbar` moved from
  the top of the page to head the Notable events + Parts sections, so matches show right below the box
  instead of at the bottom of the page. Frontend only.

## [0.42.1] — 2026-08-03

### Added
- **Auto-sequential logbook ordering.** New pure `orderLogbooks(logbooks)` (+tests) sorts by kind →
  position → start tach (untimed sinks to end, per the `hasTach` 0=unread convention) → start date → scan
  order. `LogbookAudit` uses it for the card list, so books scanned/labeled out of order still present in
  the right sequence. (Reconciliation already flagged gaps/overlaps/out-of-order; the display now matches.)
- Frontend only — no migration/redeploy.

## [0.42.0] — 2026-08-03

### Changed
- **Logbook scan processing is now fully background.** The compile-PDF + read-pages pipeline moved out of
  `ScanFlow` (which used to block on a `process` step) into `LogbookAudit`: `ScanFlow.finish()` uploads
  are already done, so it just calls `onQueue({ book, capturedIds, mode })` and closes. The parent runs a
  serial queue (`queueRef`, one book at a time — gentle on a phone) via `processBook`, writing progress to
  a `jobs` map keyed by logbook id.
- **Per-book progress, mobile + desktop.** A new `ProcessingBanner` (always-visible strip) lists every
  book still processing with a phase label + progress bar; each `LogbookCard` shows a "Processing…" badge.
  On completion the card's key bumps (`rev`) so it re-fetches its now-compiled PDF/pages; aggregates
  (events/parts/reconciliation) refresh. A failed job stays in the banner with **Retry**/**Dismiss** (the
  pages are already saved).

### Notes
- Search was already shipped (v0.40.0): the search box on the Logbook audit page searches that aircraft's
  events + part numbers once a scan is read.
- Frontend only — no migration/redeploy. Ships on push to `main`.

## [0.41.2] — 2026-08-03

### Fixed
- **Enter in the identifier field runs the lookup, not the form submit.** On `NewInspection` (inspection,
  listing, or records), pressing Enter after typing an N-number/HIN now triggers "Look up" (when the
  vertical has a lookup) instead of creating the job prematurely. Frontend only.

## [0.41.1] — 2026-08-03

### Added
- **"Reset to standard checklist"** on `InspectionDetail`'s `ChecklistPicker`. Inspections created before
  v0.41.0 carry auto-applied shop-template items but no `attributes.template_id`, so the dropdown reads
  as "Standard" and a same-value `<select>` change can't fire to rebuild them. When the standard option
  is selected but the items carry phases (only shop templates like Savvy have those), we now detect the
  stale state and show a button that force-rebuilds on the standard library via `setInspectionChecklist(_,
  null)`. Only offered before any item is worked.

### Deploy
- Frontend only — no migration/redeploy. Ships on push to `main`.

## [0.41.0] — 2026-08-03

### Changed
- **Shop-uploaded checklists are now opt-in per inspection** (fixes: an uploaded Savvy checklist silently
  took over every matching inspection). `checklist.js` `findTemplateFor` no longer auto-prefers a
  shop-owned template — it resolves an explicitly-chosen template via `inspection.attributes.template_id`,
  else falls back to the standard global library (model-specific → generic). Selection points:
  - **NewInspection** — a **Checklist** picker (shown when the shop has uploaded checklists, inspection
    mode only): "Standard checklist (auto by make/model)" default, or one of the shop's templates →
    stored on `attributes.template_id` at create (`createInspection` threads `templateId`).
  - **InspectionDetail** — a **ChecklistPicker** to switch between the standard library and a shop
    template, allowed only before any template item is worked. New `setInspectionChecklist(inspection,
    templateId)` persists the choice, drops template-derived items (custom items preserved), and
    re-instantiates via the extracted `instantiateTemplate` helper.

### Fixed
- **Records-mode jobs no longer instantiate a checklist.** `ensureInspectionItems` now skips
  instantiation for `mode === 'records'` as well as `'listing'` — a records-onboarding job stays a clean
  scan-and-search records resource (previously it grabbed the shop's checklist and looked like a full
  pre-purchase).

### Deploy
- Frontend + client-lib only — **no migration, no edge-function redeploy.** Ships on push to `main`.

## [0.40.0] — 2026-06-30

### Added
- **Records onboarding** — run the logbook-audit workflow on a first-time aircraft as an internal records
  job (no prepurchase checklist). Migration `028_records_onboarding.sql` extends `inspections.mode` with
  `'records'`. `NewInspection` supports `?mode=records` (simplified: no customer fields, no mode picker);
  Dashboard has an **"Onboard records"** action + a **Records** row tag. `InspectionDetail` renders a
  capture-only records layout (`captureOnly = isListing || isRecords`) — logbook audit up front, no
  checklist/walk-around/gear-rigging/follow-ups/handoff, and a **"Start inspection from these records"**
  promote button (reuses `startInspectionFromListing`).
- **Searchable part numbers.** `structure-logbook` also extracts notable installed/replaced part
  numbers + components (`parts[]`); the scan stores them in a new `logbook_parts` table (migration 028,
  org-scoped RLS). `lib/logbooks.js`: `listParts`/`addParts`/`deletePart` + pure tested `searchRecords`
  (filters events + parts by text); `extractLogbooks`/`mergeExtractDrafts` carry `parts`.
- **Search box** in the Logbook audit — search an aircraft's events + parts; a **Parts & components**
  section lists the extracted parts (delete-confirmed).

### Deploy
- ⚠️ **Run migration `028_records_onboarding.sql`** and **redeploy `structure-logbook` (Verify JWT ON)**
  (now returns `parts`). Reuses `ANTHROPIC_API_KEY`.

## [0.39.0] — 2026-06-30

### Added
- **Upload-your-own checklists + two-phase inspections.** A shop can upload an inspection checklist PDF
  (e.g. Savvy's Beechcraft prebuy); Claude parses it into phase-tagged, section-grouped, risk-weighted
  items to save as a reusable **shop-owned template**. Two-phase checklists are worked Phase 1 → Phase 2.
  - Migration `027_checklist_phase.sql` — `phase` on `template_items` + `inspection_items`.
  - **`parse-checklist`** edge fn (JWT ON, `claude-opus-4-8`, PDF document input + structured output).
    Returns `{ name, two_phase, items[phase,category,title,description,risk_weight] }`; logs `ai_usage`.
    The source PDF is uploaded to private storage only to parse, then removed — a shop's licensed
    checklist stays the shop's; only the parsed template is kept.
  - `lib/templates.js`: `uploadAndParseChecklist`, `saveShopTemplate`, `listShopTemplates`,
    `deleteTemplate` + pure tested `groupByPhase`/`hasPhases`/`phaseLabel`. RLS already lets a shop own
    its templates (001).
  - `checklist.js`: `pickTemplate` (pure, tested) + `findTemplateFor` now prefers the shop's own template
    (exact model → fuzzy → make-wide → catch-all) before the global library; `phase` threads through
    `fanOutTemplateItems` / `ensureInspectionItems` / `addCustomItem`.
  - `pages/Checklists.jsx` (`/app/checklists`, Dashboard link, hidden for brokers): upload → review →
    save. `InspectionDetail`: **Phase 1 / Phase 2 tabs** with per-phase progress + a phase hint; new
    items tag the current phase.
- **Beech landing-gear rigging record.** `lib/gearrig.js` — Zefting Form Z-32-LGR baked in (header +
  ~15 parameters grouped up/down-travel, clearance, electrical, warning, servicing, each with spec /
  measured / Pass-Fail / remarks + sign-off). Pure tested helpers (`isBeech`, `normalizeGearRig`,
  `gearRigStats`, `isGearRigEmpty`). `pages/GearRigging.jsx` (`/app/inspections/:id/gear-rigging`),
  offered from the inspection tools for any Beechcraft. Stored on `inspections.attributes.gear_rigging`
  (no migration). `report` edge fn returns it; `ReportView` prints a gear-rigging table.

### Deploy
- ⚠️ **Run migration `027_checklist_phase.sql`**, **deploy `parse-checklist` (Verify JWT ON)**, and
  **redeploy `report` (Verify JWT OFF)** (gear-rigging on the report). `parse-checklist` reuses
  `ANTHROPIC_API_KEY`.

## [0.38.0] — 2026-06-29

### Added
- **Account type at signup: inspector / broker / both.** Migration `026_org_type.sql` adds
  `orgs.org_type` (default `inspector`). `signup` edge fn accepts + persists it. CreateShop has an
  account-type picker; brokers get a **listing-only** experience (their jobs default to `mode='listing'`,
  which already hides the checklist/walk-around/follow-ups), and the Dashboard/CreateShop/NewInspection
  terminology switches to "Listings"/"New listing". "Both" shops keep the per-job inspection-vs-listing
  picker; inspectors are unchanged. `lib/shops.js`: `ACCOUNT_TYPES` + pure tested helpers
  (`normalizeOrgType`, `accountTypeLabel`, `isBrokerOnly`, `showsModePicker`, `defaultMode`);
  `fetchMemberships`/`createShop` carry `org_type`. No RLS/data-model change — a listing is still an
  inspection with `mode='listing'` (016); this only drives the UI.

### Deploy
- ⚠️ **Run migration `026_org_type.sql`** and **redeploy `signup` (Verify JWT OFF)**.

## [0.37.0] — 2026-06-29

### Added
- **Logbook scans flag illegible reads.** `structure-logbook` now returns an `unclear` list — short
  notes on anything present-but-not-readable (smudged figures, faded handwriting). The scan flow stores
  it on the logbook (`logbooks.review_note`, migration `025`); the logbook card shows a **"Some entries
  were hard to read — verify against the PDF"** advisory listing what was unclear, with **"Mark
  reviewed"** to clear it (appends on amend). The full-res page PDF is always retained as the source of
  truth. `lib/logbooks.js`: `extractLogbooks`/`mergeExtractDrafts` carry `unclear`; `listLogbooks` +
  logbook selects return `review_note`.

### Deploy
- ⚠️ **Run migration `025_logbook_review_note.sql`** and **redeploy `structure-logbook` (Verify JWT ON)**.

## [0.36.1] — 2026-06-29

### Added
- **More logbook continuity checks** (`reconcileLogbooks`, pure + tested): flags a book with **no
  readable times** (can't be placed in the sequence — re-scan or enter by hand), and an **airframe
  coverage** advisory when the earliest airframe entry is well above zero (an early logbook may be
  missing). Coverage is airframe-only — engine/prop replacements legitimately start later. Out-of-order
  scanning is already handled (reconciliation sorts by time). `summarizeKind` returns `untimed`;
  `hasTach` helper (raw, doesn't coerce null→0). Frontend only — no migration/deploy.

## [0.36.0] — 2026-06-29

### Added
- **AD-report and Form-337 scan types.** Migration `024_logbook_record_kinds.sql` extends
  `logbooks.kind` with `ad` + `form_337`. They appear in the "Scan a logbook" picker and store as their
  own scanned record (pages + compiled PDF). `lib/logbooks.js`: `TIME_KINDS` (airframe/engine/propeller/
  other) — reconciliation now iterates these so AD/337 records (no tach span) don't clutter it.

### Changed
- **Context-aware logbook reads.** The scan flow now passes the logbook's `kind`/`position` to
  `structure-logbook`. An engine/prop book reports **that component's own time** (since new / overhaul)
  for the span instead of the airframe tach (fixes a prop log reading the wrong "time since new"); AD and
  337 scans are read as dated events (category `ad` / `337`). `extractLogbooks(urls, orgId, context)` +
  `extractLogbooksBatched(.,.,{ context })`.

### Fixed
- **AI cleanup no longer reorders the list.** InspectionDetail held the item list in live financial-risk
  order, so "Clean up with AI" (which sets status + severity) made the item jump and you'd lose your
  place. The display order is now ranked once on load and held stable while you work (new items append in
  risk order; re-ranks on reload).

### Deploy
- ⚠️ **Run migration `024_logbook_record_kinds.sql`** and **redeploy `structure-logbook` (Verify JWT ON)**
  (context-aware reads + AD/337). The reorder fix is frontend-only.

## [0.35.1] — 2026-06-29

### Added
- **In-app continuous camera for logbook scanning** (`components/CameraCapture.jsx`, getUserMedia live
  preview + shutter). Replaces the click-in/click-out per page of the native file-capture input — tap
  the shutter to grab page after page without leaving. Falls back to the camera-roll upload path when
  getUserMedia is unavailable / denied. `PhotoPicker` gained an `uploadOnly` prop (the scan flow shows
  "Open camera" + "Add pages" from the roll).
- **"Change type" on a logbook** — fix a mis-categorized scan (e.g. engine log saved as airframe). Re-pick
  type/position; the logbook is updated, its PDF caption relabeled, and its events realigned to the new
  position (`reassignLogbookEvents`).

### Notes
- Frontend only — uses existing columns (`logbook_events.position`, `media.logbook_id` from migration
  023). No new migration or edge-fn change.

## [0.35.0] — 2026-06-29

### Changed
- **Logbook audit is now scan-driven, per-logbook.** Decluttered the interface: manual "add a logbook"
  by hand is gone (data comes from the scan, still editable). New flow: **"Scan a logbook"** → pick
  type/position (airframe, engine #1/left, prop #2, …) → snap pages sequentially → on finish it
  **compiles that logbook's PDF and auto-reads** the time span + notable events off the pages. Each
  logbook is its own scan with its own PDF; **"Add pages"** appends + re-compiles + reads the new pages,
  and a per-card **"Manage pages"** does rotate / reorder / delete + re-compile.
- **Delete confirmations everywhere** (pages, PDFs, whole logbooks, events) — a two-step `ConfirmButton`,
  since the phone interface made accidental deletes too easy.
- Replaces the combined single-PDF page manager (v0.34.0) with per-logbook PDFs.

### Added
- Migration `023_media_logbook_link.sql` — `media.logbook_id` (FK → `logbooks`, cascade) so pages and
  the compiled PDF belong to a specific logbook.
- `lib/logbooks.js`: `updateLogbook`, `logbook_id` on events, pure tested `spanFromDrafts` /
  `mergeSpan` (reduce batch extraction drafts to a book's time span). `lib/media.js`:
  `listMediaByLogbook`, `logbookId` on `uploadMedia`.

### Deploy
- ⚠️ **Run migration `023_media_logbook_link.sql`.** No new edge-fn change — the already-pending `report`
  redeploy (v0.34.0, JWT OFF) covers the per-logbook PDFs on the report (multiple `logbook_pdf` rows).

## [0.34.0] — 2026-06-28

### Added
- **Logbook page manager + compiled PDF.** The scanned logbook pages can now be reordered, rotated, and
  pruned, then compiled into a single PDF copy of the book — stored with the inspection and optionally
  shown (as a download link) on the customer report.
  - Migration `022_media_logbook_pdf.sql` — adds `media.sort_order`, `media.rotation`,
    `media.show_on_report`, and a `logbook_pdf` value to the `media_purpose` check.
  - `lib/media.js`: `listMediaByPurpose`, `updateMedia`, `sortOrder` on `uploadMedia`; selects the new cols.
  - `lib/logbookpdf.js`: client-side PDF compile via **lazy-imported `pdf-lib`** (own chunk). Pages are
    processed **one at a time and downscaled** (canvas → JPEG, rotation baked in) so an 80–100-page book
    won't exhaust phone memory. Pure tested helpers `normalizeRotation`/`rotateStep`/`reorderUpdates`.
  - `LogbookAudit`: "Logbook pages & PDF" manager (thumbnail grid, rotate / reorder / delete / add pages,
    compile with progress, current-PDF card with download + "Show on report" toggle + re-compile).
  - `report` edge fn returns inspection-level `documents` (logbook PDFs flagged `show_on_report`, signed);
    `ReportView` renders a **Records** section in Part 1.
  - New dependency: `pdf-lib` (lazy chunk, ~420 KB — not in the main bundle).

### Deploy
- ⚠️ **Run migration `022_media_logbook_pdf.sql`** and **redeploy `report` (Verify JWT OFF)**.

## [0.33.0] — 2026-06-28

### Added
- **Bulk logbook scanning — whole logbook in one pass.** The OCR import previously processed only a
  single batch (the edge fn caps images per request); a full 80–100-page logbook didn't fit. Now the
  client uploads all selected pages (limited concurrency, with a progress bar) and reads them in
  **batches**, merging the drafts.
  - `lib/logbooks.js`: pure `chunk` + `mergeExtractDrafts` (+tests) and `extractLogbooksBatched`
    (sequential batches, per-batch `onProgress`, `partial` flag when some batches fail but others
    succeed — keeps what came through rather than failing the whole scan). `SCAN_BATCH_SIZE = 12`.
  - `LogbookAudit` "Scan & import": bulk upload with progress, batched read with progress, a
    partial-read notice, and clearer copy (use **"Upload pages"** to multi-select the whole book; the
    camera captures one page at a time).
  - Client-only — calls the existing `structure-logbook` edge fn multiple times. **No migration, no deploy.**

## [0.32.3] — 2026-06-28

### Changed
- **Guided photo walkthrough is faster — removed the redundant in-app confirm.** iOS already makes you
  confirm "Use Photo" in the native camera, so the in-app "Keep & continue" was a second confirmation of
  the same thing. Now a captured shot uploads immediately; the **first photo of a shot auto-advances** to
  the next (the fast path), while **"Take another"** adds extra angles to the same shot without advancing.
  Added a **"← Back"** control to revisit a shot; retake = remove the photo and reshoot (or via the
  per-shot list below). `OverviewCapture` only; frontend, no deploy. Help FAQ updated.

## [0.32.2] — 2026-06-28

### Fixed
- **"Research with AI" showed a cryptic "Load failed".** When the long research call (Claude + web
  search) dropped at the network level — typically a weak connection — `researchAsset` surfaced the raw
  browser error. Now it returns an actionable message ("…likely a weak connection during this long
  lookup. Try again on stronger signal/Wi-Fi, or fill the profile manually."). Frontend only; does not
  change the underlying cause (see edge-function logs if it persists on a strong connection).

## [0.32.1] — 2026-06-28

### Added
- **Dashboard "loose ends" badge.** The inspection list shows the open follow-up count per inspection
  so loose ends are visible across jobs at a glance. `lib/followups.js` `openFollowupCounts(orgId)`
  (one query per shop) + pure tested `tallyByInspection`; `Dashboard` renders the badge. Frontend only
  (no migration / no deploy).

## [0.32.0] — 2026-06-28

### Added
- **Inspection follow-ups / "to-investigate" list.** A per-inspection backlog of open questions, kept
  separate from `inspection_items` so findings (conclusions) stay clean. Each follow-up has a `reason`
  (research / look-deeper / awaiting-records / second-opinion / other), a `status` (open / resolved /
  dismissed), and an opt-in `show_on_report`.
  - Migration `021_inspection_followups.sql` — `inspection_followups` table + org-scoped RLS (one
    `for all` policy via `user_org_ids()`), optional `inspection_item_id` link, cascade on inspection.
  - `lib/followups.js`: CRUD (`listFollowups`/`addFollowup`/`updateFollowup`/`deleteFollowup`) + pure,
    tested helpers (`openCount`, `groupByStatus`, `groupByReason`, `reportFollowups`, `reasonLabel`).
  - `InspectionDetail`: a **Follow-ups panel** (quick-add with reason + show-on-report, list with
    resolve/dismiss/reopen/delete + per-row report toggle, open-count badge) and a one-tap **"flag for
    follow-up"** (magnifier) on every checklist item. The publish bar shows a soft reminder when
    follow-ups are still open (non-blocking).
  - `report` edge fn returns opted-in, non-dismissed follow-ups; `ReportView` renders a
    **"Recommended for further evaluation"** section.

### Deploy
- ⚠️ **Run migration `021_inspection_followups.sql`** and **redeploy `report` (Verify JWT OFF)** for the
  report section.

## [0.31.0] — 2026-06-28

### Added
- **Dictate-the-whole-walk-around tool** (`/app/inspections/:id/walkaround`, linked prominently from the
  inspection's tools row). The mechanic talks through the entire walk-around in one continuous pass; the
  new **`structure-walkaround`** edge fn (Claude `claude-opus-4-8`, structured `json_schema`) splits the
  monologue into discrete findings, maps each to the best-matching checklist item (or proposes a new
  custom item), and writes a clean customer-facing note + status/severity/confidence per finding.
  - `lib/walkaround.js`: `parseWalkaround` (edge-fn client) + pure, tested helpers `itemsContext`,
    `buildReviewRows` (resolve AI output against current items), `planApply` (→ item patches +
    new-item drafts), `acceptedCount`.
  - `pages/Walkaround.jsx`: record (continuous `useDictation`, typed/paste fallback for iOS Safari) →
    **review-before-apply** (edit wording/status, re-map to a different item, untick; low-confidence
    flagged) → apply (patches matched items via `updateInspectionItem`, `addCustomItem` for new) →
    **"fill in the blanks"** (still-pending items, risk-ordered).
  - Per-vertical: parses against that inspection's own checklist (aircraft / boat / home).
  - `structure-walkaround` logs token usage to `ai_usage` (fire-and-forget) like the other AI fns.

### Deploy
- ⚠️ **Deploy `structure-walkaround` (Verify JWT ON).** Reuses `ANTHROPIC_API_KEY`. No migration.

## [0.30.3] — 2026-06-28

### Fixed
- **"Research with AI" timed out.** `claude-opus-4-8` defaults to high effort, which (with up to 6 web
  searches) ran for minutes. Set `output_config.effort: 'low'` (it's structured extraction, not deep
  reasoning), cut `web_search` `max_uses` 6 → 3, and told it to answer mainly from knowledge and search
  only briefly to confirm. ⚠️ **Redeploy `research-asset` (JWT ON).**
- **Vertical-specific Summary placeholder.** The profile Summary box showed an aircraft example for every
  vertical; now driven by `profileSchema().summaryPlaceholder` (aircraft / vessel / property). Frontend.

## [0.30.2] — 2026-06-28

### Changed
- **HIN lookup tells you the source of each detail.** `lib/marine.js` `lookupHIN` now returns `mic` +
  `builder_matched`; `NewInspection` shows, on a marine lookup, "✓ Builder matched in the USCG database
  (MIC xxx); model year & serial read from the HIN" — or, when the MIC isn't on file, "…builder code xxx
  isn't in the USCG database — enter the builder below." Aviation shows "from the FAA registry." Makes it
  obvious when the builder came from the (now fully-loaded) USCG MIC database vs. parsed from the HIN.
  Frontend only.

### Ops
- **USCG MIC bulk-load complete** (~16k builders) via the GitHub Action (needed `ENCODING 'WIN1252'`).

## [0.30.1] — 2026-06-28

### Fixed
- **"Research with AI" returned a model guess but 0 filled fields.** The `research-asset` prompt was
  over-conservative ("only report what you find via search; never invent figures"), so when web results
  were thin Claude left every spec blank rather than using its knowledge of a well-documented model.
  Reworked the system + user prompt to fill the model's **typical published specs** from web search
  **and** its own knowledge (still a verify-me draft; blank only when there's no standard value).
  ⚠️ **Redeploy `research-asset` (JWT ON).**
- `researchAsset` now has a 150s client-side timeout (clear message instead of an indefinite
  "Researching…") + a "this can take up to a minute" hint while it runs. Frontend.

## [0.30.0] — 2026-06-28

### Added
- **AI auto-profile — "Research with AI."** Drafts the profile spec sheet from year/make/model so the
  autofill feels professional. For human review (typical-for-the-model, not the specific unit).
  - `supabase/functions/research-asset/index.ts` — **new edge fn (JWT ON, service role for `ai_usage`).**
    `claude-opus-4-8` + the **web_search_20260209** server tool (dynamic filtering, no beta header) +
    structured output (`output_config.format`). The client sends the vertical's profile field defs
    (keys+labels); the fn builds a json_schema that fills our exact keys and returns
    `model_guess`/`confidence`/`summary`/`specs`/`currency`/`engines`/`props`/`equipment`/`sources`.
    Handles `pause_turn`; logs `ai_usage`. **Deploy (JWT ON).** Reuses `ANTHROPIC_API_KEY`.
  - `src/lib/profile.js` — `researchAsset(inspection, orgId)` (builds the per-vertical payload from
    `profileSchema`) + pure `mergeResearchDraft` (fill-blanks specs/currency/per-engine, append
    equipment, set summary only if empty) (+2 tests, 134 total).
  - `src/pages/AircraftProfile.jsx` — `ResearchPrefill` panel: model guess + confidence + sources,
    tick-to-keep groups (specs/currency/engines/equipment/summary), merges into the form. All verticals.
  - Help FAQ +1.

### Notes
- ⚠️ **Deploy `research-asset` (JWT ON).** No migration, no new secret.

## [0.29.2] — 2026-06-28

### Added
- **USCG MIC bulk-loader (boat builder lookup).** The HIN lookup parses serial + model year correctly,
  but the builder comes from the MIC (first 3 chars) via `marine_mic`, which only had test rows — so
  real boats showed a blank builder. (A HIN never encodes the *model*, so Model stays manual.)
  - `scripts/marine/load-mic.mjs` (+`package.json`) — idempotent CSV→`marine_mic` upsert (stage verbatim,
    auto-detect mic/manufacturer/status columns, dedupe by MIC, 3-char filter). Mirrors the FAA loader;
    reuses the `SUPABASE_DB_URL` Session-pooler secret.
  - `.github/workflows/marine-mic-load.yml` — manual + quarterly; **defaults to the official USCG CSV**
    `https://uscgboating.org/downloads/MIC.csv` (~16k builders; browser UA + retry), overridable via
    `MIC_SOURCE_URL`. One click, reuses `SUPABASE_DB_URL`. `docs/marine-mic-load.md` has the details.
    (Found the official direct CSV download — no scraping/third-party needed; loader derives active/
    inactive from the file's "Date Out of Business" column and treats literal `NULL` as blank.)
  - `supabase/migrations/020_marine_mic_seed.sql` — seeds **HUN → Hunter Marine** (verified) so a real
    builder resolves before the full list is loaded. **Run it.**

### Notes
- Diagnosed from a real HIN (`HUN38553A999` → Hunter, serial 38553, 1999) — parsing was correct; only
  the builder name was missing. Full coverage needs the MIC list loaded (set `MIC_SOURCE_URL` + run the
  Action), per `docs/marine-mic-load.md`.

## [0.29.1] — 2026-06-28

### Added
- **Delete on the dashboard list.** Owners/admins get a trash icon per inspection row (two-step "Delete?
  Yes/No" confirm) so test/junk inspections can be cleared without opening each one. Same
  `deleteInspection` (Storage cleanup + cascade) as the detail-page Danger zone; the detail-page delete
  stays. `Dashboard.jsx` `RowDelete` + styles. Frontend only.

## [0.29.0] — 2026-06-28

### Fixed / Changed
- **Per-vertical profile + report.** The profile "spec sheet" and report Part 1 were aviation-modeled,
  so a **boat (or home) shop's report showed aircraft fields** (airframe times, SMOH/props, FAA
  currency like annual/transponder/ELT/O₂). Field sets, labels, section titles and which blocks render
  are now driven per vertical.
  - `lib/verticals.js` — new `PROFILE_SCHEMAS` + `profileSchema(vertical)` (specFields, currencyFields,
    hasEngines, engine/propFields, equipment group labels, damage columns, titles). Aviation mirrors the
    old shape exactly (back-compat); **marine** = LOA/beam/draft/displacement/fuel/water, engine hours,
    USCG documentation/haul-out/thru-hull, electronics/gear groups; **home** = sq ft/year built/beds/
    baths/etc, no engines, system-age "key dates", systems/appliances groups.
  - `lib/profile.js` — `emptyProfile`/`normalizeProfile`/`isProfileEmpty`/`buildSummaryContext` take a
    vertical (default aviation) and build bags from the schema keys; engines/props omitted when the
    vertical has none; legacy single-engine aviation migration preserved. (+5 tests, 30 total.)
  - `pages/AircraftProfile.jsx` + `pages/ReportView.jsx` — render from the schema (titles, fields,
    engine block only when `hasEngines`, equipment group labels). Header reads "{noun} profile".
    Scan-to-pre-fill stays aircraft-only (the vision extraction is aviation-specific).
  - Frontend only — the `report` edge fn already returns `vertical` + `profile`. **No migration / no
    redeploy.** Legacy aviation profiles render unchanged.

### Notes
- Follow-ups (backlog): marine/home scan-to-pre-fill (vision extraction per vertical); marine engine
  labels as Port/Starboard (currently Left/Right via the shared label helper).

## [0.28.0] — 2026-06-28

### Added
- **Delete an inspection / report (shop-side).** Owners and admins can permanently delete an inspection
  or listing from its detail page (a "Danger zone" with type-the-identifier confirmation).
  - `lib/inspections.js` `deleteInspection(id)` — removes the inspection's Storage objects first
    (`lib/media.js` `removeInspectionStorage`), then deletes the row. DB children cascade via FKs
    (items, media rows, logbooks, events, handoffs); `source/claimed_inspection_id` set null. A
    published inspection's report link goes dead. No migration.
  - `pages/InspectionDetail.jsx` — `DangerZone` (gated to owner/admin via the caller's membership
    role), type-to-confirm on the identifier. Help FAQ +1.
  - Note: RLS lets any org member delete; the owner/admin gate is enforced in the UI for now
    (tightening to an RLS role check is a possible follow-up).

## [0.27.2] — 2026-06-28

### Fixed
- **Sign-up with an existing email now shows a clear message** instead of a confirmation-email prompt
  that never arrives. Root cause of the reported "confirmation email didn't show up": Supabase's
  anti-enumeration returns a *fake success* (empty `data.user.identities`, no email) when the address
  already has an account. `Login.jsx` detects the empty-identities signal → "An account with this email
  already exists. Sign in below — or use Forgot your password?" and flips to the sign-in tab. Frontend
  only; no deploy.

### Backlog (high priority, logged in docs/backlog.md)
- **Per-vertical profile + report** — a boat shop's report currently shows aviation-specific spec/
  currency/engine fields; make the profile schema + report Part 1 vertical-specific (driven from
  `verticals.js`). **Sizable.**
- **Delete an inspection/report as a shop** — no delete exists today (only publish/unpublish); add an
  owner/admin delete with Storage cleanup + type-to-confirm. **Likely quick.**

## [0.27.1] — 2026-06-28

### Added
- **Shop drill-in / support view (platform dashboard).** Super admins can open any shop from the
  Customers list into a read-only support view: team (emails, roles, joined, last sign-in),
  inspections (identifier/asset/type/status/updated) and a link to each published report.
  - `admin-orgs` edge fn: new `org_detail` action (returns org + members-with-emails via
    `auth.admin.getUserById` + inspections). Part of the same not-yet-deployed function — no extra
    redeploy beyond the pending `admin-orgs` deploy.
  - `src/lib/admin.js` `fetchOrgDetail`; `src/pages/Admin.jsx` `OrgView` at `/admin/orgs/:id` ("Open"
    on each org card).
- This is a read-only support view, **not** true session impersonation (which would mint a session as
  another user — heavier and riskier; logged as a possible follow-up).

## [0.27.0] — 2026-06-28

### Added
- **Super-admin / platform-owner dashboard (Phase 1–3).** A platform-owner view that sits ABOVE the
  per-org RLS model — gated to super admins, invisible to normal shop users. Billing/Stripe is NOT
  wired up yet, so the **Financial** tab is a deliberate placeholder (no subscription/seat/comp
  controls anywhere).
  - `supabase/migrations/019_super_admin.sql` — `super_admins` table (email PK) + `is_super_admin()`
    SECURITY DEFINER RPC + `ai_usage` log table. RLS enabled, **no client policies** (service-role
    writes; client only reads its own super-admin status via the RPC). **Needs running.**
  - **Gate (two-tier):** a hardcoded founder (`brett@zeftingaviation.com`), mirrored in the client
    `AuthProvider` and every gated edge fn, PLUS the manageable `super_admins` table.
    `auth.jsx` exposes `isSuperAdmin`; `SuperAdminRoute` guards `/admin/*` (bounces non-admins to
    `/app`); a "Platform" link shows in the Dashboard top bar for super admins only.
  - `supabase/functions/admin-orgs/index.ts` — **new edge fn (JWT ON, service role, super-admin
    re-check).** Lists every shop with engagement metrics (members by role, inspections total/30d,
    listings, published, last-active), platform totals, and the roster; `add/remove_super_admin`
    (founder locked), `rename_org`, `delete_org` (cascade; auth users kept). **Deploy (JWT ON).**
  - `supabase/functions/admin-ai-cost/index.ts` — **new edge fn (JWT ON, service role).** Aggregates
    `ai_usage` over a window into estimated USD cost (per-model rate table, tunable in the fn) by
    feature, by shop, and by day. **Deploy (JWT ON).**
  - **AI usage logging:** `structure-finding`, `structure-logbook`, `generate-summary` now fire-and-
    forget a row to `ai_usage` (tokens + caller email + optional `org_id`) after a successful call.
    The 3 client wrappers + their call sites thread `org_id` for per-shop cost attribution.
    **Redeploy all three (JWT ON).**
  - `src/lib/admin.js` (+`admin.test.js`) — edge-fn wrappers + pure tested helpers (`formatUsd`/
    `formatCount`/`daysSince`/`relativeTime`/`engagementFlag`). `src/pages/Admin.jsx` + `admin.css` —
    Customers, Engagement (at-risk outreach list), AI cost, Financial (placeholder), Super admins.

### Notes
- Not surfaced in the in-app "What's new" by design — it's a platform-owner tool, not a shop feature.
- **Next (with billing):** Stripe sync + `finance_*` tables + the Financial tab (MRR/ARR/margin/CAC,
  snapshot-on-read). Optional later: a DB-backed editable AI rate table; per-org feature flags.

## [0.26.0] — 2026-06-28

### Added
- **Boat HIN lookup (marine Identify stage).** Marine inspections now have a "Look up" button, the boat
  analog of the N-number lookup. A modern 12-char Hull Identification Number is structured, so we parse
  the **serial** and **model year** straight from it client-side, and resolve the **builder** from the
  first 3 chars (the USCG **MIC**) via a small reference table.
  - `supabase/migrations/018_marine_mic.sql` — `marine_mic` table (mic PK / manufacturer / status) +
    RLS read-only to authenticated. Seeds TEST fixtures (`ABC`, `ZZZ`); the full USCG MIC list is a
    later bulk-load (see `docs/backlog.md`). **Needs running.** No edge fn.
  - `src/lib/marine.js` — pure `normalizeHIN` / `inferModelYear` / `parseHIN` / `shapeFromHIN` (+tests),
    and `lookupHIN` (parse + MIC query). `verticals.js` marine `hasLookup: true`.
  - `NewInspection` dispatches the lookup by the shop vertical (`lookupHIN` for marine, `lookupAircraft`
    otherwise); a missing MIC just leaves the builder blank (year/serial still fill).

### Notes
- HIN parsing covers the post-Aug-1984 12-char format. Builder resolution is only as complete as the
  `marine_mic` table — fixtures for now; bulk-load the public USCG MIC list to cover real builders.

## [0.25.0] — 2026-06-28

### Added
- **Cross-org broker handoff (broker epic Phase 2).** A broker hands a listing to another shop via a
  tokenized **claim link**; the shop claims it and the listing is copied cross-org into their org as a
  full inspection.
  - `supabase/migrations/017_handoffs.sql` — `handoffs` table (listing/from_org/token/to_email/
    to_shop_name/status/claimed_*) + RLS (broker side only). **Needs running.**
  - `supabase/functions/claim-listing/index.ts` — **new edge fn (JWT ON, service role).** `preview`
    returns the listing summary + originating shop; `claim` verifies the caller's membership in the
    target org, then copies the listing → new inspection incl. **cross-org Storage object copies**,
    logbooks and events, and marks the handoff claimed. **Deploy (JWT ON).** No new secret.
  - `src/lib/handoff.js` — `createHandoff` / `listHandoffs` / `revokeHandoff` (RLS), `handoffUrl`,
    `previewHandoff` / `claimHandoff` (edge fn).
  - `src/pages/ClaimListing.jsx` + `/claim/:token` route (ProtectedRoute) — preview + "Claim into [shop]".
  - `InspectionDetail` (listing) — `HandoffPanel`: create/copy/revoke handoff links; same-org "Start
    inspection in this shop" stays.

### Notes
- **Next:** auto-email the invite (needs app-email key) and a **searchable shop directory + expertise
  filter** (opt-in discoverability). Tracked in `docs/backlog.md`.

## [0.24.0] — 2026-06-28

### Changed
- **Landing-page repositioning.** `Home.jsx` rewritten for a broader audience and the whole
  sale/acquisition lifecycle: a "useful at every step" audience trio (sellers/brokers · inspectors/
  surveyors · buyers), vertical-neutral "how it works" + features, an **industries strip** (aviation ·
  marine · automotive & RV · real estate · more), and a **"Forged in aviation"** origin/credibility
  band. New `App.css` styles (`home__industries`, `home__industry`, `home__origin`). Frontend only.

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
