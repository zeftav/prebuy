// gen-checklist-sql.mjs — turn supabase/seed/inspection-guidelines.json into the
// home + marine global fallback checklist migrations (template + template_items),
// mirroring the generic-aviation seed (011). Re-run to regenerate after editing
// the JSON; the output migrations are idempotent (fixed template id, delete+insert).
//
//   node scripts/seed/gen-checklist-sql.mjs
//
// Mapping (see chat decision): area.name → category; `inspect` → item; `describe`
// → "Record: …" item; `report_if` → defect-check item (flag if present). The
// `not_required` / limitations are scope boundaries, NOT tasks — kept in the JSON
// for a future scope/disclaimer drawer, not seeded as items.

import { readFile, writeFile } from 'node:fs/promises'

const JSON_PATH = new URL('../../supabase/seed/inspection-guidelines.json', import.meta.url)

// Per-area risk weights (0..100) — drives "highest financial / safety risk first".
// The SoP isn't risk-ranked, so these are PreBuy-authored and tunable.
const HOME_WEIGHTS = {
  structure: 92, electrical: 88, roof: 85, plumbing: 78, heating: 74,
  cooling: 70, exterior: 68, fireplace: 60, attic: 50, interior: 40,
}
const MARINE_WEIGHTS = {
  below_waterline: 92, hull_structure: 90, propulsion: 82, fuel: 80, electrical: 78,
  steering_control: 72, safety: 70, plumbing: 64, ground_tackle: 48, deck_topside: 45, navigation: 40,
}

const HOME_TEMPLATE_ID = '00000000-0000-4000-c000-000000000001'
const MARINE_TEMPLATE_ID = '00000000-0000-4000-c000-000000000002'

const q = (s) => `'${String(s).replace(/'/g, "''")}'` // SQL single-quote escape

function itemsFor(area, weight) {
  const rows = []
  for (const it of area.inspect ?? []) rows.push({ title: it.text, description: null, weight })
  for (const it of area.describe ?? []) rows.push({ title: `Record: ${it.text}`, description: null, weight })
  for (const it of area.report_if ?? []) rows.push({ title: it.text, description: 'Defect condition — flag if present.', weight })
  return rows
}

function buildSql({ templateId, vertical, name, areas, weights, header }) {
  const lines = []
  lines.push(header.trim())
  lines.push('')
  lines.push('-- A generic template has no make/model; relax those NOT NULLs (idempotent — also done in 011).')
  lines.push('alter table public.checklist_templates alter column make drop not null;')
  lines.push('alter table public.checklist_templates alter column model drop not null;')
  lines.push('')
  lines.push('insert into public.checklist_templates (id, is_global, vertical, asset_type, make, model, name, version)')
  lines.push(`values (${q(templateId)}, true, ${q(vertical)}, null, null, null, ${q(name)}, 1)`)
  lines.push('on conflict (id) do update')
  lines.push('  set name = excluded.name, vertical = excluded.vertical, version = excluded.version;')
  lines.push('')
  lines.push(`delete from public.template_items where template_id = ${q(templateId)};`)
  lines.push('')
  lines.push('insert into public.template_items')
  lines.push('  (template_id, category, title, description, sort_order, risk_weight)')
  lines.push('values')

  const valueRows = []
  let sort = 10
  for (const area of areas) {
    const code = area.code
    const weight = weights[code] ?? 50
    for (const row of itemsFor(area, weight)) {
      const desc = row.description == null ? 'null' : q(row.description)
      valueRows.push(`  (${q(templateId)}, ${q(area.name)}, ${q(row.title)}, ${desc}, ${sort}, ${row.weight})`)
      sort += 10
    }
  }
  lines.push(valueRows.join(',\n') + ';')
  lines.push('')
  return lines.join('\n')
}

const data = JSON.parse(await readFile(JSON_PATH, 'utf8'))

const homeSql = buildSql({
  templateId: HOME_TEMPLATE_ID,
  vertical: 'home',
  name: 'General Home — Pre-Purchase Inspection (generic)',
  areas: data.home_inspection.areas,
  weights: HOME_WEIGHTS,
  header:
    '-- 012_seed_home_checklist.sql — generic home-inspection checklist (fallback for the\n' +
    '-- "home" vertical). Generated from supabase/seed/inspection-guidelines.json\n' +
    '-- (InterNACHI SoP, Oct 2022, rephrased; free-use license). Regenerate via\n' +
    '-- scripts/seed/gen-checklist-sql.mjs. Idempotent.',
})

const marineSql = buildSql({
  templateId: MARINE_TEMPLATE_ID,
  vertical: 'marine',
  name: 'General Boat — Pre-Purchase Survey (generic)',
  areas: data.boat_survey.system_checklist,
  weights: MARINE_WEIGHTS,
  header:
    '-- 013_seed_marine_checklist.sql — generic boat-survey checklist (fallback for the\n' +
    '-- "marine" vertical). Generated from supabase/seed/inspection-guidelines.json\n' +
    '-- (synthesized from typical pre-purchase scope + ABYC domains; NOT a verbatim\n' +
    '-- published standard). Regenerate via scripts/seed/gen-checklist-sql.mjs. Idempotent.',
})

await writeFile(new URL('../../supabase/migrations/012_seed_home_checklist.sql', import.meta.url), homeSql)
await writeFile(new URL('../../supabase/migrations/013_seed_marine_checklist.sql', import.meta.url), marineSql)
console.log('Wrote 012_seed_home_checklist.sql and 013_seed_marine_checklist.sql')
