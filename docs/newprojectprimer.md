# New Project Primer — stack, habits & setup

A reusable starting point for spinning up a new SaaS project the same way Yellow Tag was built —
so you (and Claude) don't relearn the stack and conventions each time. Copy this into a new repo's
`docs/` and adapt. The starter `CLAUDE.md` at the bottom is the most important part: it's the
cross-session memory the assistant reads first.

---

## 1. The proven stack (start here unless there's a reason not to)

| Layer | Choice | Why / notes |
|---|---|---|
| Frontend | **React 18 + Vite** | Fast, simple, no framework lock-in. Plain JS (or TS). |
| Routing | **react-router-dom v6** | |
| Hosting | **Cloudflare Pages** | Git-connected: push to `main` → auto-deploy prod; branches get preview URLs. Free tier is plenty to start. |
| Backend | **Supabase** | Postgres + Auth + Row-Level Security + Edge Functions + Storage in one. |
| Auth | Supabase Auth | Email/password; disable email confirmation early if invite-gated. |
| Payments | **Stripe** | Checkout + Customer Portal + webhook. Test mode first, flip to live for first real payment. |
| Email | **Resend** | Transactional + password reset. Verify a sending domain. |
| AI (optional) | **Anthropic API** | Edge function calls Claude; never put the key in the client. |
| Icons | `lucide-react` | |
| Tests | **Vitest** | Pure-logic unit tests; pin to a version that dedupes onto your patched vite (3.x worked). |
| CI | **GitHub Actions** | `npm ci → build → test → npm audit --omit=dev --audit-level=high`. |
| Tracking | **Linear** | Issues = source of truth; connect via the Claude connector (OAuth), not a repo key. |
| Analytics | **Plausible** | Cookieless (no consent banner needed), cheap, simple. |
| Dev | **Claude Code on the web** | Ephemeral cloud container per session; commit/push to persist. |

**Architecture shape that worked:** SPA talks to Supabase directly for normal reads/writes (guarded
by RLS). Anything privileged or secret-bearing (Stripe, AI, admin actions, emails, file uploads that
fight RLS) goes through a **Supabase Edge Function using the service-role key**, which does its own
auth check. That single pattern removes most security headaches.

---

## 2. Working habits / conventions (what made it smooth)

These are the rules that paid off. Most live in `CLAUDE.md` so the assistant follows them.

- **`CLAUDE.md` is cross-session memory.** Keep a "Current state", TODO, and "Known issues" section
  current; update + commit it at the end of every working session. The ephemeral container forgets
  everything else.
- **One logical change per branch.** Descriptive names: `feat/…`, `fix/…`, `chore/…`, `docs/…`. If
  using Linear, use its "copy git branch name" so PRs auto-link.
- **`main` is production.** Pushes auto-deploy. Be deliberate; prefer surgical commits.
- **DEPLOY-PASTE rule.** When a change needs a manual step the assistant can't do (a SQL migration,
  an edge-function deploy), it pastes the full copy-ready SQL/code inline in chat and states the JWT
  setting — because you deploy by copy/paste in the dashboards (no CLI in the web env).
- **Migrations are additive + numbered** (`NNN_description.sql`), run by paste in the Supabase SQL
  editor. **Snapshot/PITR checkpoint before any structural change.** Keep a rollback snippet handy.
- **CHANGELOG + in-app "What's new" + build stamp.** `CHANGELOG.md` = curated record of what hits
  prod; a friendly `releases.js` line for user-facing changes; inject the commit SHA at build
  (`CF_PAGES_COMMIT_SHA`) into a sidebar build stamp so a bug report maps to a deploy.
- **Tests on the dangerous-to-break pure logic.** Don't chase coverage; test pricing, gating,
  date/threshold math, data mappings. CI gates build + tests; scope `npm audit` to prod deps so
  dev-tool advisories don't block deploys.
- **Clarify before building when a decision is genuinely yours** (esp. anything touching money, the
  FAA/compliance output, or data model). Otherwise pick the sensible default and note it.

### Supabase / RLS gotchas (learned the hard way)
- **Never subquery a table inside its own RLS policy** (e.g. `profiles` inside a `profiles` policy) →
  infinite recursion / 500. Use `SECURITY DEFINER` helper functions (`current_user_role()`,
  `current_user_org_id()`).
- **UPDATE policies need an explicit `WITH CHECK`.** With only `USING`, Postgres applies it to the
  *new* row too — so a status transition (e.g. → `pending`) can be silently rejected. Symptom: an
  update that "does nothing" with no error.
- **Privileged/admin writes → edge function with service role** (bypasses RLS), not broader policies.
- **Edge function JWT verification:** ON for logged-in user actions; **OFF** for pre-login flows
  (signup, accept-invite, Stripe webhook). Always state which when deploying.
- **Storage RLS** can be finicky on migrated projects — if uploads 403 despite open policies, route
  the upload through a service-role edge function instead of fighting it.
