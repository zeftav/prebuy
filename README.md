# PreBuy

Multi-tenant SaaS for aircraft pre-purchase inspection shops. Enter an N-number → pull the make/model
checklist → guide the mechanic through it in financial-risk order → capture findings (dictation +
photo/video) on a phone → publish a customer-facing report (share link + PDF).

See [`CLAUDE.md`](CLAUDE.md) for the full project context and [`docs/newprojectprimer.md`](docs/newprojectprimer.md)
for the stack/conventions playbook.

## Develop

```bash
npm install
cp .env.example .env   # fill in your Supabase project values
npm run dev            # local dev server
npm test               # run unit tests
npm run build          # production build → dist/
```

## Stack

React 19 + Vite 8 (→ Cloudflare Pages) · Supabase (Postgres/RLS/Auth/Edge Functions/Storage) ·
Stripe · Resend · Plausible · Anthropic (via edge function).

## Layout

- `src/pages`, `src/components`, `src/lib` — frontend.
- `supabase/migrations` — additive, numbered SQL, run by paste in the Supabase SQL editor.
- `supabase/functions` — edge functions (service role) for privileged/secret work.
