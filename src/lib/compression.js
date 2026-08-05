// Differential compression test — structured entry for the compression checklist
// item. Per-cylinder readings (XX/80) plus the day's MASTER ORIFICE calibration
// reading. A cylinder reading below the master-orifice reading indicates a leak
// past the calibrated orifice → investigate (standard Continental/Lycoming
// practice). Stored on inspections.attributes.compression, keyed by the inspection
// item id — no migration, and no change to the items query (which would break the
// page before the DB is migrated).

import { supabase } from './supabase.js'

export const COMPRESSION_BASE = 80 // differential-test input pressure (readings are XX/80)
const DEFAULT_CYLINDERS = 6 // Continental/Lycoming sixes are the common case (A36 etc.)

/**
 * Is this checklist item the differential compression test? Matches "compression"
 * specifically — NOT "compressor" (turbo / A/C compressor), which is a different
 * check. Pure.
 */
export function isCompressionItem(item) {
  return /\bcompression\b/i.test(String(item?.title ?? ''))
}

/**
 * Data-entry order for the cylinders: odds first, then evens (1-3-5-2-4-6 on a six,
 * 1-3-2-4 on a four) — how a tech goes around a horizontally-opposed engine, so the
 * fields match the workflow. Returns 0-based indices; cylinders are still labeled
 * and stored by their true number. Pure.
 */
export function cylinderOrder(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0))
  const odds = []
  const evens = []
  for (let c = 1; c <= n; c++) (c % 2 ? odds : evens).push(c - 1)
  return [...odds, ...evens]
}

// Borescope images are stored as normal per-item media, tagged in the caption with
// their cylinder number (`cyl:N`) — no schema change. These pair the tag with the
// number so the form/report can group images per cylinder. Pure.
export function cylCaption(n) {
  return `cyl:${Number(n)}`
}
export function cylTag(caption) {
  const m = /^cyl:(\d+)$/.exec(String(caption ?? ''))
  return m ? Number(m[1]) : null
}

function num(v) {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Normalize a stored compression record to a consistent shape. Pure. */
export function normalizeCompression(rec, fallbackCount = DEFAULT_CYLINDERS) {
  const src = rec && typeof rec === 'object' ? rec : {}
  const rawCyl = Array.isArray(src.cylinders) ? src.cylinders : []
  const count = rawCyl.length || Math.max(1, Number(src.count) || fallbackCount)
  const cylinders = Array.from({ length: count }, (_, i) => {
    const v = rawCyl[i]
    return { value: v && v.value != null ? String(v.value) : '' }
  })
  return {
    master_orifice: src.master_orifice != null ? String(src.master_orifice) : '',
    cylinders,
    notes: src.notes != null ? String(src.notes) : '',
  }
}

/**
 * Status of one cylinder vs the master-orifice reading. Pure.
 * 'low' = below the master orifice (investigate) · 'ok' · 'unknown' (no value).
 */
export function cylinderStatus(value, masterOrifice) {
  const v = num(value)
  if (v == null) return 'unknown'
  const m = num(masterOrifice)
  if (m == null) return 'ok' // no threshold set yet
  return v < m ? 'low' : 'ok'
}

/** Summary: entered/total, lowest reading, count below the master orifice. Pure. */
export function compressionStats(rec) {
  const norm = normalizeCompression(rec)
  const vals = norm.cylinders.map((c) => num(c.value)).filter((n) => n != null)
  return {
    entered: vals.length,
    total: norm.cylinders.length,
    lowest: vals.length ? Math.min(...vals) : null,
    low: norm.cylinders.filter((c) => cylinderStatus(c.value, norm.master_orifice) === 'low').length,
  }
}

/** True when nothing has been entered. Pure. */
export function isCompressionEmpty(rec) {
  const norm = normalizeCompression(rec)
  return !norm.master_orifice && !norm.cylinders.some((c) => c.value) && !norm.notes
}

/** Persist one item's compression record into inspections.attributes.compression[itemId]. */
export async function saveItemCompression(inspection, itemId, rec) {
  const attributes = { ...(inspection.attributes ?? {}) }
  const map = { ...(attributes.compression ?? {}) }
  map[itemId] = {
    master_orifice: rec.master_orifice?.trim() || null,
    cylinders: (rec.cylinders ?? []).map((c) => ({ value: String(c.value ?? '').trim() })),
    notes: rec.notes?.trim() || null,
  }
  attributes.compression = map
  const { data, error } = await supabase
    .from('inspections')
    .update({ attributes })
    .eq('id', inspection.id)
    .select('id, attributes')
    .single()
  return { data, error }
}
