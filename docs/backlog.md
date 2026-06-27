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

**Listing-creation engine for amateur/occasional brokers (Brett, 2026-06-27).** Beyond pro brokers,
this is a strong **listing-creation engine for amateur / one-off sellers** — an owner selling their own
plane, or a part-time broker who lacks the tooling to produce a polished listing. PreBuy walks them
through identify → scan logbooks → guided photos → AI narrative and hands back a **professional spec
sheet + write-up** they'd otherwise pay a pro to assemble. Lowers the barrier, widens the top of the
funnel, and seeds aircraft files into the database (feeds the report-resale asset below). Likely a
**guided, very simple "create a listing" path** + a self-serve price point.

**Persona / packaging questions (open):**
- Is "broker" a **distinct role/account type**, or just a shop whose vertical/workflow is "listing prep"?
  (Leans toward a role flag + a trimmed, capture-only UI — no checklist/findings for brokers.) Note the
  **amateur/owner-seller** tier as well — even simpler, listing-only.
- **Pricing:** broker-side listing-prep product vs shop-side pre-buy — one record, two entry points.
- **Listing output:** brokers want a clean **spec sheet / listing** export (the v0.15 narrative + Part 1
  profile already most of the way there) — possibly a broker-branded variant of the public report.

**Reuses, mostly as-is:** identify (FAA lookup), logbook OCR + audit, profile + scan-to-pre-fill,
guided overview photos, AI narrative, public report. **New work:** the aircraft-as-entity (A) or intake
status (B), the cross-org handoff/claim + its RLS, and a broker role + capture-only UI. **Not now** —
slot after the deploy batch + a look at the end-to-end report; revisit entity shape (A vs B) first.

---

## Pricing / data asset — retained reports + resale (Brett, 2026-06-27)

**The idea.** Offer the **initial buyer a discount** on their pre-buy in exchange for letting their
**report stay in our database**, and gain the right to **resell that report** if the aircraft comes
back to market later (sale falls through, owner re-lists, flips, etc.). The pre-buy report becomes a
**reusable data asset** tied to the aircraft, not a one-shot deliverable — a recurring-revenue layer on
top of the per-inspection fee, and a compounding moat as the library of aircraft histories grows.

**Why it's interesting.** Pre-buys are expensive and often "wasted" when a deal dies; a later buyer
would value an existing recent inspection. We monetize the same artifact more than once, the discount
lowers friction for the first buyer, and every retained report deepens the per-aircraft record (pairs
with the aircraft-as-entity idea in the broker epic — the report attaches to the **aircraft file**).

**Needs real thought (open questions):**
- **Consent / privacy / ownership.** The buyer paid for it — retention + resale needs **explicit,
  clear opt-in** (the discount is the incentive), plus terms on who owns the report and what a later
  buyer receives. The **inspecting shop's** consent/stake matters too (their work, their liability).
- **Staleness & framing.** An inspection ages fast (hours flown, new damage, deferred items done). Any
  resold report must be clearly **stamped as-of (date + tach/hours)** and framed as a historical
  snapshot, not a current condition — likely "records as of <date>, not re-verified."
- **Liability.** Reselling an inspection to a party who didn't commission it carries real risk —
  disclaimers, scope limits, and the shop's position on standing behind old findings.
- **Revenue share.** Who gets paid on resale — PreBuy, the original buyer (credit/rebate?), the shop
  that did the work? A split likely needed to keep shops onside.
