# Deploy — Cloudflare Pages + Supabase

How PreBuy ships. Production is **git-connected**: merge to `main` → Cloudflare auto-deploys prod;
any other branch pushed gets its own preview URL.

- **Live (prod):** https://prebuy-2pm.pages.dev
- **Repo:** `git@github.com:zeftav/prebuy.git` (`main` = production)

## Cloudflare Pages — build settings

Dashboard → Workers & Pages → (project) → Settings → Builds & deployments.

| Field | Value |
|---|---|
| Production branch | `main` |
| Framework preset | Vite |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | *(blank)* |

**Node version gotcha:** Vite 8 needs Node ≥ 20.19 / 22.12, but Cloudflare defaults to an older
Node that fails the build. Pinned two ways: [`.nvmrc`](../.nvmrc) (`22`) **and** the `NODE_VERSION`
env var below.

## Environment variables (Cloudflare → Settings → Environment variables, Production)

| Name | Value | Notes |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://zttsdwclhykekoytrmxx.supabase.co` | |
| `VITE_SUPABASE_ANON_KEY` | `sb_publishable_…` | Supabase **publishable** client key — safe in the client; RLS protects data. |
| `NODE_VERSION` | `22` | Backs up `.nvmrc`. |

**Never** put the Supabase `sb_secret_…` key (or any service-role secret) here — those live as
Supabase **edge-function secrets** only. Changing env vars requires a **redeploy** to take effect
(Deployments → Retry deployment).

## Already handled in the repo

- **SPA routing** — [`public/_redirects`](../public/_redirects) (`/* /index.html 200`) so deep links
  like `/help` don't 404.
- **Build stamp** — `vite.config.js` reads Cloudflare's auto-injected `CF_PAGES_COMMIT_SHA` and bakes
  the short SHA into the footer (`v{version} · build {sha}`), so a bug report maps to a deploy.

## Supabase — Auth URL config

Supabase dashboard → Authentication → URL Configuration. Must include both local dev and the live
site or logins/redirects break:

- **Site URL:** `https://prebuy-2pm.pages.dev`
- **Redirect URLs:** `https://prebuy-2pm.pages.dev/**` and `http://localhost:5173/**`

(Add the custom domain here too once it exists.)

The `**` wildcards already cover the auth pages the app redirects to — e.g. the password-reset
link lands on `/reset-password`. If you ever pin exact paths instead of wildcards, add
`…/reset-password` explicitly or reset links will bounce.

## Email — two channels (Resend)

PreBuy sends email through **two separate paths**. Don't confuse them.

### 1. Auth emails — Supabase Auth → custom SMTP (Resend)

Confirmation, **password reset**, magic-link, and team-invite emails are sent by **Supabase Auth**,
not by app code. Supabase's built-in sender is rate-limited (~a few/hour) and **not for production** —
fine for testing your own account, not for real shops. Before launch, point Supabase at Resend's SMTP:

1. **Verify your sending domain in Resend** (Resend → Domains → add `prebuy.app` → add the SPF/DKIM
   DNS records it gives you). Required, or deliverability is poor and you can't send "from" your domain.
2. Supabase dashboard → **Project Settings → Authentication → SMTP Settings → Enable custom SMTP:**

   | Field | Value |
   |---|---|
   | Host | `smtp.resend.com` |
   | Port | `465` (SSL) or `587` (STARTTLS) |
   | Username | `resend` |
   | Password | your Resend **API key** (`re_…`) |
   | Sender email | `noreply@prebuy.app` (must be on the verified domain) |
   | Sender name | `PreBuy` |

3. (Optional) **Authentication → Email Templates** — customize the reset / confirm copy.

**Testing note:** password reset is fully testable on Supabase's built-in sender for your own
account — you don't need Resend wired up just to try the flow.

**Confirm-email toggle:** Authentication → Providers → Email → *Confirm email*. ON = new signups must
click a link before they get a session (the Login screen handles this case). OFF = instant session,
zero email needed — handy while testing.

### 2. App emails — edge functions → Resend API

Customer "your report is ready" links and similar app-generated email go through the **Resend API**
directly from an edge function, using a `RESEND_API_KEY` **edge-function secret** (Supabase → Edge
Functions → Secrets). Not wired up yet — lands with the report/invite features. Same verified domain.

## Local dev

```bash
cp .env.example .env   # fill VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (gitignored)
npm run dev            # http://localhost:5173
```

## Rollback

Cloudflare → (project) → Deployments → pick a previous good deployment → **Rollback**. (Or revert the
commit on `main` and let it redeploy.)

## Not yet set up

- Custom domain (plan: apex for marketing, `app.` subdomain for the SPA).
- **Resend SMTP for auth email** (see Email → channel 1) — required before real shops sign up; until
  then auth email uses Supabase's rate-limited built-in sender.
- App-email + Stripe edge-function secrets (`RESEND_API_KEY`, Stripe keys) when those features land.
