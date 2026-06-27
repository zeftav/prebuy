# Changelog

All notable changes that hit `main` (production) are recorded here.
User-facing entries are also summarized in-app (see `src/lib/releases.js`).

## [0.1.0] — 2026-06-26

### Added
- Visible app version + build stamp in the footer (`v{version} · build {sha}`).
- In-app "What's new" panel (`src/components/WhatsNew.jsx`) driven by `src/lib/releases.js`,
  with an unseen-release indicator tracked in localStorage.
- `src/lib/version.js` — version/build accessors + semver compare helper (+ unit tests).
- Project scaffolding: React 19 + Vite 8, React Router 7, Supabase JS, lucide-react, Vitest.
- `supabase/migrations/001_init.sql` — initial multi-tenant schema + RLS (orgs, memberships,
  checklist templates/items, inspections, inspection items, media) with SECURITY DEFINER helpers.
- `src/lib/risk.js` — financial-risk ordering for the guided inspection flow (+ unit tests).
- `src/lib/supabase.js` — Supabase client.
- SPA fallback (`public/_redirects`) for Cloudflare Pages.
