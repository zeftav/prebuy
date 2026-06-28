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
import { profileSchema } from './verticals.js'

export const MAX_ENGINES = 4

const obj = (v) => (v && typeof v === 'object' ? v : {})
const blankBag = (fields) => Object.fromEntries((fields ?? []).map((f) => [f.key, '']))
const pickBag = (o, keys) => Object.fromEntries(keys.map((k) => [k, str(o?.[k]).trim()]))

/**
 * Canonical empty profile for a vertical (single engine by default). The spec /
 * currency / engine / prop FIELDS come from the vertical's profile schema, so a
 * boat or home profile holds the right keys (no aircraft fields). Defaults to
 * aviation for back-compat with code/data that predates verticalized profiles.
 */
export function emptyProfile(verticalKey = 'aviation') {
  const schema = profileSchema(verticalKey)
  return {
    summary: '',
    engine_count: 1,
    layout: 'conventional', // 'conventional' (L/R) | 'centerline' (front/rear, e.g. C337)
    specs: blankBag(schema.specFields),
    engines: schema.hasEngines ? [blankBag(schema.engineFields)] : [],
    props: schema.hasEngines ? [blankBag(schema.propFields)] : [],
    currency: blankBag(schema.currencyFields),
    damage: [], //    [{ date, summary, affected }]
    equipment: { avionics: [], additional: [] }, // two buckets, relabeled per vertical
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

const rowList = (arr, fields) =>
  (Array.isArray(arr) ? arr : [])
    .map((r) => (r && typeof r === 'object' ? Object.fromEntries(fields.map((f) => [f, str(r[f]).trim()])) : null))
    .filter((r) => r && fields.some((f) => r[f]))

/**
 * Coerce a stored/loose profile object into the canonical shape for its vertical.
 * Pure + defensive. Spec/currency/engine/prop keys come from the vertical schema;
 * verticals without engines (home) carry empty engine/prop arrays. Legacy
 * aviation profiles with flat engine_smoh/prop_since migrate into slot #1.
 */
export function normalizeProfile(raw, verticalKey = 'aviation') {
  const schema = profileSchema(verticalKey)
  const base = emptyProfile(verticalKey)
  if (!raw || typeof raw !== 'object') return base
  const specs = obj(raw.specs)
  const currency = obj(raw.currency)
  const eq = obj(raw.equipment)
  const specKeys = schema.specFields.map((f) => f.key)
  const curKeys = schema.currencyFields.map((f) => f.key)

  let engineCount = 1
  let layout = 'conventional'
  let engines = []
  let props = []
  if (schema.hasEngines) {
    engineCount = clampCount(raw.engine_count)
    layout = raw.layout === 'centerline' ? 'centerline' : 'conventional'
    const eKeys = schema.engineFields.map((f) => f.key)
    const pKeys = schema.propFields.map((f) => f.key)

    // Prefer the stored arrays; else migrate legacy flat aviation specs into slot #1.
    engines = Array.isArray(raw.engines) ? raw.engines.map((e) => pickBag(e, eKeys)) : null
    if (!engines) {
      engines = (specs.engine_smoh || specs.engine_notes)
        ? [pickBag({ smoh: specs.engine_smoh, notes: specs.engine_notes }, eKeys)]
        : []
    }
    props = Array.isArray(raw.props) ? raw.props.map((p) => pickBag(p, pKeys)) : null
    if (!props) {
      props = (specs.prop_since || specs.prop_notes)
        ? [pickBag({ since: specs.prop_since, notes: specs.prop_notes }, pKeys)]
        : []
    }
    engines = fitLength(engines, engineCount, () => blankBag(schema.engineFields))
    props = fitLength(props, engineCount, () => blankBag(schema.propFields))
  }

  return {
    summary: str(raw.summary).trim(),
    engine_count: engineCount,
    layout,
    specs: Object.fromEntries(specKeys.map((k) => [k, str(specs[k]).trim()])),
    engines,
    props,
    currency: Object.fromEntries(curKeys.map((k) => [k, str(currency[k]).trim()])),
    damage: rowList(raw.damage, ['date', 'summary', 'affected']),
    equipment: {
      avionics: rowList(eq.avionics, ['name', 'notes']),
      additional: rowList(eq.additional, ['name', 'notes']),
    },
  }
}

/** True if the profile has nothing worth rendering. Pure. (count/layout alone ≠ data.) */
export function isProfileEmpty(p, verticalKey = 'aviation') {
  const n = normalizeProfile(p, verticalKey)
  const anySpec = Object.values(n.specs).some(Boolean)
  const anyCur = Object.values(n.currency).some(Boolean)
  const anyEngine = n.engines.some((e) => Object.values(e).some(Boolean))
  const anyProp = n.props.some((pp) => Object.values(pp).some(Boolean))
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

// Aviation field sets, re-exported from the schema for back-compat (the scan
// pre-fill path + tests use these). Per-vertical rendering reads profileSchema().
export const SPEC_FIELDS = profileSchema('aviation').specFields
export const ENGINE_FIELDS = profileSchema('aviation').engineFields
export const PROP_FIELDS = profileSchema('aviation').propFields
export const CURRENCY_FIELDS = profileSchema('aviation').currencyFields

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
// Fill only blank fields of `into` from `from` (never clobber). Pure helper.
function fillBlanks(into, from) {
  for (const k of Object.keys(into)) if (!into[k] && from?.[k]) into[k] = str(from[k]).trim()
}
// Append equipment rows whose name isn't already present (case-insensitive). Pure helper.
function appendEquipment(existing, incoming) {
  const seen = new Set(existing.map((r) => r.name.toLowerCase()))
  for (const r of incoming ?? []) {
    const name = str(r?.name).trim()
    if (name && !seen.has(name.toLowerCase())) {
      existing.push({ name, notes: str(r?.notes).trim() })
      seen.add(name.toLowerCase())
    }
  }
}

export function mergeProfileDraft(profile, draft) {
  const p = normalizeProfile(profile)
  const d = draft || {}
  fillBlanks(p.specs, d.specs)
  fillBlanks(p.currency, d.currency)
  if (p.engines[0]) fillBlanks(p.engines[0], d.engine)
  if (p.props[0]) fillBlanks(p.props[0], d.prop)
  appendEquipment(p.equipment.avionics, d.equipment?.avionics)
  appendEquipment(p.equipment.additional, d.equipment?.additional)
  return p
}

/**
 * Merge an AI-research draft into a profile WITHOUT clobbering existing entries.
 * The draft is already in the vertical's key space (the edge fn fills our field
 * keys): scalar specs/currency fill blanks; engines/props fill per-slot blanks;
 * equipment rows append (deduped); the summary fills only if empty. The UI
 * pre-filters the draft to the user's ticked picks. Pure → returns a normalized
 * profile for the given vertical.
 */
export function mergeResearchDraft(profile, draft, verticalKey = 'aviation') {
  const p = normalizeProfile(profile, verticalKey)
  const d = draft || {}
  if (!p.summary && d.summary) p.summary = str(d.summary).trim()
  fillBlanks(p.specs, d.specs)
  fillBlanks(p.currency, d.currency)
  if (Array.isArray(d.engines)) d.engines.forEach((e, i) => p.engines[i] && fillBlanks(p.engines[i], e))
  if (Array.isArray(d.props)) d.props.forEach((pr, i) => p.props[i] && fillBlanks(p.props[i], pr))
  appendEquipment(p.equipment.avionics, d.equipment?.avionics)
  appendEquipment(p.equipment.additional, d.equipment?.additional)
  return p
}

// ── Broker-style narrative (Claude via the generate-summary edge fn) ─────────

/**
 * Assemble the structured facts the summary writer needs, keeping only non-empty
 * pieces so the prompt stays tight. Pure + testable. `items` are inspection_items,
 * `events` are logbook_events.
 */
export function buildSummaryContext(inspection, profile, events, items) {
  const insp = inspection ?? {}
  const schema = profileSchema(insp.vertical)
  const n = normalizeProfile(profile, insp.vertical)

  const specs = {}
  for (const f of schema.specFields) if (n.specs[f.key]) specs[f.key] = formatSpecValue(n.specs[f.key], f.suffix)
  const currency = {}
  for (const f of schema.currencyFields) if (n.currency[f.key]) currency[f.key] = n.currency[f.key]

  const nonEmpty = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v))
  const engines = n.engines
    .map((e, i) => ({ position: engineLabel(i, n.engine_count, n.layout), ...nonEmpty(e) }))
    .filter((e) => Object.keys(e).length > 1)
  const props = n.props
    .map((p, i) => ({ position: propLabel(i, n.engine_count, n.layout), ...nonEmpty(p) }))
    .filter((p) => Object.keys(p).length > 1)

  const findingItems = (items ?? [])
    .filter((i) => i.status === 'discrepancy' || i.status === 'monitor')
    .map((i) => ({ status: i.status, category: i.category, title: i.title, finding: str(i.findings).trim() || undefined }))

  const counts = { discrepancy: 0, monitor: 0, ok: 0, na: 0 }
  for (const i of items ?? []) if (i.status in counts) counts[i.status] += 1

  const ctx = {
    asset: {
      kind: { aviation: 'aircraft', marine: 'vessel', home: 'property' }[insp.vertical] || 'asset',
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

/**
 * Research the asset's published spec sheet from year/make/model via the
 * `research-asset` edge fn (Claude + web search). Returns an AI DRAFT for review
 * (typical-for-the-model specs, not this specific unit) shaped to the vertical's
 * profile fields, plus a guessed model, confidence and sources. The caller passes
 * the field defs from profileSchema so the edge fn fills our exact keys.
 */
export async function researchAsset(inspection, orgId) {
  const insp = inspection ?? {}
  if (!insp.make && !insp.model && !insp.identifier) {
    return { data: null, error: new Error('Add a make/model (or look up the identifier) first.') }
  }
  const schema = profileSchema(insp.vertical)
  const fieldDefs = (fields) => (fields ?? []).map((f) => ({ key: f.key, label: f.label }))

  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) return { data: null, error: new Error('You must be signed in.') }

  const body = {
    org_id: orgId || null,
    asset: {
      vertical: insp.vertical || 'aviation',
      noun: schema.noun,
      year: insp.year || null,
      make: insp.make || null,
      model: insp.model || null,
      identifier: insp.identifier || null,
    },
    spec_fields: fieldDefs(schema.specFields),
    currency_fields: fieldDefs(schema.currencyFields),
    has_engines: !!schema.hasEngines,
    engine_fields: fieldDefs(schema.engineFields),
    prop_fields: fieldDefs(schema.propFields),
  }

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/research-asset`
  // Web search makes this slow; cap the wait so the UI never hangs indefinitely.
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 150000)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return { data: null, error: new Error(json.error || `Request failed (${res.status})`) }
    return { data: json, error: null }
  } catch (e) {
    if (e?.name === 'AbortError') {
      return { data: null, error: new Error('Research took too long and timed out. Try again, or fill the profile manually.') }
    }
    return { data: null, error: e instanceof Error ? e : new Error('Network error') }
  } finally {
    clearTimeout(timer)
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
