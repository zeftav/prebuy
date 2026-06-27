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
  Next test case: **A36 Beech Bonanza** — building the concrete aircraft path (checklist + guided
  detail in risk order). Future idea logged in `docs/backlog.md`: self-serve "add an industry"
  (shop builds own checklist/report, or concierge build) — not now.

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
