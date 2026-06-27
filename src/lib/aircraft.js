// Aviation identifier resolver (Identify stage). Looks up an N-number in our FAA
// tables (migration 004) and shapes the row into prefill values for a new
// inspection. The shaping is pure + tested; the query is thin.
//
// This is the aviation adapter for the generic "resolve identifier → prepopulate"
// step. Marine/home will get their own resolvers (or stay manual).

import { supabase } from './supabase.js'

/** Normalize a tail number: uppercase, no spaces. */
export function normalizeNNumber(raw) {
  return String(raw ?? '').trim().toUpperCase().replace(/\s+/g, '')
}

/** Title-case an ALL-CAPS manufacturer ('BEECH' → 'Beech'); leave model verbatim. */
function titleCase(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/\b[a-z]/g, (c) => c.toUpperCase())
}

/**
 * Shape a `faa_registry` (+ joined `faa_aircraft_ref`) row into prefill values.
 * Pure. Returns null for a missing row.
 */
export function shapeAircraft(row) {
  if (!row) return null
  const ref = row.faa_aircraft_ref || {}
  const engines = Number(ref.num_eng)
  return {
    identifier: row.n_number ?? null,
    year: row.year_mfr ?? null,
    make: ref.mfr ? titleCase(ref.mfr) : null,
    model: ref.model ?? null,
    serial: row.serial ?? null,
    // FAA num_eng → seed the inspection's engine count (twins, etc.); 0/blank → null.
    engine_count: Number.isFinite(engines) && engines > 0 ? engines : null,
  }
}

/**
 * Look up an aircraft by N-number. Returns { data, error }:
 *   data = shaped prefill object, or null if no match (error stays null).
 */
export async function lookupAircraft(nNumber) {
  const n = normalizeNNumber(nNumber)
  if (!n) return { data: null, error: null }
  const { data, error } = await supabase
    .from('faa_registry')
    .select('n_number, serial, year_mfr, faa_aircraft_ref(mfr, model, num_eng)')
    .eq('n_number', n)
    .maybeSingle()
  if (error) return { data: null, error }
  return { data: shapeAircraft(data), error: null }
}
