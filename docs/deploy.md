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
- Stripe / Resend secrets (Supabase edge-function secrets when those features land).
