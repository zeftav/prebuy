# Backlog (interim)

Jira isn't connected yet — this is the holding pen. When Jira is up, migrate these to issues and
keep only the big-rock summaries mirrored in `CLAUDE.md`. Build-task checklist lives in
`CLAUDE.md` → TODO; this file is for product-level epics and open decisions.

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

Status: **planned**, fold into migration `002`. Per-vertical checklist content = separate later tasks
(SMEs: boat surveyor, home inspector, mechanic).

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
