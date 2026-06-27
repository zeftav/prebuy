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
whole logs and extract everything" — lean to whole-log batch import with human review. **Decided:
whole-batch import** (Brett, 2026-06-27).

**Extraction targets (Brett, 2026-06-27) — beyond logbook spans.** Target format derived from a real
broker listing Brett supplied (1980 58P Baron) — *reference only, listing text NOT stored in repo*. A
high-value listing/records-summary contains these blocks; PreBuy should be able to produce them:
- **Spec & currency summary:** TT, engine SMOH (+ shop/notes, e.g. "RAM to new limits, new cams, date"),
  prop SNEW (+ date), weights (MGTOW/BEW/useful/fuel/CG), and currency dates — **annual due, ELT battery,
  IFR 91.411/.413 due, O2 hydro, AD compliance**.
- **Notable maintenance — dated chronology.** A reverse-chronological list of significant entries, each
  `{date, description}` with an action verb (new / replaced / OH / repaired / SB / AD complied). This is
  the broker's "Miscellaneous Maintenance" block and is the high-value, manually-done piece. Coarser
  `logbook_events.category` (ad/337/overhaul/prop_strike/damage/other) is the highlight layer on top.
- **Damage history — explicit callout.** What happened, when, and crucially **what was / was not affected**
  (e.g. "2018 bird strike to RH cowl nose; prop/engine not impacted"). Brokers always state this.
- **Equipment list — categorized, with condition notes.** Two groups: **Avionics** (GPS/nav/comm,
  autopilot + modes, audio panel, transponder/ADS-B, engine monitor, radar, stormscope…) and **Additional
  equipment** (FIKI/known-ice, GAMIjectors, O2, A/C, winglets/VGs, long-range fuel…). Capture per-item
  **condition notes** ("engine-monitor display unreadable"). Storage TBD — likely
  `inspections.attributes.equipment` (JSONB, grouped) or a small table; surface on the inspection + report.
  Add an `equipment` array to the `structure-logbook` vision schema when building this.
- **Per-cylinder compressions** (e.g. "77,76,76,75,76,75") = a **structured measurement set** — ties to the
  gear-rigging measurement-forms item below (same {value, limit, pass/fail} pattern).

**Idea — broker-style summary / listing generator.** PreBuy already captures most of the above (times via
logbook reconcile, equipment via scan, findings, photos). A premium **report mode** could generate a clean,
broker-style write-up + spec sheet from the inspection data — narrative summary, spec/currency block,
maintenance highlights, damage callout, categorized equipment, photo gallery. High differentiation; pairs
with the report stage. (Generate original prose from structured data — Claude — not copied from any listing.)

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

## EPIC: Broker intake → portable "aircraft file" (Brett, 2026-06-27)

**The idea.** A second entry point aimed at **aircraft brokers** (a new persona, distinct from the
inspecting shop). A broker listing an aircraft can **start a file for the aircraft up front** —
identify it (N-number → FAA), **scan the logbooks** (existing OCR → logbook spans + events + profile
specs/currency/equipment), shoot the **guided overview photos**, and let AI draft the **narrative
summary**. That produces a rich, portable **aircraft record** the broker uses for the listing — and
that the **inspecting shop later picks up and amends** when it goes to pre-buy, instead of starting
from a blank inspection. The aircraft file becomes the through-line from listing → sale.

**Why it's strong.** Almost all the capture machinery already exists (logbook OCR v0.11/0.14, profile
extraction v0.14, guided overview photos v0.7, AI narrative v0.15). This is mostly **re-packaging +
a shared/portable record + a handoff**, not new capture tech. It also widens the funnel (brokers bring
aircraft in) and creates a moat: the same record serves two customer types across the deal lifecycle.

**Core architectural question — make the "aircraft" a first-class entity.** Today the profile,
logbooks, events, media, and findings all hang off a single `inspection` (and `attributes.profile`).
A broker's file should outlive/precede any one inspection and be **handed to another org**. Two shapes:
- **(A) First-class `subject`/`aircraft` entity** (cleaner long-term): the broker creates the
  **aircraft record** (identifier + attributes/profile + logbooks/events + overview media); an
  **inspection references it**. The shop's pre-buy is a new inspection attached to the same aircraft,
  inheriting the broker's groundwork. Fits the multi-vertical `subject` idea (migration `002` already
  generalized identifier/attributes). Bigger migration: move profile/logbooks/events/media FKs from
  `inspection_id` → `subject_id` (or dual-link).
