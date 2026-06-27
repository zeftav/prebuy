// load-faa.mjs — bulk-load the FAA Releasable Aircraft Database into the trimmed
// PreBuy tables (faa_aircraft_ref, faa_registry). Idempotent: re-run monthly to
// refresh. Runs anywhere that can reach your Supabase Postgres (the GitHub Action
// in .github/workflows/faa-load.yml, or locally).
//
// Usage:
//   SUPABASE_DB_URL=postgres://... node load-faa.mjs MASTER.txt ACFTREF.txt
//
// SUPABASE_DB_URL must be a DIRECT/session connection string (COPY needs a real
// session — the transaction pooler on :6543 won't work; use :5432).
//
// Approach: stage each FAA file verbatim (columns derived from its header row, so
// it survives FAA layout tweaks), then upsert only the trimmed columns we keep.
// The registry FK is satisfied via a LEFT JOIN (unknown make/model codes → null).

import { createReadStream } from 'node:fs'
import { open as openP } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import pg from 'pg'
import { from as copyFrom } from 'pg-copy-streams'

const DB = process.env.SUPABASE_DB_URL
const [masterPath, acftrefPath] = process.argv.slice(2)
if (!DB) die('Set SUPABASE_DB_URL (direct/session connection string).')
if (!masterPath || !acftrefPath) die('Usage: load-faa.mjs <MASTER.txt> <ACFTREF.txt>')

function die(msg) {
  console.error(`✗ ${msg}`)
  process.exit(1)
}

// Read just the header line (files are hundreds of MB — don't slurp the whole thing).
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

// FAA files are comma-delimited with a trailing comma (→ one empty column).
function columnsFromHeader(header) {
  return header.split(',').map((n, i) => (n.trim() || `_extra_${i}`).replace(/"/g, ''))
}

async function stage(client, { path, table }) {
  const cols = columnsFromHeader(await firstLine(path))
  const ddl = cols.map((c) => `"${c}" text`).join(', ')
  await client.query(`drop table if exists ${table}`)
  await client.query(`create temp table ${table} (${ddl})`)
  const dst = client.query(copyFrom(`copy ${table} from stdin with (format csv, header true)`))
  await pipeline(createReadStream(path), dst)
  const { rows } = await client.query(`select count(*)::int n from ${table}`)
  console.log(`  staged ${table}: ${rows[0].n.toLocaleString()} rows`)
}

const client = new pg.Client({ connectionString: DB, ssl: { rejectUnauthorized: false } })
await client.connect()
try {
  console.log('Staging FAA files…')
  await stage(client, { path: acftrefPath, table: 'stg_acftref' })
  await stage(client, { path: masterPath, table: 'stg_master' })

  console.log('Upserting faa_aircraft_ref…')
  const ref = await client.query(`
    insert into public.faa_aircraft_ref (code, mfr, model, type_acft, type_eng, num_eng, num_seats)
    select trim("CODE"), nullif(trim("MFR"),''), nullif(trim("MODEL"),''),
           nullif(trim("TYPE-ACFT"),''), nullif(trim("TYPE-ENG"),''),
           nullif(trim("NO-ENG"),'')::int, nullif(trim("NO-SEATS"),'')::int
    from stg_acftref
    where coalesce(trim("CODE"),'') <> ''
    on conflict (code) do update set
      mfr=excluded.mfr, model=excluded.model, type_acft=excluded.type_acft,
      type_eng=excluded.type_eng, num_eng=excluded.num_eng, num_seats=excluded.num_seats
  `)
  console.log(`  faa_aircraft_ref upserted: ${ref.rowCount.toLocaleString()}`)

  console.log('Upserting faa_registry…')
  const reg = await client.query(`
    insert into public.faa_registry (n_number, serial, mfr_model_code, year_mfr)
    select 'N'||trim(m."N-NUMBER"), nullif(trim(m."SERIAL NUMBER"),''),
           r.code, nullif(trim(m."YEAR MFR"),'')::int
    from stg_master m
    left join public.faa_aircraft_ref r on r.code = trim(m."MFR MDL CODE")
    where coalesce(trim(m."N-NUMBER"),'') <> ''
    on conflict (n_number) do update set
      serial=excluded.serial, mfr_model_code=excluded.mfr_model_code,
      year_mfr=excluded.year_mfr, updated_at=now()
  `)
  console.log(`  faa_registry upserted: ${reg.rowCount.toLocaleString()}`)

  const { rows } = await client.query('select count(*)::int n from public.faa_registry')
  console.log(`✓ Done. faa_registry now holds ${rows[0].n.toLocaleString()} aircraft.`)
} catch (e) {
  die(e.message)
} finally {
  await client.end()
}
