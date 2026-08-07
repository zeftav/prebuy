// Airworthiness flag per discrepancy. Distinguishes items that must be corrected
// for an annual signoff (affect airworthiness) from advisory squawks. A simple
// id→true set stored on `inspections.attributes.airworthiness` (JSONB — no
// migration, like compression/estimate). Pure helpers are tested.

import { supabase } from './supabase.js'

/** The set of flagged item ids as an { [itemId]: true } map. Pure. */
export function normalizeAirworthiness(attributes) {
  const bag = attributes?.airworthiness
  const out = {}
  if (bag && typeof bag === 'object') {
    for (const [k, v] of Object.entries(bag)) if (v) out[k] = true
  }
  return out
}

/** Is this item flagged as an airworthiness item? Pure. */
export function isAirworthinessItem(attributes, itemId) {
  return normalizeAirworthiness(attributes)[itemId] === true
}

/** How many discrepancies are flagged airworthiness. Pure. */
export function airworthinessCount(items, map) {
  const m = map || {}
  return (items ?? []).filter((i) => i?.status === 'discrepancy' && m[i.id]).length
}

/** Set/clear an item's airworthiness flag. Returns { data, error }. */
export async function saveItemAirworthiness(inspection, itemId, on) {
  const cur = normalizeAirworthiness(inspection.attributes)
  const next = { ...cur }
  if (on) next[itemId] = true
  else delete next[itemId]
  const attributes = { ...(inspection.attributes ?? {}), airworthiness: next }
  return supabase.from('inspections').update({ attributes }).eq('id', inspection.id).select('id, attributes').single()
}