- **(B) Lightweight "intake" inspection** (faster to ship): broker creates an inspection in an
  `intake`/`listing` status with the profile + logbooks + photos but no checklist findings; the shop
  **claims/clones** it into a working pre-buy. Less schema churn; risks duplicating the record.

**Cross-org handoff / sharing (the hard part).** Broker's org ≠ shop's org. Need a mechanism to grant
the shop access to the aircraft file — options: a **tokenized transfer/claim link** (like the report
share, but read-write claim), an **invite the shop to the file**, or a **copy-on-handoff** (snapshot
into the shop's org). RLS + ownership questions: who owns the file after handoff, what the broker can
still see, and whether the broker keeps a (possibly redacted) copy. Decide privacy defaults — a broker
may not want every internal note exposed, and a shop's findings may not flow back to the broker.

**Persona / packaging questions (open):**
- Is "broker" a **distinct role/account type**, or just a shop whose vertical/workflow is "listing prep"?
  (Leans toward a role flag + a trimmed, capture-only UI — no checklist/findings for brokers.)
- **Pricing:** broker-side listing-prep product vs shop-side pre-buy — one record, two entry points.
- **Listing output:** brokers want a clean **spec sheet / listing** export (the v0.15 narrative + Part 1
  profile already most of the way there) — possibly a broker-branded variant of the public report.

**Reuses, mostly as-is:** identify (FAA lookup), logbook OCR + audit, profile + scan-to-pre-fill,
guided overview photos, AI narrative, public report. **New work:** the aircraft-as-entity (A) or intake
status (B), the cross-org handoff/claim + its RLS, and a broker role + capture-only UI. **Not now** —
slot after the deploy batch + a look at the end-to-end report; revisit entity shape (A vs B) first.

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

## Reference library — manuals/expertise via Google Drive (Brett, 2026-06-27)
Brett to create a **Google Drive folder** of source material (shop/maintenance manuals, type-club
guides like the ABS landing-gear guide, SME notes) for Claude to **learn from** when authoring PreBuy
content. The Google Drive MCP connector is available in interactive sessions (`search_files`,
`read_file_content`, `download_file_content`), so Claude can read the folder during a session.
**Rules of the road:**
- **Reference, don't embed.** Most of this is copyrighted (Textron/Beech shop manuals, ABS guides).
  Use it to produce **original** PreBuy artifacts (checklists, measurement forms, risk weights, copy) —
  never commit the source docs or verbatim text to the repo. Same discipline as the ABS checklist.
- **Durable output lives in the repo, not the chat.** Knowledge from Drive only persists across sessions
  via what we commit (seed migrations, `lib/*`, docs). So the loop is: read Drive → author original →
  commit. Note the source (e.g. "informed by Beech A36 shop manual ch. X") in code comments, not the text.
- **Caveat:** the Drive connector may be absent in headless/cron runs (interactive auth); fine for
  normal working sessions.
Once the folder exists and is shared, point Claude at it (name/link) and it can verify access + start
pulling from it.

## Structured measurement forms — gear rigging first (Brett, 2026-06-27)
Some inspection items need **structured numeric capture against a spec**, not just ok/monitor/discrepancy
+ free text. First case: a **Beechcraft landing-gear rigging chart** — all pertinent measurements taken
during a gear rigging check (down-lock tensions, free play, uplock clearances, transit times, drag/side
brace dimensions, etc.), each with its **limit/tolerance** so the app can flag out-of-spec values. Source:
**Beech shop manuals + the ABS landing-gear guide** (reference → author original; see Reference library
above). Implies a new item/“measurement set” type: a labeled grid of {measurement, value, unit, min, max,
pass/fail}. Generalizes to other measured checks (compression readings, control-surface travel, cable
tensions). Pairs with the per-model checklist content; Brett to supply the spec values. Output feeds the
report.

## Marketing site / landing page (Brett, 2026-06-27)
Stand up a basic **product/landing page** at the apex `prebuy.app`, modeled on **yellowtag.app**, with
the app living at **`app.prebuy.app`** (mirrors `app.yellowtag.app`). Landing = what PreBuy is (horizontal
pre-purchase inspection platform; aviation first), who it's for (inspection shops), the core flow
(identify → checklist in risk order → dictation/photos → customer report), and a clear **CTA → sign up /
open app** pointing at `app.prebuy.app`. Keep it simple/static first (could be its own small Pages
project or a marketing route). Pairs with the prebuy.app cutover (deploy-checklist §6). Domain split:
**apex = marketing**, **`app.` = SPA** — set Cloudflare Pages custom domains + Supabase Auth URLs to match.

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
