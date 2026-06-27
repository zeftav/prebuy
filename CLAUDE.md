# PreBuy — Project Context

> **MAINTENANCE RULE.** Update this file (esp. "Current state", TODO, "Known issues") at the end of
> every working session and commit it. This is the cross-session memory.

> **DEPLOY-PASTE RULE.** When a change needs a manual deploy (SQL migration, edge-function paste),
> paste the full copy-ready SQL/code inline in chat and state JWT on/off. I deploy by copy/paste.

> **CHANGELOG RULE.** On every main-bound behavior change, add a `CHANGELOG.md` entry; if
> user-facing, also a friendly line in the in-app "What's new".

> **BRANCH CONVENTION.** One logical change per branch; `feat/… fix/… chore/… docs/…`.
> `main` = production (auto-deploys). Prefer surgical commits.

## What this is

Multi-tenant SaaS for **aircraft pre-purchase inspection shops / A&Ps**. A mechanic enters an
N-number, the app pulls the matching make/model checklist, guides them through it in **financial-risk
priority order** (highest-dollar items first), captures findings via **dictation (Web Speech API) +
photo/video** on an iPhone, and publishes a polished **customer-facing report** (share link + PDF).
Built multi-tenant from day one to resell.

**Decisions locked (session 1, 2026-06-26):**
- Plain **JavaScript** (not TS).
- Checklists: **global seed library** (service-role seeded), each shop **clones & customizes** its own.
- Customer report: **tokenized share link, no login**, read-only + PDF. Served by an edge function
  (service role), NOT by anon RLS.
- Dictation: iPhone **Web Speech API** for live transcript → edge fn → **Claude** structures it into a
  finding. No audio storage to start. (iOS Safari reliability is a known risk — see native decision.)
- Tracker: **Jira** (company already on it), not Linear. Until connected, backlog lives in `docs/backlog.md`.
  ⚠️ The connected Linear workspace ("Yellowtag") is a **different company** — do NOT track PreBuy there.
- Signup: **open self-serve** — anyone can sign up, create a shop (org), and become its owner.
- Seeding: ship **both** an aircraft and a marine (boat) checklist to exercise the multi-asset engine.

**Product direction / open questions (see `docs/backlog.md`):**
- **Multi-asset platform**, not aircraft-only: aircraft prebuy + **boat survey** are verticals 1 & 2,
  architecture stays asset-typed. Engine (templates, risk order, capture, report) is asset-agnostic;
  only the identifier + lookup differ (aircraft N-number→FAA; boat HIN, manual). Plan: migration `002`
  adds `asset_type` + generic identifier **before any real data** (cheap now, painful later).
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
  **Not yet done:** app pages/auth, edge functions. Confirm Supabase Auth URLs include the pages.dev
  domain (only localhost set so far).

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
- [ ] Migration `002`: generalize `inspections`/`checklist_templates` to `asset_type` + generic
      identifier (aircraft + boat), before real data lands. Fold in with the inspection-flow build.
- [ ] Boat-survey vertical: marine checklist content; HIN/registration identifier (manual entry).
- [ ] Decide native iOS vs PWA after field-testing dictation + offline at a real hangar/dock.
- [ ] N-number → make/model lookup (FAA releasable aircraft registration DB).
- [ ] Auth + org signup edge function; seed first global checklist template.
- [ ] Capture flow (dictation + media), report view, PDF export.
- [ ] Shared `Tooltip` component + `/help` FAQ page; populate/maintain alongside every feature.
- [ ] Jira: stand up the backlog and mirror big items here.
