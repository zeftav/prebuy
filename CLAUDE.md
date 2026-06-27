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
  finding. No audio storage to start.
- Tracker: **Jira** (company already on it), not Linear.

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

## Current state
- Session 1 (2026-06-26): Scaffolded Vite+React app. Installed stack deps. Wrote `001_init.sql`
  (schema + RLS), `lib/supabase.js`, `lib/risk.js` (+ tests), SPA `_redirects`, this file.
  Local git initialized. **Not yet done:** GitHub remote, Supabase project + run migration,
  Cloudflare Pages, app pages/auth, edge functions.

## TODO / Known issues
- [ ] Connect GitHub remote (gh CLI not installed on this Mac).
- [ ] Create Supabase project; run `001_init.sql`; set Site URL + Auth redirects.
- [ ] Cloudflare Pages project (build `npm run build`, output `dist`, env vars).
- [ ] N-number → make/model lookup (FAA releasable aircraft registration DB).
- [ ] Auth + org signup edge function; seed first global checklist template.
- [ ] Capture flow (dictation + media), report view, PDF export.
- [ ] Jira: stand up the backlog and mirror big items here.
