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
| `report` | OFF | planned | Return a published report by `share_token` for the no-login customer view. |
| `structure-finding` | ON | planned | Take a raw dictation transcript → Claude → a clean, customer-facing finding. |
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
