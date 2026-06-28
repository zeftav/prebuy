# USCG MIC (boat manufacturer) bulk-load

Fills `public.marine_mic` (migration `018`) with USCG Manufacturer Identifier
Codes so the **boat HIN lookup names the builder**. A HIN's first 3 characters are
the MIC; we look them up here. Serial + model year are parsed from the HIN itself
(`src/lib/marine.js`) and need no table.

Without this load, only the seeded codes resolve (the test codes from `018`, plus
**HUN → Hunter Marine** from `020`); every other real boat shows the year/serial
but a blank builder.

## Why it's operator-supplied (unlike the FAA loader)

The FAA publishes a single downloadable ZIP. The USCG MIC list is a **searchable
web app** (`uscgboating.org`, ~16k records) with **no one-click CSV export**, and
it 403s non-browser requests. So you point the loader at a CSV you provide.

### Getting a CSV

Any of these, as long as it ends up as a CSV with a header row:

- The USCG search at <https://uscgboating.org/manufacturers/> (export/scrape what
  you need — it's public data).
- A vetted third-party MIC spreadsheet (several publish ~16k rows). Verify a few
  against the USCG site before trusting it.
- Your own curated list.

The loader is **forgiving about column names**: it stages the CSV verbatim and
auto-detects the columns for the **MIC** (`mic` / `code` / `mfr code` / …), the
**manufacturer/company** name (`manufacturer` / `company` / `name` / `builder` /
…), and optional **status**. It only needs a recognizable MIC column and a
manufacturer column. MICs must be exactly 3 characters; duplicates are de-duped.

## A. GitHub Action (recommended — background + auto-refresh)

`.github/workflows/marine-mic-load.yml` downloads the CSV and loads it on a GitHub
runner. Runs **on demand** and **quarterly**.

**One-time setup:**

1. Repo secret `SUPABASE_DB_URL` — the Supabase **Session pooler** connection
   string (the same secret the FAA loader uses; runners are IPv4-only and the
   Direct host is IPv6-only → `ENETUNREACH`).
2. Repo **variable** `MIC_SOURCE_URL` — a URL to your MIC CSV (Settings → Secrets
   and variables → Actions → **Variables**). Or pass `source_url` when running the
   workflow manually.

Then: Actions → **Load USCG MIC list** → Run workflow.

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
