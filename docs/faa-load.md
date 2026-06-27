# FAA registry bulk-load

Fills `faa_aircraft_ref` + `faa_registry` (migration `004`) with the full FAA
Releasable Aircraft Database (~300k aircraft) so N-number lookups resolve any
aircraft, not just the seed fixtures. Trimmed to the columns we use → the whole
load is well under 100 MB; each lookup stays a single indexed read.

Two ways to run the same loader (`scripts/faa/load-faa.mjs`):

## A. GitHub Action (recommended — background + auto-refresh)

`.github/workflows/faa-load.yml` downloads the FAA zip and loads it on a GitHub
runner (which can reach both FAA and Supabase). Runs **on demand** and **monthly**.

**One-time setup:**
1. Get your Supabase **DIRECT** connection string: Supabase → Project Settings →
   Database → Connection string → **URI**. Use the **direct** connection
   (`...@db.<ref>.supabase.co:5432/postgres`) or the **Session** pooler — **not**
   the Transaction pooler on `:6543` (COPY needs a real session).
2. GitHub → repo **Settings → Secrets and variables → Actions → New repository
   secret**: name `SUPABASE_DB_URL`, value = that connection string (includes the
   DB password — it lives only as a secret, never in the repo).

**Run it:** GitHub → **Actions → "Load FAA registry" → Run workflow**. Watch the
log; it prints staged counts and the final `faa_registry` total. Re-runs are safe
(idempotent upserts); the monthly cron keeps it current.

## B. Locally

```bash
# 1. Download + unzip the FAA releasable DB (MASTER.txt + ACFTREF.txt):
curl -fSL -o faa.zip https://registry.faa.gov/database/ReleasableAircraft.zip
unzip faa.zip MASTER.txt ACFTREF.txt -d faa

# 2. Install loader deps + run (use the DIRECT/session connection string):
npm --prefix scripts/faa install
SUPABASE_DB_URL='postgres://postgres:<pw>@db.<ref>.supabase.co:5432/postgres' \
  node scripts/faa/load-faa.mjs faa/MASTER.txt faa/ACFTREF.txt
```

## How it works / notes

- Each FAA file is staged verbatim into a temp table whose columns are derived
  from the file's **header row**, so a layout tweak by the FAA doesn't break it.
  Then we upsert only the trimmed columns we keep.
- The FAA file's trailing comma (one empty column) is handled; N-numbers are
  stored **with** the leading `N`.
- The `faa_registry → faa_aircraft_ref` FK is satisfied via a LEFT JOIN — an
  unknown make/model code lands as `null` rather than erroring.
- **Caveat:** the loader uses CSV parsing. The FAA export is normally clean, but
  if a row ever contains an unescaped comma in a text field, COPY will reject that
  row — re-run, and if it recurs, flag it and we'll add a tolerant fallback.
- The FAA download URL is occasionally changed by the agency; if the download step
  404s, update the URL in the workflow / command above.