- **Data model.** Report retained against the **aircraft** (entity) with a visibility/license state
  (private → retained-resaleable → sold-on); a marketplace/lookup ("is there a recent pre-buy on
  N12345?") is the longer-term surface.

**Not now** — pricing/legal-heavy; park until the aircraft-as-entity shape is decided (it's the
substrate) and there's real inspection volume to resell against.

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

## Multi-engine aircraft — engines/props as a set (Brett, 2026-06-27)

**The gap.** The data model is implicitly **single-engine**: the profile has one `engine_smoh` /
`prop_*`, and a logbook's `kind` (`airframe|engine|propeller|other`) has no **position**. Real aircraft
have **1..N engines and props**, and a pre-buy must track each independently (times, SMOH, compressions,
prop overhauls, ADs).

**Convention (Brett):** **left engine = #1, right engine = #2.** Edge case: **push-pull centerline
twins (Cessna 337 Skymaster)** number **front = #1, rear = #2**. So position is an ordinal (1, 2, …)
with a per-airframe **layout** label (conventional L/R vs front/rear) so the UI shows the right words.

**Where it touches (account for engine count everywhere):**
- **Aircraft identity:** an `engine_count` (and prop count; usually equal) on the aircraft/inspection —
  ideally derived from the **FAA `faa_aircraft_ref.num_eng`** at lookup, overridable. Add a `layout`
  hint (conventional / centerline-push-pull) to drive #1/#2 labels.
- **Logbooks:** `logbooks.kind` stays, add a **`position`** (1..N, null for airframe). Reconciliation
  (gaps/overlaps, tracked hours) runs **per engine/prop**, not lumped. Engine #1 and #2 each have their
  own book set.
- **Profile specs:** engine/prop specs become a **per-position array** (engine #1: SMOH/notes/TBO;
  engine #2: …; prop #1/#2). Report renders an engine block per side. Single-engine = one entry (no UI
  regression — collapse when count = 1).
- **Checklist:** engine/prop items should **fan out per engine** (e.g. "Cylinder compression — Engine
  #1", "#2"), or carry a position field. The generic + model templates need an engine-count-aware
  instantiation (duplicate engine-category items per position when count > 1).
- **`structure-logbook` extraction:** schema/prompt must attribute extracted times/events to an
  **engine position** when discernible (book labeled "L Engine" / "Engine #2" / "Rear").
- **Report:** spec sheet shows per-engine columns; maintenance timeline tags which engine; findings
  reference the engine.

**Approach (proposed):** model **engines/props as an indexed collection** keyed by position, not flat
fields — `engine_count` + `layout` on the aircraft, arrays in `attributes.profile`, a `position` on
`logbooks` and on engine/prop `inspection_items`. Migration + `lib/profile.js`/`lib/logbooks.js`/
`lib/checklist.js` updates + report. Sizable, cross-cutting — **do as a dedicated pass**, ideally
alongside the **aircraft-as-entity** decision (broker epic), since engine count is core aircraft data.
Until then, single-engine is correct for the A36 lead case; **twins are under-served** (one engine/prop
slot only) — note this so we don't ship twin pre-buys thinking they're complete.

## Inspection-knowledge research project — per make/model expertise (Brett, 2026-06-27)

**Goal.** Build a **knowledge base of what to inspect / look out for / known problems** for as many
**make/models** as possible, so PreBuy's checklists and guidance aren't limited to hand-authored
templates (A36) or the generic fallback. Feeds: smarter per-model checklists, "watch-outs" surfaced on
relevant items, and the model-specific trouble-spots a good pre-buy mechanic knows by heart.

**Source signals (public / licensable):**
- **FAA ADs** (Airworthiness Directives) per make/model — authoritative recurring/terminating actions.
- **FAA Service Difficulty Reports (SDRs)** + **NTSB** accident data — real-world failure patterns by
  type (mine for frequency: "what breaks on this model").
- **Manufacturer Service Bulletins / Letters** (often referenced publicly even when the doc is gated).
- **Type clubs / owner associations** (ABS, Cessna Pilots, Mooney, Cirrus…) — the richest "known
  trouble spots" knowledge; **partner/license** rather than scrape where terms require it.
- **Maintenance forums / communities** (BeechTalk, COPA, etc.) and A&P/IA writeups — directional, noisy;
  treat as leads to verify, not facts.
- Our own **FAA registry** (already loaded) for make/model normalization + engine/prop reference.

**Approach (phased, build-vs-research split):**
1. **Research harness (deep-research):** a fan-out per make/model that pulls AD lists + SDR/NTSB
   patterns + type-club trouble spots, then **adversarially verifies** and synthesizes a structured
   per-model record. (The `deep-research` skill is the natural engine; or a scheduled batch.)
2. **Schema:** a `kb_*` set — e.g. `kb_models` (make/model + aliases) → `kb_inspection_points`
   `{model, category, title, what_to_check, why_it_matters, severity, sources[]}` and `kb_ads`. **Every
   point carries citations** (AD number, SDR id, source URL) — provenance is the product.
3. **Provenance + originality:** store sources; **author original wording** (don't reproduce
   copyrighted checklists/manuals verbatim — same rule as the ABS content).
4. **Surface it:** (a) seed/augment per-model checklist templates from `kb_inspection_points`; (b) on an
   inspection item, show relevant "known issues for this model" with sources; (c) feed the AI summary
   and the broker listing with model context.
5. **Freshness:** ADs/SDRs update — a scheduled refresh (like the FAA monthly cron) keeps it current.

**Open questions:** scope (start with high-volume GA singles/twins), licensing vs scraping per source
(respect type-club terms — partnerships are likely better and a selling point), verification bar before
a "known issue" is shown to a customer (must be defensible — cite or don't show), and human review of
generated guidance. **Big, high-differentiation effort** — plan as its own track; the deep-research
harness can prototype one model (e.g. A36) end-to-end to prove the pipeline before scaling.

## Beta testers (Brett, 2026-06-27)
Early real-world testers to put the tool in front of (gather feedback on the capture flow, dictation,
logbook scan, and the report):
- **Nick / Neal**
- **Jim @ Falcon**
- **Danny**

(Names as given — fill in contact details / shops as we line them up. Pre-launch email/auth must be on
**Resend SMTP** before inviting them so confirm/reset emails work; see `docs/deploy.md` → Email.)

## Inspection search / filter (Brett, 2026-06-27)
Once a shop has many inspections, the Dashboard list needs **search + filter** to stay usable. Likely:
text search (N-number/identifier, make/model, customer, inspector), plus filters by **status**
(draft/in-progress/review/published), **date range**, and maybe **vertical** (for multi-shop logins).
Sorting (newest, last-updated, status). Server-side `ilike`/filters on the existing `inspections` query
(`listInspectionsForOrg`) with simple indexes; paginate when lists get long. Pairs with a future
**aircraft-level view** (all inspections for one tail) if/when the aircraft-as-entity lands. Not now —
trivial until there's real volume, but the beta shops will hit it quickly.

## Marketing site / landing page (Brett, 2026-06-27)
Stand up a basic **product/landing page** at the apex `prebuy.app`, modeled on **yellowtag.app**, with
the app living at **`app.prebuy.app`** (mirrors `app.yellowtag.app`). Landing = what PreBuy is (horizontal
pre-purchase inspection platform; aviation first), who it's for (inspection shops), the core flow
(identify → checklist in risk order → dictation/photos → customer report), and a clear **CTA → sign up /
open app** pointing at `app.prebuy.app`. Keep it simple/static first (could be its own small Pages
project or a marketing route). Pairs with the prebuy.app cutover (deploy-checklist §6). Domain split:
**apex = marketing**, **`app.` = SPA** — set Cloudflare Pages custom domains + Supabase Auth URLs to match.

**Status (2026-06-27):** the landing page is **built** as `Home.jsx`, currently served at `/` on
**every** host (so `app.prebuy.app/` shows marketing for now — harmless; the app is still fully reachable
at `/app` and `/login`). **TODO — host-split the apex (deferred, Brett "do later"):** make `/`
**host-aware** so `app.prebuy.app/` redirects into the app (`/app` → login/dashboard) and only the apex
`prebuy.app/` shows the landing. Designed approach (one deploy, no duplicate site): a tiny `lib/hosts.js`
(`isAppHost()` = hostname === 'app.prebuy.app'; `appBase()` = `https://app.prebuy.app` only on the apex,
else '') + `App.jsx` route `/` = `isAppHost() ? <Navigate to="/app"/> : <Home/>`, and landing CTAs use
`appBase()+'/login'` so the apex crosses over to the app subdomain. Then point the apex DNS at the same
Pages project. (Alternative: a separate static landing project at the apex.)

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
