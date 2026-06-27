# Backlog (interim)

Jira isn't connected yet — this is the holding pen. When Jira is up, migrate these to issues and
keep only the big-rock summaries mirrored in `CLAUDE.md`. Build-task checklist lives in
`CLAUDE.md` → TODO; this file is for product-level epics and open decisions.

---

## EPIC: Multi-asset platform (aircraft + marine, extensible)

PreBuy is a pre-purchase **inspection platform**, asset-typed — not aircraft-only. Aircraft prebuy
and **boat surveys** are the first two verticals; architecture should not assume aircraft.

**Shared engine (asset-agnostic):** checklist-template library, financial-risk ordering (`risk.js`),
dictation→AI findings, photo/video capture, published report + PDF, multi-tenancy/RLS.

**Asset-specific:**
- Identifier + lookup: aircraft = N-number → FAA registration DB; boat = HIN (Hull ID Number) +
  state registration, **no clean public decoder → likely manual entry**.
- Checklist content: airframe/engine/avionics/ADs vs. hull/engine/rigging/systems.

**Cheap-now design move (do with the inspection-flow build, migration `002`, before real data):**
- Add `asset_type` to `inspections` and `checklist_templates` ('aircraft' | 'boat' | …).
- Generalize the identifier: keep a generic `registration` + optional `hin`; the aircraft `n_number`
  path stays working.
- Tag the template library by `asset_type` + make/model.
- Lookups become pluggable per asset_type (FAA for aircraft; manual for boats to start).

Status: **planned**, fold into migration `002`. Boat checklist content = separate later task.

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
