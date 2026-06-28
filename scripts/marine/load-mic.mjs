// load-mic.mjs — bulk-load the USCG Manufacturer Identifier Code (MIC) list into
// public.marine_mic so the boat HIN lookup can name the builder (the first 3 chars
// of a HIN are the MIC). Idempotent: re-run to refresh. Runs anywhere that can
// reach your Supabase Postgres (the GitHub Action in .github/workflows/
// marine-mic-load.yml, or locally).
//
// Usage:
//   SUPABASE_DB_URL=postgres://... node load-mic.mjs mic.csv
//
// SUPABASE_DB_URL must be a DIRECT/session connection string (COPY needs a real
// session — the transaction pooler on :6543 won't work; use the Session pooler).
// This is the SAME secret the FAA loader uses.
//
// Input: a CSV with a header row. The USCG MIC database (uscgboating.org) isn't a
// one-click CSV, so the operator supplies the file — see docs/marine-mic-load.md
// for sources. We don't assume exact column names: we stage the CSV verbatim
// (columns from its header) and then detect which columns hold the MIC, the
// manufacturer/company name, and (optionally) status — so the loader survives
// different export layouts.

import { createReadStream } from 'node:fs'
import { open as openP } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import pg from 'pg'
import { from as copyFrom } from 'pg-copy-streams'

const DB = process.env.SUPABASE_DB_URL
const [csvPath] = process.argv.slice(2)
if (!DB) die('Set SUPABASE_DB_URL (direct/session connection string).')
if (!csvPath) die('Usage: load-mic.mjs <mic.csv>')

function die(msg) {
  console.error(`✗ ${msg}`)
  process.exit(1)
}

// Read just the header line (the file may be large — don't slurp it all).
async function firstLine(path) {
  const fh = await openP(path, 'r')
  try {
    const buf = Buffer.alloc(1 << 16)
    const { bytesRead } = await fh.read(buf, 0, buf.length, 0)
    const s = buf.toString('utf8', 0, bytesRead)
    const nl = s.indexOf('\n')
    return (nl === -1 ? s : s.slice(0, nl)).replace(/\r$/, '')
  } finally {
    await fh.close()
  }
}

function columnsFromHeader(header) {
  return header.split(',').map((n, i) => (n.trim().replace(/^"|"$/g, '') || `_extra_${i}`))
}

// Find a staged column whose name matches any of the given aliases (normalized).
function findColumn(cols, aliases) {
  const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const wanted = aliases.map(norm)
  for (const c of cols) {
    const n = norm(c)
    if (wanted.some((w) => n === w || n.includes(w))) return c
  }
  return null
}

const client = new pg.Client({ connectionString: DB, ssl: { rejectUnauthorized: false } })
await client.connect()
try {
  const cols = columnsFromHeader(await firstLine(csvPath))
  const ddl = cols.map((c) => `"${c}" text`).join(', ')
  await client.query('drop table if exists stg_mic')
  await client.query(`create temp table stg_mic (${ddl})`)
  console.log('Staging MIC CSV…')
  const dst = client.query(copyFrom('copy stg_mic from stdin with (format csv, header true)'))
  await pipeline(createReadStream(csvPath), dst)
  const { rows: staged } = await client.query('select count(*)::int n from stg_mic')
  console.log(`  staged ${staged[0].n.toLocaleString()} rows`)

  const micCol = findColumn(cols, ['mic', 'manufacturercode', 'mfrcode', 'code', 'manufactureridentificationcode'])
  const mfrCol = findColumn(cols, ['manufacturer', 'company', 'companyname', 'name', 'mfr', 'builder', 'manufacturername'])
  const statusCol = findColumn(cols, ['status', 'active', 'operatingstatus'])
  if (!micCol || !mfrCol) {
    die(`Couldn't find MIC + manufacturer columns in the CSV header.\n  Detected columns: ${cols.join(', ')}\n  Rename the header so MIC and manufacturer/company are identifiable (see docs/marine-mic-load.md).`)
  }
  console.log(`  columns → mic="${micCol}", manufacturer="${mfrCol}", status=${statusCol ? `"${statusCol}"` : '(none)'}`)

  // Upsert: MICs are exactly 3 chars (uppercased); manufacturer required. Dedupe
  // by MIC (a CSV can carry multiple records per code) — distinct on keeps one.
  console.log('Upserting marine_mic…')
  const statusExpr = statusCol ? `nullif(trim("${statusCol}"), '')` : 'null'
  const res = await client.query(`
    insert into public.marine_mic (mic, manufacturer, status, updated_at)
    select mic, manufacturer, status, now() from (
      select distinct on (upper(trim("${micCol}")))
        upper(trim("${micCol}")) as mic,
        nullif(trim("${mfrCol}"), '') as manufacturer,
        ${statusExpr} as status
      from stg_mic
      where char_length(trim("${micCol}")) = 3
        and coalesce(trim("${mfrCol}"), '') <> ''
      order by upper(trim("${micCol}")), nullif(trim("${mfrCol}"), '')
    ) d
    on conflict (mic) do update set
      manufacturer = excluded.manufacturer,
      status = excluded.status,
      updated_at = now()
  `)
  console.log(`  marine_mic upserted: ${res.rowCount.toLocaleString()}`)

  const { rows } = await client.query('select count(*)::int n from public.marine_mic')
  console.log(`✓ Done. marine_mic now holds ${rows[0].n.toLocaleString()} manufacturer codes.`)
} catch (e) {
  die(e.message)
} finally {
  await client.end()
}