- **`.in()` queries silently fail past ~100 ids** — chunk them.
- Multi-tenancy: add `org_id` to every table + org-scoped policies from day one if it's B2B.

---

## 3. Human setup checklist (the stuff you do, in order)

### A. New git repo
```bash
mkdir myproject && cd myproject
npm create vite@latest . -- --template react      # scaffold
git init
git add -A && git commit -m "chore: scaffold Vite + React"
# create the GitHub remote and push (needs the gh CLI authed locally):
gh repo create <org>/<name> --private --source=. --remote=origin --push
# …or manually: create the repo on github.com, then:
#   git remote add origin git@github.com:<org>/<name>.git
#   git branch -M main && git push -u origin main
```
- Add a `.gitignore` (Vite's template includes one — confirm `node_modules`, `dist`, `.env` are in it).
- Put `VITE_*` config in `.env` locally (gitignored); real values go in Cloudflare's dashboard.

### B. Supabase
1. Create a project → note the **project ref**, **anon key**, **service-role key** (Settings → API).
2. Auth → URL Configuration: set Site URL + Redirect URLs (`https://<domain>/**`). Disable email
   confirmation early if invite-gated.
3. Create Storage buckets as needed (public vs private).
4. Run your schema migration in the SQL editor. Enable RLS on every table + add policies.
5. **Turn on backups** (paid plan) before real data; PITR add-on if you want second-level restore.

### C. Cloudflare Pages
1. Create a Pages project → connect the GitHub repo.
2. Build command `npm run build`, output `dist`, framework "Vite".
3. Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (+ any `VITE_*`).
4. SPA fallback: `public/_redirects` with `/* /index.html 200`.
5. Custom domain later (apex for marketing, `app.` subdomain for the SPA is a clean split).

### D. Stripe (when charging)
- Test mode first: product + prices, `STRIPE_SECRET_KEY` / price IDs / `STRIPE_WEBHOOK_SECRET` as
  Supabase secrets; deploy the 3 functions (checkout, portal, webhook **JWT-OFF**).
- Flip to live before the first real payment: live key, live prices, new live webhook secret,
  activate the live Customer Portal, set `APP_URL`.

### E. Resend (email)
- Verify a sending domain (DNS records), set `RESEND_API_KEY` + `RESEND_FROM` as Supabase secrets,
  call only from edge functions.

### F. Claude Code on the web
- Connect the GitHub repo; pick a network policy; set env vars + an optional setup script.
- Enable **connectors** (OAuth) for **Linear**, GitHub, Google Drive as needed — not a repo key file.
- Tell it your branch convention; it auto-assigns `claude/<random>` branches otherwise.
- Keep `CLAUDE.md` at the repo root — it's read at the start of every session.

### G. Linear (tracking)
- One team; create issues for the to-do list. Labels for `feat/fix/research/sales/infra/db/ux`.
- Use parent/sub-issues for multi-phase features. The assistant can create/update issues via the
  connector.

---

## 4. Drop-in starter `CLAUDE.md`

Put this at the repo root of a new project and fill the blanks:

```markdown
# <Project> — Project Context

> **MAINTENANCE RULE.** Update this file (esp. "Current state", TODO, "Known issues") at the end of
> every working session and commit it. This is the cross-session memory.

> **DEPLOY-PASTE RULE.** When a change needs a manual deploy (SQL migration, edge-function paste),
> paste the full copy-ready SQL/code inline in chat and state JWT on/off. I deploy by copy/paste.

> **CHANGELOG RULE.** On every main-bound behavior change, add a `CHANGELOG.md` entry; if
> user-facing, also a friendly line in the in-app "What's new".

> **BRANCH CONVENTION.** One logical change per branch; `feat/… fix/… chore/… docs/…`.
> `main` = production (auto-deploys). Prefer surgical commits.

## Stack
- Frontend: React + Vite → Cloudflare Pages (push `main` = deploy).
- Backend: Supabase (Postgres + RLS + Auth + Edge Functions + Storage).
- Payments: Stripe · Email: Resend · Analytics: Plausible · (AI: Anthropic via edge fn).

## Key files
- `src/pages/…`, `src/components/…`, `src/lib/…`
- `supabase/migrations/` — additive, numbered, run by paste in the SQL editor.
- `supabase/functions/` — edge functions (privileged work via service role).

## Conventions / gotchas
- Privileged/secret work → edge function (service role) + own auth check. Never secrets in client.
- RLS: use SECURITY DEFINER helpers (no self-referential policy recursion); UPDATE policies need
  WITH CHECK; edge-fn JWT OFF for pre-login flows.
- Snapshot before structural migrations. Tests (Vitest) on dangerous pure logic; CI gates build+test.

## Current state
- (update each session)

## TODO / Known issues
- (track in Linear; mirror the big ones here)
```

---

*Adapt freely. The two highest-leverage habits: keep `CLAUDE.md` current, and route anything
privileged through an edge function instead of widening RLS.*
