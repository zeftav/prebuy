# Backlog (interim)

Jira isn't connected yet — this is the holding pen. When Jira is up, migrate these to issues and
keep only the big-rock summaries mirrored in `CLAUDE.md`. Build-task checklist lives in
`CLAUDE.md` → TODO; this file is for product-level epics and open decisions.

---

## Canonical inspection workflow (Brett, 2026-06-27)

The end-to-end flow, in order. Stages are vertical-agnostic; only the resolver + knowledge-base
content differ per vertical. **Entry point is the identifier, not a blank form.**

1. **Identify** — first screen for a new job: enter the identifier (aviation → N-number; marine → HIN;
   home → address). Hit an external source to **prepopulate** everything we can.
   - Aviation: **FAA registry** lookup. e.g. `N3704A` → 1970 **A36 Bonanza**, S/N **E-212**, engine, etc.
   - This becomes a server-side **resolver** (edge fn) per vertical; result fills make/model/year/serial
     + `attributes`.
2. **Assemble from knowledge base** — use the resolved make/model(/year) to pull the relevant
   **PreBuy knowledge base** for that type and build the working checklist:
   - model-specific **base checklist** (e.g. a Bonanza pre-purchase template),
   - **common ADs / known trouble spots** (e.g. Bonanza landing-gear components),
   - each item carries a **financial-risk weight** (drives `risk.js` ordering).
   - Maps onto existing schema: a **global `checklist_templates` row** per make/model + `template_items`
     (already have `risk_weight`, `ata_chapter`, `est_cost_*`). Instantiate into `inspection_items`.
