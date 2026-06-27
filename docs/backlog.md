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
