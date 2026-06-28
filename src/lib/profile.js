// Aircraft (asset) Profile — the "spec sheet" half of the customer report.
//
// Stored on `inspections.attributes.profile` (no migration: attributes is an
// existing JSONB bag). Captures the broker-listing-style blocks: spec & currency
// summary, dated maintenance highlights (these come from logbook_events), a damage
// callout, and a categorized equipment list. The shape is intentionally forgiving
// — old inspections have no profile, so everything normalizes to safe defaults and
// the report only renders blocks that actually have data.
//
// MULTI-ENGINE: engines and props are position-indexed arrays (engine #1, #2 …),
// sized by `engine_count`, with a `layout` that drives the #1/#2 labels:
//   conventional → #1 Left / #2 Right; centerline (Cessna 337) → #1 Front / #2 Rear.
// Airframe-level specs (total time, weights, fuel) stay single. Legacy single-engine
// profiles (flat engine_smoh/prop_since) migrate into engines[0]/props[0].
//
// Pure helpers (normalize / currencyStatus / labels / render rows) are tested; the
// single write merges the profile back into the attributes bag.

import { supabase } from './supabase.js'

export const MAX_ENGINES = 4

/** Canonical empty profile (single engine by default). */
export function emptyProfile() {
  return {
    summary: '',
    engine_count: 1,
    layout: 'conventional', // 'conventional' (L/R) | 'centerline' (front/rear, e.g. C337)
    specs: {
      total_time: '',
      mgtow: '',
      empty_weight: '',
      useful_load: '',
      fuel_capacity: '',
    },
    engines: [{ smoh: '', notes: '' }], // index 0 = engine #1
    props: [{ since: '', notes: '' }], //   index 0 = prop #1
    currency: {
      annual_due: '',
      ifr_pitot_static_due: '', // 91.411
      transponder_due: '', //      91.413
      elt_battery_due: '',
      o2_hydro_due: '',
    },
    damage: [], //    [{ date, summary, affected }]
    equipment: { avionics: [], additional: [] }, // [{ name, notes }]
  }
}

const str = (v) => (v == null ? '' : String(v))
const clampCount = (n) => Math.min(MAX_ENGINES, Math.max(1, Math.round(Number(n) || 1)))

// Fit an array to exactly `n` entries (truncate extras, pad with `make()`).
function fitLength(arr, n, make) {
  const out = (Array.isArray(arr) ? arr : []).slice(0, n)
  while (out.length < n) out.push(make())
  return out
}

/** Coerce a stored/loose profile object into the canonical shape. Pure + defensive. */
export function normalizeProfile(raw) {
  const base = emptyProfile()
  if (!raw || typeof raw !== 'object') return base
  const specs = raw.specs && typeof raw.specs === 'object' ? raw.specs : {}
  const currency = raw.currency && typeof raw.currency === 'object' ? raw.currency : {}
  const eq = raw.equipment && typeof raw.equipment === 'object' ? raw.equipment : {}

  const engineCount = clampCount(raw.engine_count)
  const layout = raw.layout === 'centerline' ? 'centerline' : 'conventional'

  // Engines/props: prefer the arrays; else migrate legacy flat specs into slot #1.
  let engines = Array.isArray(raw.engines)
    ? raw.engines.map((e) => ({ smoh: str(e?.smoh).trim(), notes: str(e?.notes).trim() }))
    : null
  if (!engines) {
    engines = (specs.engine_smoh || specs.engine_notes)
      ? [{ smoh: str(specs.engine_smoh).trim(), notes: str(specs.engine_notes).trim() }]
      : []
  }
  let props = Array.isArray(raw.props)
    ? raw.props.map((p) => ({ since: str(p?.since).trim(), notes: str(p?.notes).trim() }))
    : null
  if (!props) {
    props = (specs.prop_since || specs.prop_notes)
      ? [{ since: str(specs.prop_since).trim(), notes: str(specs.prop_notes).trim() }]
      : []
  }

  const rowList = (arr, fields) =>
    (Array.isArray(arr) ? arr : [])
      .map((r) => (r && typeof r === 'object' ? Object.fromEntries(fields.map((f) => [f, str(r[f]).trim()])) : null))
      .filter((r) => r && fields.some((f) => r[f]))

  return {
    summary: str(raw.summary).trim(),
    engine_count: engineCount,
    layout,
    specs: Object.fromEntries(Object.keys(base.specs).map((k) => [k, str(specs[k]).trim()])),
    engines: fitLength(engines, engineCount, () => ({ smoh: '', notes: '' })),
    props: fitLength(props, engineCount, () => ({ since: '', notes: '' })),
    currency: Object.fromEntries(Object.keys(base.currency).map((k) => [k, str(currency[k]).trim()])),
    damage: rowList(raw.damage, ['date', 'summary', 'affected']),
    equipment: {
      avionics: rowList(eq.avionics, ['name', 'notes']),
      additional: rowList(eq.additional, ['name', 'notes']),
    },
  }
}

