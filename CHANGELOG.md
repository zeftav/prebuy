# Changelog

All notable changes that hit `main` (production) are recorded here.
User-facing entries are also summarized in-app (see `src/lib/releases.js`).

## [0.3.0] — 2026-06-27

### Added
- **Multi-vertical inspection flow (aircraft + boat).**
  - `supabase/migrations/002_verticals.sql` — generalizes `inspections` + `checklist_templates`:
    adds `vertical`, `asset_type`, generic `identifier`, `make`/`model`/`year`, and a JSONB
    `attributes` bag; drops the aviation-only `n_number`/`aircraft_*` columns (table was empty).
    RLS unchanged (still `org_id`-scoped).
  - `src/lib/verticals.js` — per-vertical registry (aviation → N-number, marine → HIN) with
    adaptive labels/placeholders and identifier validation (+ tests). Adding a vertical = an entry
    here + a seeded checklist, not a schema change.
  - `src/lib/inspections.js` — `validateInspectionDraft` (pure, tested), `createInspection`,
    `listInspectionsForOrg`.
  - `src/pages/Dashboard.jsx` — now the active shop's inspection list, with a shop switcher for
    multi-shop users (remembered in localStorage).
  - `src/pages/NewInspection.jsx` (`/app/inspections/new`) — create form whose identifier field +
    make/model labels adapt to the chosen vertical; tooltips on the identifier.
  - `/help` — entries on starting an inspection and multi-vertical support.

### Changed
- Dashboard is no longer a bare shop list; shop management moved into a switcher + "New shop" link.

## [0.2.1] — 2026-06-27

### Added
- **Self-serve password reset.** "Forgot your password?" on the sign-in screen → `/forgot`
  (request a link; same confirmation shown whether or not the account exists, so account
  existence isn't leaked) → `/reset-password` sets a new password from the recovery session.
  - `src/lib/auth.jsx` — `sendPasswordReset` + `updatePassword` helpers.
  - `src/lib/password.js` — shared `validatePassword` / `passwordsMatch` rules (+ tests),
    reused by signup and reset so the minimum stays in one place.
  - `/help` "I forgot my password" answer now describes the real flow.

### Docs
- `docs/deploy.md` — **Email (Resend)** section: Supabase custom-SMTP setup for auth email
  (confirm/reset/invite) plus the separate edge-function Resend-API path for app email; noted
  the `/reset-password` redirect is covered by the existing wildcard.

## [0.2.0] — 2026-06-27

### Added
- **Auth & onboarding (PREB-3).** Supabase email/password sign-up + sign-in, protected routes,
  and self-serve shop creation.
  - `src/lib/auth.jsx` — `AuthProvider` + `useAuth` (session restore, `onAuthStateChange` sync).
  - `src/components/ProtectedRoute.jsx` — gate that defers render until session is known, then
    redirects to `/login` preserving the intended destination (PREB-20).
  - `src/pages/Login.jsx` — combined sign-in/sign-up screen; friendly auth-error mapping;
    handles the email-confirmation-pending case.
  - `supabase/functions/signup/index.ts` — service-role edge function (**Verify JWT OFF**) that
    validates the caller's token itself, then creates `orgs` + owner `memberships` atomically
    (rolls back the org if the membership write fails; retries slug on collision) (PREB-21).
  - `src/pages/CreateShop.jsx` + `src/lib/shops.js` — mobile-friendly create-shop flow with a
    live slug preview; Dashboard routes a membership-less user here (PREB-22).
  - `src/pages/Dashboard.jsx` — authenticated landing listing the user's shops.
- **Shared `Tooltip` component (PREB-23)** — accessible (hover + focus, Escape, `aria-describedby`),
  with an `InfoDot` affordance; used on the password and shop-name fields.
- **`/help` FAQ page (PREB-24)** — public, data-driven, seeded with onboarding/auth Q&A; linked
  from Home, Login, Dashboard, and Create-shop.
- Home page now links to Sign in / Help and a "Create your shop" CTA.
- Tests: `src/lib/shops.test.js` covers shop-name validation, slugify, and active-org selection.

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
