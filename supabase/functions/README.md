# Edge functions

Privileged / secret-bearing work runs here (service role), each with its own auth
check. Never put secrets in the client. Deploy by paste in the Supabase dashboard.

State the **JWT verification** setting when deploying each function:

- **JWT ON** — logged-in user actions (e.g. publishing a report).
- **JWT OFF** — pre-login / no-session flows (signup, accept-invite, the public
  share-token report view, Stripe webhook).

## Planned functions (not built yet)

| Function | JWT | Purpose |
|---|---|---|
| `signup` | OFF | Create org + owner membership atomically on first sign-up. |
| `invite` / `accept-invite` | OFF (accept) | Add members to an org. |
| `report` | OFF | Return a published report by `share_token` for the no-login customer view. |
| `structure-finding` | ON | Take a raw dictation transcript → Claude → a clean, customer-facing finding. |
| `media-upload` | ON | Service-role upload to Storage if RLS fights direct uploads. |
| `export-pdf` | ON/OFF | Render a report to PDF. |