/** True if the profile has nothing worth rendering. Pure. (count/layout alone ≠ data.) */
export function isProfileEmpty(p) {
  const n = normalizeProfile(p)
  const anySpec = Object.values(n.specs).some(Boolean)
  const anyCur = Object.values(n.currency).some(Boolean)
  const anyEngine = n.engines.some((e) => e.smoh || e.notes)
  const anyProp = n.props.some((pp) => pp.since || pp.notes)
  return !n.summary && !anySpec && !anyCur && !anyEngine && !anyProp && !n.damage.length && !n.equipment.avionics.length && !n.equipment.additional.length
}

// Position words by layout (index 0,1 → side). Beyond 2 → just the number.
const SIDES = { conventional: ['Left', 'Right'], centerline: ['Front', 'Rear'] }

/** Label for engine N (0-based). Pure. */
export function engineLabel(i, count = 1, layout = 'conventional') {
  if (count <= 1) return 'Engine'
  const side = (SIDES[layout] || SIDES.conventional)[i]
  return side ? `Engine #${i + 1} (${side})` : `Engine #${i + 1}`
}
/** Label for prop N (0-based). Pure. */
export function propLabel(i, count = 1, layout = 'conventional') {
  if (count <= 1) return 'Propeller'
  const side = (SIDES[layout] || SIDES.conventional)[i]
  return side ? `Prop #${i + 1} (${side})` : `Prop #${i + 1}`
}

// Human labels for the report's cards (display order preserved).
export const SPEC_FIELDS = [
  { key: 'total_time', label: 'Total time', suffix: ' hrs' },
  { key: 'mgtow', label: 'Max gross weight', suffix: ' lbs' },
  { key: 'empty_weight', label: 'Empty weight', suffix: ' lbs' },
  { key: 'useful_load', label: 'Useful load', suffix: ' lbs' },
  { key: 'fuel_capacity', label: 'Fuel capacity', suffix: ' gal' },
]
export const ENGINE_FIELDS = [
  { key: 'smoh', label: 'SMOH', suffix: ' hrs' },
  { key: 'notes', label: 'Notes' },
]
export const PROP_FIELDS = [
  { key: 'since', label: 'Since new/OH', suffix: ' hrs' },
  { key: 'notes', label: 'Notes' },
]
export const CURRENCY_FIELDS = [
  { key: 'annual_due', label: 'Annual due' },
  { key: 'ifr_pitot_static_due', label: 'IFR pitot/static (91.411)' },
  { key: 'transponder_due', label: 'Transponder (91.413)' },
  { key: 'elt_battery_due', label: 'ELT battery' },
  { key: 'o2_hydro_due', label: 'O₂ bottle hydro' },
]

/** Append a unit suffix only when the value looks purely numeric. Pure. */
export function formatSpecValue(value, suffix) {
  const v = str(value).trim()
  if (!v) return ''
  if (suffix && /^[\d.,]+$/.test(v)) return `${v}${suffix}`
  return v
}

/** Rows (from any {key,suffix}[] over a bag) that have a value, ready to render. Pure. */
export function fieldRows(bag, fields) {
  return fields
    .map((f) => ({ key: f.key, label: f.label, value: formatSpecValue(bag?.[f.key], f.suffix) }))
    .filter((r) => r.value)
}

/** Spec/currency rows that actually have a value, ready to render. Pure. */
export function profileRows(profile, fields) {
  const n = normalizeProfile(profile)
  const bag = fields === CURRENCY_FIELDS ? n.currency : n.specs
  return fieldRows(bag, fields)
}

