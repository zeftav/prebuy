// Aircraft (asset) Profile — the "spec sheet" half of the customer report.
//
// Stored on `inspections.attributes.profile` (no migration: attributes is an
// existing JSONB bag). Captures the broker-listing-style blocks: spec & currency
// summary, dated maintenance highlights (these come from logbook_events), a damage
// callout, and a categorized equipment list. The shape is intentionally forgiving
// — old inspections have no profile, so everything normalizes to safe defaults and
// the report only renders blocks that actually have data.
//
// Pure helpers (normalize / currencyStatus / render rows) are tested; the single
// write merges the profile back into the attributes bag.

import { supabase } from './supabase.js'

/** Canonical empty profile. */
export function emptyProfile() {
  return {
    summary: '',
    specs: {
      total_time: '',
      engine_smoh: '',
      engine_notes: '',
      prop_since: '',
      prop_notes: '',
      mgtow: '',
      empty_weight: '',
      useful_load: '',
      fuel_capacity: '',
    },
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

/** Coerce a stored/loose profile object into the canonical shape. Pure + defensive. */
export function normalizeProfile(raw) {
  const base = emptyProfile()
  if (!raw || typeof raw !== 'object') return base
  const specs = raw.specs && typeof raw.specs === 'object' ? raw.specs : {}
  const currency = raw.currency && typeof raw.currency === 'object' ? raw.currency : {}
  const eq = raw.equipment && typeof raw.equipment === 'object' ? raw.equipment : {}

  const rowList = (arr, fields) =>
    (Array.isArray(arr) ? arr : [])
      .map((r) => (r && typeof r === 'object' ? Object.fromEntries(fields.map((f) => [f, str(r[f]).trim()])) : null))
      .filter((r) => r && fields.some((f) => r[f]))

  return {
    summary: str(raw.summary).trim(),
    specs: Object.fromEntries(Object.keys(base.specs).map((k) => [k, str(specs[k]).trim()])),
    currency: Object.fromEntries(Object.keys(base.currency).map((k) => [k, str(currency[k]).trim()])),
    damage: rowList(raw.damage, ['date', 'summary', 'affected']),
    equipment: {
      avionics: rowList(eq.avionics, ['name', 'notes']),
      additional: rowList(eq.additional, ['name', 'notes']),
    },
  }
}

/** True if the profile has nothing worth rendering. Pure. */
export function isProfileEmpty(p) {
  const n = normalizeProfile(p)
  const anySpec = Object.values(n.specs).some(Boolean)
  const anyCur = Object.values(n.currency).some(Boolean)
  return !n.summary && !anySpec && !anyCur && !n.damage.length && !n.equipment.avionics.length && !n.equipment.additional.length
}

// Human labels for the report's spec/currency cards (display order preserved).
export const SPEC_FIELDS = [
  { key: 'total_time', label: 'Total time', suffix: ' hrs' },
  { key: 'engine_smoh', label: 'Engine SMOH', suffix: ' hrs' },
  { key: 'engine_notes', label: 'Engine notes' },
  { key: 'prop_since', label: 'Prop since new/OH', suffix: ' hrs' },
  { key: 'prop_notes', label: 'Prop notes' },
  { key: 'mgtow', label: 'Max gross weight', suffix: ' lbs' },
  { key: 'empty_weight', label: 'Empty weight', suffix: ' lbs' },
  { key: 'useful_load', label: 'Useful load', suffix: ' lbs' },
  { key: 'fuel_capacity', label: 'Fuel capacity', suffix: ' gal' },
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

/** Spec/currency rows that actually have a value, ready to render. Pure. */
export function profileRows(profile, fields) {
  const n = normalizeProfile(profile)
  const bag = fields === CURRENCY_FIELDS ? n.currency : n.specs
  return fields
    .map((f) => ({ key: f.key, label: f.label, value: formatSpecValue(bag[f.key], f.suffix) }))
    .filter((r) => r.value)
}

/**
 * Currency status for a "due" date relative to `today` (default now):
 *   'overdue'  — date is in the past
 *   'due-soon' — within 60 days
 *   'ok'       — further out
 *   null       — empty/unparseable
 * Accepts YYYY-MM or YYYY-MM-DD (or anything Date can parse). Pure.
 */
export function currencyStatus(dueStr, today = new Date()) {
  const s = str(dueStr).trim()
  if (!s) return null
  // YYYY-MM → treat as the last day of that month (due "by end of month").
  let due
  const ym = /^(\d{4})-(\d{2})$/.exec(s)
  if (ym) {
    due = new Date(Number(ym[1]), Number(ym[2]), 0) // day 0 of next month = last day of this one
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
