// Logbook audit: track an aircraft's records across multiple logbooks per type,
// reconcile time continuity (gaps = possible missing books; overlaps = possible
// duplicated time), and capture notable events. The reconciliation is pure +
// tested; CRUD is thin.

import { supabase } from './supabase.js'

export const LOGBOOK_KINDS = ['airframe', 'engine', 'propeller', 'other']
export const EVENT_CATEGORIES = ['ad', '337', 'overhaul', 'prop_strike', 'damage', 'other']
const TOL = 0.1 // tach-hour tolerance for "continuous"

export function kindLabel(k) {
  return { airframe: 'Airframe', engine: 'Engine', propeller: 'Propeller', other: 'Other' }[k] || k
}
export function categoryLabel(c) {
  return {
    ad: 'AD',
    337: 'Form 337',
    overhaul: 'Overhaul',
    prop_strike: 'Prop strike',
    damage: 'Damage',
    other: 'Other',
  }[c] || c
}

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Reconcile one type's logbooks (sorted by start tach, then date). Returns the
 * sorted books plus gaps/overlaps between consecutive books and total tracked
 * hours (last end − first start). Pure.
 */
export function summarizeKind(books) {
  const sorted = [...(books ?? [])].sort((a, b) => {
    const sa = num(a.start_tach)
    const sb = num(b.start_tach)
    if (sa != null && sb != null) return sa - sb
    if (sa != null) return -1
    if (sb != null) return 1
    return String(a.start_date ?? '').localeCompare(String(b.start_date ?? ''))
  })

  const gaps = []
  const overlaps = []
  for (let i = 1; i < sorted.length; i++) {
    const pe = num(sorted[i - 1].end_tach)
    const cs = num(sorted[i].start_tach)
    if (pe == null || cs == null) continue
    const d = Math.round((cs - pe) * 10) / 10
    if (d > TOL) gaps.push({ afterIndex: i - 1, fromTach: pe, toTach: cs, hours: d })
    else if (d < -TOL) overlaps.push({ afterIndex: i - 1, fromTach: cs, toTach: pe, hours: Math.round(-d * 10) / 10 })
  }

  const starts = sorted.map((b) => num(b.start_tach)).filter((n) => n != null)
  const ends = sorted.map((b) => num(b.end_tach)).filter((n) => n != null)
  const firstStart = starts.length ? Math.min(...starts) : null
  const lastEnd = ends.length ? Math.max(...ends) : null
  const tracked = firstStart != null && lastEnd != null ? Math.round((lastEnd - firstStart) * 10) / 10 : null

  return { sorted, gaps, overlaps, firstStart, lastEnd, tracked, count: sorted.length }
}

/**
 * Reconcile all logbooks, grouped by kind. Returns { byKind, issues } where
 * issues is a flat, human-readable list of gaps/overlaps for display.
 */
export function reconcileLogbooks(logbooks) {
  const byKind = {}
  const issues = []
  for (const k of LOGBOOK_KINDS) {
    const books = (logbooks ?? []).filter((b) => b.kind === k)
    if (!books.length) continue
    const s = summarizeKind(books)
    byKind[k] = s
    for (const g of s.gaps) {
      issues.push({
        kind: k,
        type: 'gap',
        message: `${kindLabel(k)}: ${g.hours.toFixed(1)} hr gap between tach ${g.fromTach} and ${g.toTach} — a logbook may be missing.`,
      })
    }
    for (const o of s.overlaps) {
      issues.push({
        kind: k,
        type: 'overlap',
        message: `${kindLabel(k)}: ${o.hours.toFixed(1)} hr overlap around tach ${o.fromTach}–${o.toTach} — entries may be duplicated.`,
      })
    }
  }
  return { byKind, issues }
}

// ── CRUD ────────────────────────────────────────────────────────────────────

export async function listLogbooks(inspectionId) {
  const { data, error } = await supabase
    .from('logbooks')
    .select('id, kind, label, start_date, start_tach, end_date, end_tach, sort_order, notes')
    .eq('inspection_id', inspectionId)
  return { data: data ?? [], error }
}

export async function addLogbook(inspection, draft) {
  const row = {
    inspection_id: inspection.id,
    org_id: inspection.org_id,
    kind: LOGBOOK_KINDS.includes(draft.kind) ? draft.kind : 'airframe',
    label: draft.label?.trim() || null,
    start_date: draft.start_date || null,
    start_tach: num(draft.start_tach),
    end_date: draft.end_date || null,
    end_tach: num(draft.end_tach),
    notes: draft.notes?.trim() || null,
  }
  const { data, error } = await supabase
    .from('logbooks')
    .insert(row)
    .select('id, kind, label, start_date, start_tach, end_date, end_tach, sort_order, notes')
    .single()
  return { data, error }
}

export async function deleteLogbook(id) {
  const { error } = await supabase.from('logbooks').delete().eq('id', id)
  return { error }
}

export async function listEvents(inspectionId) {
  const { data, error } = await supabase
    .from('logbook_events')
    .select('id, logbook_id, event_date, tach, category, title, description')
    .eq('inspection_id', inspectionId)
    .order('event_date', { ascending: true })
  return { data: data ?? [], error }
}

export async function addEvent(inspection, draft) {
  const t = String(draft.title ?? '').trim()
  if (!t) return { data: null, error: new Error('Give the event a title.') }
  const row = {
    inspection_id: inspection.id,
    org_id: inspection.org_id,
    category: EVENT_CATEGORIES.includes(draft.category) ? draft.category : 'other',
    title: t,
    event_date: draft.event_date || null,
    tach: num(draft.tach),
    description: draft.description?.trim() || null,
  }
  const { data, error } = await supabase
    .from('logbook_events')
    .insert(row)
    .select('id, logbook_id, event_date, tach, category, title, description')
    .single()
  return { data, error }
}

export async function deleteEvent(id) {
  const { error } = await supabase.from('logbook_events').delete().eq('id', id)
  return { error }
}

// ── OCR import (Claude vision via the structure-logbook edge fn) ─────────────

/** Normalize a draft logbook/event field: empty string → null, 0 → null for tach. */
export function cleanDraftValue(v) {
  if (v === '' || v == null) return null
  if (typeof v === 'number') return v === 0 ? null : v
  return v
}

/** Extract draft logbooks + events from photographed pages (signed image URLs). */
export async function extractLogbooks(imageUrls) {
  if (!imageUrls?.length) return { data: null, error: new Error('No images to read.') }
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) return { data: null, error: new Error('You must be signed in.') }

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/structure-logbook`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ images: imageUrls }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return { data: null, error: new Error(body.error || `Request failed (${res.status})`) }
    return { data: { logbooks: body.logbooks ?? [], events: body.events ?? [] }, error: null }
  } catch (e) {
    return { data: null, error: e instanceof Error ? e : new Error('Network error') }
  }
}