/**
 * Currency status for a "due" date relative to `today` (default now):
 *   'overdue' · 'due-soon' (≤60d) · 'ok' · null (empty/unparseable).
 * Accepts YYYY-MM (treated as end of month) or YYYY-MM-DD. Pure.
 */
export function currencyStatus(dueStr, today = new Date()) {
  const s = str(dueStr).trim()
  if (!s) return null
  let due
  const ym = /^(\d{4})-(\d{2})$/.exec(s)
  if (ym) {
    due = new Date(Number(ym[1]), Number(ym[2]), 0)
  } else {
    const t = Date.parse(s)
    if (Number.isNaN(t)) return null
    due = new Date(t)
  }
  const ms = due.getTime() - today.getTime()
  if (ms < 0) return 'overdue'
  if (ms <= 60 * 24 * 3600 * 1000) return 'due-soon'
  return 'ok'
}

// ── Scan-to-pre-fill (Claude vision via the structure-logbook edge fn) ───────

const numStr = (v) => {
  const n = Number(v)
  return Number.isFinite(n) && n !== 0 ? String(n) : ''
}

/**
 * Shape a raw edge-fn extraction into a profile-style draft (all strings; blank
 * specs dropped to ''; equipment rows with no name removed). The vision pass is
 * single-engine-oriented, so engine/prop come back as one set → merged into slot
 * #1. Pure.
 */
export function draftFromExtraction(raw) {
  const specsIn = raw?.specs && typeof raw.specs === 'object' ? raw.specs : {}
  const eqIn = raw?.equipment && typeof raw.equipment === 'object' ? raw.equipment : {}

  const eqRows = (arr) =>
    (Array.isArray(arr) ? arr : [])
      .map((r) => ({ name: str(r?.name).trim(), notes: str(r?.notes).trim() }))
      .filter((r) => r.name)

  return {
    specs: {
      total_time: numStr(specsIn.total_time),
      mgtow: numStr(specsIn.mgtow),
      empty_weight: numStr(specsIn.empty_weight),
      useful_load: numStr(specsIn.useful_load),
      fuel_capacity: numStr(specsIn.fuel_capacity),
    },
    engine: { smoh: numStr(specsIn.engine_smoh), notes: str(specsIn.engine_notes).trim() },
    prop: { since: numStr(specsIn.prop_since), notes: str(specsIn.prop_notes).trim() },
    currency: Object.fromEntries(CURRENCY_FIELDS.map((f) => [f.key, str(raw?.currency?.[f.key]).trim()])),
    equipment: { avionics: eqRows(eqIn.avionics), additional: eqRows(eqIn.additional) },
  }
}

/**
 * Merge a scan draft into a profile WITHOUT clobbering existing entries: scalar
 * specs/currency and engine/prop #1 only fill blanks; equipment rows are appended
 * unless an item with the same name (case-insensitive) is already present. Returns
 * a normalized profile. Pure — the UI pre-filters the draft to the user's picks.
 */
export function mergeProfileDraft(profile, draft) {
  const p = normalizeProfile(profile)
  const d = draft || {}

  const fillBlanks = (into, from) => {
    for (const k of Object.keys(into)) if (!into[k] && from?.[k]) into[k] = str(from[k]).trim()
  }
  fillBlanks(p.specs, d.specs)
  fillBlanks(p.currency, d.currency)
  if (p.engines[0]) fillBlanks(p.engines[0], d.engine)
  if (p.props[0]) fillBlanks(p.props[0], d.prop)

  const appendNew = (existing, incoming) => {
    const seen = new Set(existing.map((r) => r.name.toLowerCase()))
    for (const r of incoming ?? []) {
      const name = str(r?.name).trim()
      if (name && !seen.has(name.toLowerCase())) {
        existing.push({ name, notes: str(r?.notes).trim() })
        seen.add(name.toLowerCase())
      }
    }
  }
  appendNew(p.equipment.avionics, d.equipment?.avionics)
  appendNew(p.equipment.additional, d.equipment?.additional)

  return p
}

// ── Broker-style narrative (Claude via the generate-summary edge fn) ─────────

