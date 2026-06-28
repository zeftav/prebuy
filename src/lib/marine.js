// Marine identifier resolver (Identify stage) — the boat analog of lib/aircraft.js.
// There's no free full HIN decoder, but a modern 12-char Hull Identification
// Number is structured, and the first 3 chars (the MIC) map to the builder via the
// public USCG MIC list (migration 018). So we parse serial + model year from the
// HIN itself and look up the builder by MIC. Parsing is pure + tested; the query is thin.

import { supabase } from './supabase.js'

const MONTHS = 'ABCDEFGHIJKL' // A=Jan … L=Dec (current model-year HIN format)

/** Uppercase, no spaces. */
export function normalizeHIN(raw) {
  return String(raw ?? '').trim().toUpperCase().replace(/\s+/g, '')
}

/** 2-digit model year → full year, inferring century (boats can be next model year). */
export function inferModelYear(yy, currentYear = new Date().getFullYear()) {
  if (!/^\d{2}$/.test(String(yy))) return null
  const full = 2000 + Number(yy)
  return full > currentYear + 1 ? 1900 + Number(yy) : full
}

/**
 * Parse a modern (post-Aug-1984) 12-char HIN into its parts. Pure.
 *   1–3 MIC · 4–8 serial · 9 build month (A–L) · 10 build-year digit · 11–12 model year
 * Returns { valid, mic, serial, buildMonth, modelYear }. valid=false for non-12-char.
 */
export function parseHIN(raw, currentYear = new Date().getFullYear()) {
  const hin = normalizeHIN(raw)
  if (hin.length !== 12) return { valid: false, mic: null, serial: null, buildMonth: null, modelYear: null }
  const mic = hin.slice(0, 3)
  const serial = hin.slice(3, 8)
  const monthIdx = MONTHS.indexOf(hin[8])
  const buildMonth = monthIdx >= 0 ? monthIdx + 1 : null
  const modelYear = inferModelYear(hin.slice(10, 12), currentYear)
  return { valid: true, mic, serial, buildMonth, modelYear }
}

/** Shape a parsed HIN (+ optional MIC row) into new-inspection prefill values. Pure. */
export function shapeFromHIN(parsed, micRow) {
  if (!parsed?.valid) return null
  return {
    identifier: null, // set by caller to the normalized HIN
    make: micRow?.manufacturer || null,
    model: null, // HIN doesn't encode model
    year: parsed.modelYear ?? null,
    serial: parsed.serial || null,
  }
}

/**
 * Look up a HIN. Parses serial/model-year from the HIN and resolves the builder
 * from the MIC table. Returns { data, error }: data = prefill object (or null when
 * the HIN isn't a parseable 12-char modern HIN). A missing MIC just leaves make null.
 */
export async function lookupHIN(rawHin) {
  const hin = normalizeHIN(rawHin)
  const parsed = parseHIN(hin)
  if (!parsed.valid) return { data: null, error: null }

  const { data: micRow, error } = await supabase
    .from('marine_mic')
    .select('mic, manufacturer')
    .eq('mic', parsed.mic)
    .maybeSingle()
  if (error) return { data: null, error }

  const shaped = shapeFromHIN(parsed, micRow)
  if (shaped) {
    shaped.identifier = hin
    shaped.mic = parsed.mic // the 3-char builder code
    shaped.builder_matched = !!micRow // true = builder resolved from the USCG MIC database
  }
  return { data: shaped, error: null }
}