3. **Customize / prioritize** — the shop adds or re-prioritizes items (their own focus points) and
   folds in **owner-requested priorities** before starting. Per-job, on the instantiated
   `inspection_items` (they're an editable copy); shops can also customize their cloned template.
4. **Inspect (capture)** — walk items in risk order; **dictation** (Web Speech API) → edge fn → Claude
   structures the finding; **photos/videos** to Storage. Mark ok / monitor / discrepancy + severity.
5. **Report** — tokenized share link (no login) + PDF, served by the `report` edge fn.

### Logbook audit / research tool (Brett, 2026-06-27) — early-process, high value
A standout early step (it's **Section I** of the ABS prepurchase survey and where deals are made or
broken). Before/alongside the physical inspection, a guided **records audit**:
- **Completeness** — airframe/engine/prop logs present since manufacture; reconcile total time &
  SMOH/SPOH vs. advertised vs. tach/Hobbs; annual + IFR cert currency (static/transponder 24-mo, ELT,
  VOR 30-day).
- **AD/SB compliance** — pull the applicable AD list and crosscheck logs for compliance (recurring vs.
  terminating); flag open ADs. (Future: structured `kb_ads` per make/model + automated crosscheck.)
- **Damage & prop-strike forensics** — damage history + 337s; crosscheck any prop-strike against
  engine logs (teardown?) and airframe logs (gear-up/collapse + proper repair).
- **External research** — NTSB accident history, FAA title/lien search, registration chain.
- **Output** — a records-findings section that feeds the report + negotiation points.
This is a vertical-agnostic pattern (boats/homes have records too) but aviation is the deep case.
Likely leans on **dictation + AI structuring** and later document/photo upload of the logs. Big rock;
slot it as its own epic early in the inspection build. ABS checklist (Brett-supplied) is the reference
for the aviation version — **cite/reference, don't embed** (copyrighted; kept out of the repo).

**Built (v0.10.0, 2026-06-27):** structured tool — `logbooks` + `logbook_events` tables (migration
`008`), `lib/logbooks.js` reconcile (per-type gap/overlap detection + tracked hours, tested), and the
`/app/inspections/:id/logbooks` page (add logbooks, reconciliation panel, notable events). **Next:
photo→OCR import.** Photograph log pages (or import scans) → extract entries automatically. Recommended
path: reuse Storage (media) + **Claude vision** (an edge fn that takes page images → structured entries
+ events), since the AI/Storage plumbing already exists from capture. Could pre-fill logbook spans and
events for the inspector to confirm. Open question Brett raised: per-page entry extraction vs. "scan the
whole logs and extract everything" — lean to whole-log batch import with human review.

### Guided overview photo capture (Brett, 2026-06-27) — early-process
Early in the inspection (around stage 1–2, before/alongside working items), walk the inspector through
a **standard shot list** to document the whole asset for the report — **big-picture, not discrepancy**
photos. Each shot is **prompted** ("Now photograph the instrument panel", "left wing leading edge",
"engine — left side", "logbooks stack", "interior — front seats", …) so coverage is consistent and the
report has a clean photo set. Per-vertical shot lists (aircraft has ~12–20 standard angles; boat/home
differ). Distinct from the per-item discrepancy photos captured during the guided inspection. Stored as
`media` (kind=photo) linked to the inspection (not necessarily an item); a `purpose`/`tag` (e.g.
'overview' vs 'discrepancy') likely needed on `media`. Pairs naturally with the photo-capture build
(stage 4b). Mobile camera capture → Storage. Log as part of the capture epic.

**Open content/data questions (gating stage 1–2):**
- **FAA data source:** ingest the FAA *releasable aircraft database* into our own tables (durable,
  free, fast, no rate limit — recommended; doubles as KB spine) vs. a live third-party API. Until
  ingested, back the resolver with a small **seed fixture** (incl. `N3704A` test case) so the flow is
  end-to-end testable. Resolver interface stays identical either way.
- **Checklist content / ABS:** the **ABS** (American Bonanza Society) pre-purchase checklist is
  copyrighted — don't copy verbatim. Near-term: **PreBuy-authored** A36 checklist informed by public
  ADs + type knowledge. Longer-term: **partner/license** with type clubs ("official ABS checklist" as a
  selling point), and/or let shops import their own.
- **ADs / trouble spots:** fold key model AD-checks into the seeded checklist now; a structured `kb_ads`
  table can come later.

---

## EPIC: Multi-vertical platform (go big)

PreBuy is a **horizontal pre-purchase inspection platform**. Each domain is a pluggable **vertical**;
architecture must not assume aviation. Roadmap of verticals (aviation is the lead/reference):

| Vertical | Identifier | Resolver | Notes |
|---|---|---|---|
| **Aviation** (lead) | N-number | FAA releasable aircraft registration DB | Brett's expertise. |
| **Marine / yacht** | HIN + state reg | mostly manual (no clean public decoder) | Boat-surveyor SME. |
| **Home / property** | Address | manual now; property-data API later | Home-inspector SME. |
| **Automotive** | VIN | NHTSA vPIC (free public API) | Mechanic SME. |
| *(extensible)* | … | … | RVs, heavy equipment, etc. |

**Shared engine (vertical-agnostic):** checklist-template library, financial-risk ordering (`risk.js`),
dictation→AI findings, photo/video capture, published report + PDF, multi-tenancy/RLS.

**Per-vertical:** the identifier + its resolver adapter, and the checklist content.

**Go-big principle:** build aviation *concretely* on a *vertical-agnostic core*; adding a vertical =
config + a small resolver adapter + a seeded checklist, NOT a rewrite. Don't over-abstract ahead of the
2nd–3rd real vertical (no dynamic form-builder yet).

**Cheap-now design move — migration `002`, before any real data:**
- Add `vertical` to `inspections` + `checklist_templates`.
- Generic subject: a typed `identifier` + broadly-common columns (make/model/year) + a **JSONB
  `attributes`** bag for the long tail (serial, VIN details, sqft, beds/baths, hull material…), so
  plane/boat/house/car all fit one schema with no per-vertical migrations.
- Checklist library keyed by `vertical` + subtype.
- Identifier resolvers = pluggable per-vertical adapters (FAA / NHTSA / manual).

Status: migration `002` **done** (v0.3.0); vertical moved to the **shop** level in `003` (v0.3.1) —
a shop inspects one vertical, multiple verticals = multiple shops per login. Per-vertical checklist
content = separate later tasks (SMEs: boat surveyor, home inspector, mechanic).

### Future: self-serve "add an industry" (Brett, 2026-06-27)
Eventually a shop should be able to **add a new industry/vertical themselves** and either:
- **build their own** checklist + report template within the PreBuy framework (a guided
  vertical/checklist builder — identifier field, categories, risk weights, report layout), or
- **request a concierge build** (we build the vertical/checklist for them).

This is the monetizable end-state of the pluggable-vertical architecture: the engine stays
vertical-agnostic; customers extend it without code. Implies a **custom-vertical** data model
(verticals as rows, not a hardcoded enum/registry), a template/report builder UI, and a "request a
build" intake. **Not now** — revisit after the aviation path (capture → report) is proven and there's
real multi-vertical demand. Until then, verticals stay code-defined in `lib/verticals.js` +
the `vertical` CHECK constraint.

---

## DECISION (open): Mobile web vs. native iOS app

**Current direction:** mobile-web-first (responsive, installable PWA). Native is a **Phase-2 trigger**,
not a day-1 commitment.

- Report view + shop admin/refine: **web, always.** Question is only field capture.
- **Two risks that would justify native** (both real in this environment):
  1. **Dictation** — Web Speech API is unreliable on iOS Safari; native `SFSpeechRecognizer` is
     dependable + on-device/offline.
  2. **Connectivity** — hangars/marinas have poor signal; native enables offline-first capture +
     sync-on-reconnect.
- **Plan:** ship web; **prototype both risks in a real hangar/dock early**; if either fails, build a
  native **capture** app (lean React Native/Expo to reuse logic) while web keeps reports/admin.

Status: **decide after field-testing the two risks.** Revisit once the capture flow exists.

---

## Other near-term (tracked in CLAUDE.md TODO)
Auth + shop signup · Tooltip component + `/help` FAQ · FAA N-number lookup · capture flow
(dictation + media) · report view + PDF · seed first global checklist · Jira setup.