/**
 * Assemble the structured facts the summary writer needs, keeping only non-empty
 * pieces so the prompt stays tight. Pure + testable. `items` are inspection_items,
 * `events` are logbook_events.
 */
export function buildSummaryContext(inspection, profile, events, items) {
  const n = normalizeProfile(profile)
  const insp = inspection ?? {}

  const specs = {}
  for (const f of SPEC_FIELDS) if (n.specs[f.key]) specs[f.key] = formatSpecValue(n.specs[f.key], f.suffix)
  const currency = {}
  for (const f of CURRENCY_FIELDS) if (n.currency[f.key]) currency[f.key] = n.currency[f.key]

  const engines = n.engines
    .map((e, i) => ({ position: engineLabel(i, n.engine_count, n.layout), smoh: e.smoh || undefined, notes: e.notes || undefined }))
    .filter((e) => e.smoh || e.notes)
  const props = n.props
    .map((p, i) => ({ position: propLabel(i, n.engine_count, n.layout), since: p.since || undefined, notes: p.notes || undefined }))
    .filter((p) => p.since || p.notes)

  const findingItems = (items ?? [])
    .filter((i) => i.status === 'discrepancy' || i.status === 'monitor')
    .map((i) => ({ status: i.status, category: i.category, title: i.title, finding: str(i.findings).trim() || undefined }))

  const counts = { discrepancy: 0, monitor: 0, ok: 0, na: 0 }
  for (const i of items ?? []) if (i.status in counts) counts[i.status] += 1

  const ctx = {
    asset: {
      kind: insp.vertical === 'marine' ? 'vessel' : 'aircraft',
      identifier: insp.identifier || undefined,
      year: insp.year || undefined,
      make: insp.make || undefined,
      model: insp.model || undefined,
      serial: insp.attributes?.serial || undefined,
      engine_count: n.engine_count > 1 ? n.engine_count : undefined,
    },
    findings_summary: counts,
  }
  if (Object.keys(specs).length) ctx.specs = specs
  if (engines.length) ctx.engines = engines
  if (props.length) ctx.props = props
  if (Object.keys(currency).length) ctx.currency = currency
  if (n.damage.length) ctx.damage = n.damage
  if (n.equipment.avionics.length) ctx.avionics = n.equipment.avionics
  if (n.equipment.additional.length) ctx.additional_equipment = n.equipment.additional
  if ((events ?? []).length) {
    ctx.notable_maintenance = events.map((e) => ({
      date: str(e.event_date).trim() || undefined,
      category: e.category,
      title: e.title,
      detail: str(e.description).trim() || undefined,
    }))
  }
  if (findingItems.length) ctx.findings = findingItems
  return ctx
}

/** Generate a broker-style narrative summary from structured context. */
export async function generateNarrative(context, orgId) {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) return { data: null, error: new Error('You must be signed in.') }

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-summary`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ context, org_id: orgId || null }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return { data: null, error: new Error(body.error || `Request failed (${res.status})`) }
    return { data: { summary: String(body.summary ?? '').trim() }, error: null }
  } catch (e) {
    return { data: null, error: e instanceof Error ? e : new Error('Network error') }
  }
}

/** Extract profile fields from photographed records (signed image URLs). */
export async function extractProfile(imageUrls, orgId) {
  if (!imageUrls?.length) return { data: null, error: new Error('No images to read.') }
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) return { data: null, error: new Error('You must be signed in.') }

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/structure-logbook`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ images: imageUrls, org_id: orgId || null }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return { data: null, error: new Error(body.error || `Request failed (${res.status})`) }
    return { data: draftFromExtraction(body), error: null }
  } catch (e) {
    return { data: null, error: e instanceof Error ? e : new Error('Network error') }
  }
}

/**
 * Merge a profile into the inspection's attributes bag and persist. `attributes`
 * is the currently-loaded bag (so we preserve serial and any other keys). Returns
 * { data: attributes, error }.
 */
export async function saveProfile(id, attributes, profile) {
  const nextAttrs = { ...(attributes && typeof attributes === 'object' ? attributes : {}), profile: normalizeProfile(profile) }
  const { data, error } = await supabase
    .from('inspections')
    .update({ attributes: nextAttrs })
    .eq('id', id)
    .select('id, attributes')
    .single()
  return { data: data?.attributes ?? nextAttrs, error }
}
