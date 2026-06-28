# USCG MIC (boat manufacturer) bulk-load

Fills `public.marine_mic` (migration `018`) with USCG Manufacturer Identifier
Codes so the **boat HIN lookup names the builder**. A HIN's first 3 characters are
the MIC; we look them up here. Serial + model year are parsed from the HIN itself
(`src/lib/marine.js`) and need no table.

Without this load, only the seeded codes resolve (the test codes from `018`, plus
**HUN → Hunter Marine** from `020`); every other real boat shows the year/serial
but a blank builder.

## The source: the official USCG MIC.csv

The USCG publishes the full recreational-boat manufacturer list (~16k rows) as a
direct CSV download:

    https://uscgboating.org/downloads/MIC.csv

(linked from <https://uscgboating.org/content/manufacturers-identification.php>).
It 403s non-browser requests, so the loader/Action send a browser User-Agent. The
file's columns include `MIC`, `Company`, `Date Out of Business`, etc.

The loader is **forgiving about column names**: it stages the CSV verbatim and
auto-detects the **MIC**, the **manufacturer/company** name, and a **status** —
preferring to derive status from a "Date Out of Business" column (empty → active,
else inactive). It treats the literal `NULL` as blank, requires a 3-char MIC + a
manufacturer, and de-dupes by MIC. So a differently-shaped CSV also works.

## A. GitHub Action (recommended — one click + auto-refresh)

`.github/workflows/marine-mic-load.yml` downloads the official CSV and loads it on
a GitHub runner. Runs **on demand** and **quarterly**.

**One-time setup:** just the repo secret `SUPABASE_DB_URL` — the Supabase
**Session pooler** connection string (the same secret the FAA loader uses; runners
are IPv4-only and the Direct host is IPv6-only → `ENETUNREACH`). It's already set
if the FAA load has run.

Then: Actions → **Load USCG MIC list** → Run workflow. (To use a different CSV,
set a `MIC_SOURCE_URL` repo **variable** or pass `source_url` on dispatch.)

## B. Locally

```sh
npm --prefix scripts/marine install
SUPABASE_DB_URL='postgres://…session-pooler…' \
  node scripts/marine/load-mic.mjs path/to/mic.csv
```

The load is idempotent (upsert on `mic`) — safe to re-run to refresh.

## Verify

In the SQL editor:

```sql
select count(*) from public.marine_mic;
select * from public.marine_mic where mic = 'HUN';  -- Hunter Marine
```

Then in the app, a marine shop → New inspection → enter a HIN → **Look up**: the
builder fills for any code now in the table.
