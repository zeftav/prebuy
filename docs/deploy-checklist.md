# Deploy checklist — pending manual steps

Single place for the manual steps that have to happen in the Supabase / Cloudflare
dashboards (the app code is already on `main`). Work top to bottom. Each migration's
full SQL is in `supabase/migrations/<file>` — open the file and paste it into the
Supabase **SQL editor**. Edge-function bodies are in `supabase/functions/<name>/index.ts`.

Update the checkboxes as you go.

> **Status legend:** ✅ done · ⬜ pending · 🔁 needs re-running/redeploy

## 1. Database migrations (Supabase → SQL editor)

Run in order. All are idempotent (safe to re-run).

- [x] ✅ `001_init.sql` — schema + RLS
- [x] ✅ `002_verticals.sql` — generic vertical/identifier/attributes
- [x] ✅ `003_shop_vertical.sql` — `orgs.vertical`
- [x] ✅ `004_faa_registry.sql` — FAA tables + N3704A fixture
- [ ] ⬜ `005_seed_a36_checklist.sql` — **A36 Bonanza checklist** (template + ~30 items).
      Without it, opening an aircraft inspection shows "no template matched".
- [ ] ⬜ `006_media_storage.sql` — **photos**: `media.purpose`, the private `inspection-media`
      Storage bucket, and org-scoped Storage policies. Without it, photo upload fails.
- [ ] ⬜ `007_owner_priority.sql` — `inspection_items.owner_priority` (customization). Without it,
      the owner-priority flag + custom-item priorities can't save.

## 2. Edge functions (Supabase → Edge Functions)

- [x] ✅ `signup` — Verify JWT **OFF**. (Deployed; redeployed for `vertical`.)
- [ ] ⬜ `structure-finding` — Verify JWT **ON**. Paste from `supabase/functions/structure-finding/index.ts`.
      Powers "Clean up with AI" on findings. **Requires the secret below.**
- [ ] ⬜ `report` — Verify JWT **OFF**. Paste from `supabase/functions/report/index.ts`. Serves the
      public customer report at `/r/<token>`. No secret (uses auto-injected service role).

## 3. Secrets (Supabase → Edge Functions → Secrets)

- [ ] ⬜ `ANTHROPIC_API_KEY` — your Anthropic key. Needed by `structure-finding`.
      (Model is `claude-opus-4-8`; switch to `claude-haiku-4-5` / `claude-sonnet-4-6` in the
      function for cheaper/faster if you prefer — see the function header.)

## 4. After 1–3: smoke test (in the live app)

- [ ] Open the **N3704A** inspection → checklist appears, risk-ordered.
- [ ] Mark an item, **Dictate** a note, **Clean up with AI** → returns a finding + severity.
- [ ] **Add photo** on an item, and run the **Photo walkthrough** → thumbnails appear.

## 5. Before real shops sign up (not blocking dev)

- [ ] ⬜ **Resend SMTP** for auth email (confirm/reset/invite). Steps in `docs/deploy.md` → Email.
      Verify `prebuy.app` domain in Resend. (Built-in sender is fine for your own testing.)
- [ ] ⬜ (optional) **Confirm-email** toggle: Authentication → Providers → Email. OFF = instant
      session while testing; ON = users must click a link (the app handles both).

## 6. Optional / when ready

- [ ] ⬜ **FAA full bulk-load** — pour the full ~300k-aircraft dataset into `faa_registry` /
      `faa_aircraft_ref`. Procedure is in the comments at the bottom of `004_faa_registry.sql`
      (download FAA releasable ZIP → COPY MASTER/ACFTREF → upsert trimmed columns). The N3704A
      fixture covers testing until then.
- [ ] ⬜ **Migrate to `prebuy.app`** (bought via Cloudflare). Steps in `docs/deploy.md` → Not yet
      set up: Pages custom domain → Supabase Auth URLs → Resend domain verify (~20 min).

---

_Keep this current: when a new migration/function/secret lands, add it here with ⬜ and note it in
the chat/PR so it doesn't get missed._
