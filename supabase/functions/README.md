# Edge functions

Privileged / secret-bearing work runs here (service role), each with its own auth
check. Never put secrets in the client. Deploy by paste in the Supabase dashboard.

State the **JWT verification** setting when deploying each function:

- **JWT ON** — logged-in user actions (e.g. publishing a report).
- **JWT OFF** — pre-login / no-session flows (signup, accept-invite, the public
  share-token report view, Stripe webhook).

## Functions

| Function | JWT | Status | Purpose |
|---|---|---|---|
| `signup` | OFF | **built** | Create org + owner membership atomically for the calling user. |
| `invite` / `accept-invite` | OFF (accept) | planned | Add members to an org. |
| `report` | OFF | **built** | Return a published report by `share_token` for the no-login customer view. |
| `structure-finding` | ON | **built** | Take a raw dictation transcript → Claude → a clean, customer-facing finding. |
| `media-upload` | ON | planned | Service-role upload to Storage if RLS fights direct uploads. |
| `export-pdf` | ON/OFF | planned | Render a report to PDF. |

### `signup` (deploy: **Verify JWT OFF**)

Creates a shop (`orgs`) and the caller's owner `memberships` row with the service
role — the client can't, because those tables have no INSERT policy by design.

- **Auth:** does its own check. The client sends its Supabase access token as
  `Authorization: Bearer <token>`; the function validates it with the service-role
  client (`auth.getUser`) before writing. JWT is off at the gateway so our check is
  the single source of truth (same convention for all privileged functions).
- **Request:** `POST` `{ "name": "Zefting Aviation" }`
- **Response:** `201 { "org": { "id", "name", "slug" } }`
- **Env:** uses the auto-injected `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`; no
  manual secrets to set.
- **Atomicity:** org then owner membership; the org is rolled back if the membership
  insert fails. Slug collisions retry with a short random suffix.

### `structure-finding` (deploy: **Verify JWT ON**)

Turns a mechanic's raw dictation about a checklist item into a clean, customer-facing
finding via Claude (model `claude-opus-4-8`, structured outputs).

- **Auth:** JWT ON — only logged-in users may call it (it spends Anthropic credits); the
  gateway enforces the token.
- **Secret:** set `ANTHROPIC_API_KEY` as an edge-function secret (Edge Functions → Secrets).
  Uses the official Anthropic SDK via the `npm:` specifier.
- **Request:** `POST` `{ "transcript": "...", "item": "Cylinder compression & borescope" }`
- **Response:** `{ "finding": "...", "severity": 0-100, "suggested_status": "ok|monitor|discrepancy" }`
- **Cost note:** `claude-opus-4-8` is the default. For this high-volume, low-latency task you may
  prefer `claude-haiku-4-5` or `claude-sonnet-4-6` (cheaper/faster) — change the `model` string.

### `report` (deploy: **Verify JWT OFF**)

Returns a **published** inspection as a customer-facing report, by `share_token`. The public report
is served here (service role) — never via anon RLS.

- **Auth:** none (public). Only `status = 'published'` inspections are returned; anything else 404s,
  so a share link can't leak a draft. Token must be a UUID.
- **Env:** auto-injected `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`; no manual secrets.
- **Request:** `POST` `{ "token": "<share_token uuid>" }`
- **Response:** `{ shop, inspection, items[] (with photos[]), overview[] }` — media as short-lived
  signed URLs minted per request.
- **Frontend:** the public `/r/:token` page renders it read-only; "Print / Save PDF" uses the browser.
