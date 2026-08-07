// Repair estimates per discrepancy. For shops that don't push work to an external
// shop-management system, capture a labor + parts estimate against each discrepancy
// and roll it up. A per-inspection labor rate turns hours into dollars.
//
// Stored on `inspections.attributes.estimate`:
//   { labor_rate: number|null, show_on_report: bool,
//     items: { [inspection_item_id]: { labor_hours, parts_cost, note } } }
// A JSONB bag like compression/compliance — no migration. Pure helpers are tested;
// persistence is thin.

import { supabase } from './supabase.js'

/** Coerce to a finite number or null (blank/junk → null). Pure. */
function num(v) {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Normalize one item's estimate record. Pure. */
export function normalizeItemEstimate(rec) {
  return {
    labor_hours: num(rec?.labor_hours),
    parts_cost: num(rec?.parts_cost),
    note: String(rec?.note ?? '').trim(),
  }
}

/** Normalize the whole estimate bag off `attributes`. Pure. */
export function normalizeEstimate(attributes) {
  const stored = attributes?.estimate ?? {}
  const items = {}
  if (stored.items && typeof stored.items === 'object') {
    for (const [id, rec] of Object.entries(stored.items)) items[id] = normalizeItemEstimate(rec)
  }
  return {
    labor_rate: num(stored.labor_rate),
    show_on_report: stored.show_on_report === true, // default OFF (dollar figures are opt-in)
    items,
  }
}

/** True when an item's estimate has any labor or parts entered. Pure. */
export function hasEstimate(rec) {
  const r = normalizeItemEstimate(rec)
  return r.labor_hours != null || r.parts_cost != null
}

/** Dollar total for one line: labor_hours × rate + parts_cost. Pure. */
export function lineTotal(rec, rate) {
  const r = normalizeItemEstimate(rec)
  const hrs = r.labor_hours ?? 0
  const parts = r.parts_cost ?? 0
  const rt = num(rate) ?? 0
  return Math.round((hrs * rt + parts) * 100) / 100
}

/**
 * Roll up the estimate across a set of items. `items` = the inspection items
 * (each { id }); `estItems` = the estimate items map; `rate` = labor rate.
 * Returns { count, laborHours, laborCost, partsCost, total }. Pure.
 */
export function estimateStats(items, estItems, rate) {
  const map = estItems && typeof estItems === 'object' ? estItems : {}
  const rt = num(rate) ?? 0
  const out = { count: 0, laborHours: 0, laborCost: 0, partsCost: 0, total: 0 }
  for (const it of items ?? []) {
    const rec = map[it?.id]
    if (!rec || !hasEstimate(rec)) continue
    const r = normalizeItemEstimate(rec)
    out.count += 1
    out.laborHours += r.labor_hours ?? 0
    out.laborCost += (r.labor_hours ?? 0) * rt
    out.partsCost += r.parts_cost ?? 0
  }
  out.laborHours = Math.round(out.laborHours * 10) / 10
  out.laborCost = Math.round(out.laborCost * 100) / 100
  out.partsCost = Math.round(out.partsCost * 100) / 100
  out.total = Math.round((out.laborCost + out.partsCost) * 100) / 100
  return out
}

/** Format a number as USD. Pure. */
export function formatUsd(n) {
  const v = num(n)
  if (v == null) return '—'
  const digits = Number.isInteger(v) ? 0 : 2 // whole dollars clean; cents when fractional
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: 2 })
}

// ── persistence ────────────────────────────────────────────────────────────

function writeAttrs(inspection, estimate) {
  const attributes = { ...(inspection.attributes ?? {}), estimate }
  return supabase.from('inspections').update({ attributes }).eq('id', inspection.id).select('id, attributes').single()
}

/** Persist one item's estimate (merged into the bag). Returns { data, error }. */
export async function saveItemEstimate(inspection, itemId, patch) {
  const cur = normalizeEstimate(inspection.attributes)
  const rec = normalizeItemEstimate(patch)
  const items = { ...cur.items }
  if (rec.labor_hours == null && rec.parts_cost == null && !rec.note) delete items[itemId]
  else items[itemId] = rec
  const estimate = { labor_rate: cur.labor_rate, show_on_report: cur.show_on_report, items }
  return writeAttrs(inspection, estimate)
}

/** Persist the estimate settings (labor rate, on-report). Returns { data, error }. */
export async function saveEstimateSettings(inspection, { labor_rate, show_on_report }) {
  const cur = normalizeEstimate(inspection.attributes)
  const estimate = {
    labor_rate: labor_rate !== undefined ? num(labor_rate) : cur.labor_rate,
    show_on_report: show_on_report !== undefined ? !!show_on_report : cur.show_on_report,
    items: cur.items,
  }
  return writeAttrs(inspection, estimate)
}
