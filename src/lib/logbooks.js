// Logbook audit: track an aircraft's records across multiple logbooks per type,
// reconcile time continuity (gaps = possible missing books; overlaps = possible
// duplicated time), and capture notable events. The reconciliation is pure +
// tested; CRUD is thin.

import { supabase } from './supabase.js'
import { engineLabel, propLabel } from './profile.js'

export const LOGBOOK_KINDS = ['airframe', 'engine', 'propeller', 'ad', 'form_337', 'other']
// Kinds that are tracked per engine/prop position on a multi-engine aircraft.
export const POSITIONAL_KINDS = ['engine', 'propeller']
// Kinds that carry a tach time-span and so take part in reconciliation. AD reports
// and 337s are scanned records without a continuous time span.
export const TIME_KINDS = ['airframe', 'engine', 'propeller', 'other']
export const EVENT_CATEGORIES = ['ad', '337', 'overhaul', 'prop_strike', 'damage', 'other']
const TOL = 0.1 // tach-hour tolerance for "continuous"

export function kindLabel(k) {
  return { airframe: 'Airframe', engine: 'Engine', propeller: 'Propeller', ad: 'AD compliance', form_337: 'Form 337s', other: 'Other' }[k] || k
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

// A genuinely-recorded tach value (null/blank/0 = not read). Unlike num(), this
// doesn't coerce null→0, so it's the right test for "did we read a time?".
function hasTach(v) {
  if (v == null || v === '') return false
  const n = Number(v)
  return Number.isFinite(n) && n !== 0
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

  // Books with no readable times can't be placed in the sequence → surfaced so the
  // inspector knows continuity can't be verified for them (and to re-check a scan).
  const untimed = sorted.filter((b) => !hasTach(b.start_tach) && !hasTach(b.end_tach))

  return { sorted, gaps, overlaps, firstStart, lastEnd, tracked, count: sorted.length, untimed }
}

/**
 * Order logbooks for display: by kind (airframe→engine→prop→AD→337→other), then
 * position, then chronologically by start tach (untimed books sink to the end of
 * their group), then start date, then scan order. So scans entered out of order
 * (or mislabeled and then corrected) present in the right sequence automatically.
 * Pure + tested.
 */
export function orderLogbooks(logbooks) {
  const kindRank = (k) => {
    const i = LOGBOOK_KINDS.indexOf(k)
    return i === -1 ? LOGBOOK_KINDS.length : i
  }
  // Untimed (null/blank/0 per hasTach) sinks to the end of its group.
  const startKey = (b) => (hasTach(b.start_tach) ? Number(b.start_tach) : Infinity)
  return [...(logbooks ?? [])].sort(
    (a, b) =>
      kindRank(a.kind) - kindRank(b.kind) ||
      (a.position || 0) - (b.position || 0) ||
      startKey(a) - startKey(b) ||
      String(a.start_date ?? '').localeCompare(String(b.start_date ?? '')) ||
      (a.sort_order || 0) - (b.sort_order || 0),
  )
}

// Earliest airframe entry above this (hrs) suggests records may not reach back to
// the aircraft's first flight. A few hours of test/ferry time is normal.
const START_COVERAGE_TOL = 5

/** Label a logbook group by kind + (for engine/prop on a twin) position. Pure. */
export function groupLabel(kind, position, engineCount = 1, layout = 'conventional') {
  if (!POSITIONAL_KINDS.includes(kind) || engineCount <= 1) return kindLabel(kind)
  if (!position) return `${kindLabel(kind)} (unassigned)`
  return kind === 'propeller'
    ? propLabel(position - 1, engineCount, layout)
    : engineLabel(position - 1, engineCount, layout)
}

/**
 * Reconcile all logbooks into display groups. Engine/propeller books split by
 * position when the aircraft has >1 engine; everything else groups by kind.
 * Returns { groups, issues }. Pure.
 */
export function reconcileLogbooks(logbooks, { engineCount = 1, layout = 'conventional' } = {}) {
  const groups = []
  const issues = []

  const addGroup = (kind, position, books) => {
    const s = summarizeKind(books)
    const label = groupLabel(kind, position, engineCount, layout)
    groups.push({ key: position ? `${kind}:${position}` : kind, kind, position: position ?? null, label, summary: s })
    for (const g of s.gaps) {
      issues.push({ kind, type: 'gap', message: `${label}: ${g.hours.toFixed(1)} hr gap between tach ${g.fromTach} and ${g.toTach} — a logbook may be missing.` })
    }
    for (const o of s.overlaps) {
      issues.push({ kind, type: 'overlap', message: `${label}: ${o.hours.toFixed(1)} hr overlap around tach ${o.fromTach}–${o.toTach} — entries may be duplicated.` })
    }
    for (const b of s.untimed) {
      issues.push({ kind, type: 'untimed', message: `${label}: couldn't read times for "${b.label || kindLabel(kind)}" — can't place it in the sequence; check the scan or enter its times.` })
    }
    // Coverage back to manufacture — airframe only (engine/prop replacements
    // legitimately start later, so we don't flag those).
    if (kind === 'airframe' && s.firstStart != null && s.firstStart > START_COVERAGE_TOL) {
      issues.push({ kind, type: 'coverage', message: `${label}: earliest entry read is at ${s.firstStart.toFixed(1)} hrs — confirm the records go back to the aircraft's first flight (an early logbook may be missing).` })
    }
  }

  for (const k of TIME_KINDS) {
    const books = (logbooks ?? []).filter((b) => b.kind === k)
    if (!books.length) continue
    if (POSITIONAL_KINDS.includes(k) && engineCount > 1) {
      // One group per position (1..N), plus an "unassigned" (position 0/null) bucket.
      const byPos = new Map()
      for (const b of books) {
        const p = Number(b.position) > 0 ? Number(b.position) : 0
        if (!byPos.has(p)) byPos.set(p, [])
        byPos.get(p).push(b)
      }
      for (const p of [...byPos.keys()].sort((a, b) => a - b)) addGroup(k, p || null, byPos.get(p))
    } else {
      addGroup(k, null, books)
    }
  }
  return { groups, issues }
}

// ── CRUD ────────────────────────────────────────────────────────────────────

// Normalize a position to a positive int for engine/prop, else null.
function posFor(kind, position) {
  if (!POSITIONAL_KINDS.includes(kind)) return null
  const p = Number(position)
  return Number.isFinite(p) && p > 0 ? p : null
}

export async function listLogbooks(inspectionId) {
  const { data, error } = await supabase
    .from('logbooks')
    .select('id, kind, position, label, start_date, start_tach, end_date, end_tach, sort_order, notes, review_note')
    .eq('inspection_id', inspectionId)
  return { data: data ?? [], error }
}

export async function addLogbook(inspection, draft) {
  const kind = LOGBOOK_KINDS.includes(draft.kind) ? draft.kind : 'airframe'
  const row = {
    inspection_id: inspection.id,
    org_id: inspection.org_id,
    kind,
    position: posFor(kind, draft.position),
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
    .select('id, kind, position, label, start_date, start_tach, end_date, end_tach, sort_order, notes, review_note')
    .single()
  return { data, error }
}

/** Update a logbook's fields (label / kind / position / dates / tach / notes). */
export async function updateLogbook(id, patch) {
  const clean = { ...patch }
  if ('start_tach' in clean) clean.start_tach = num(clean.start_tach)
  if ('end_tach' in clean) clean.end_tach = num(clean.end_tach)
  const { data, error } = await supabase
    .from('logbooks')
    .update(clean)
    .eq('id', id)
    .select('id, kind, position, label, start_date, start_tach, end_date, end_tach, sort_order, notes, review_note')
    .single()
  return { data, error }
}

export async function deleteLogbook(id) {
  const { error } = await supabase.from('logbooks').delete().eq('id', id)
  return { error }
}

/**
 * Reduce one-or-more extraction logbook drafts (a book scanned across batches)
 * into a single time span: earliest start, latest end (date + tach). Pure.
 */
export function spanFromDrafts(drafts) {
  let sd = null, st = null, ed = null, et = null
  for (const d of drafts ?? []) {
    const ds = cleanDraftValue(d?.start_date)
    const de = cleanDraftValue(d?.end_date)
    // cleanDraftValue maps blank/0 → null; guard so num(null) (=0) doesn't revive it.
    const tsRaw = cleanDraftValue(d?.start_tach)
    const teRaw = cleanDraftValue(d?.end_tach)
    const ts = tsRaw == null ? null : num(tsRaw)
    const te = teRaw == null ? null : num(teRaw)
    if (ds && (!sd || ds < sd)) sd = ds
    if (de && (!ed || de > ed)) ed = de
    if (ts != null && (st == null || ts < st)) st = ts
    if (te != null && (et == null || te > et)) et = te
  }
  return { start_date: sd, start_tach: st, end_date: ed, end_tach: et }
}

/** Combine two spans into the widest envelope (earliest start, latest end). Pure. */
export function mergeSpan(a, b) {
  const minDate = (x, y) => (!x ? y : !y ? x : x < y ? x : y)
  const maxDate = (x, y) => (!x ? y : !y ? x : x > y ? x : y)
  const minNum = (x, y) => (x == null ? y : y == null ? x : Math.min(x, y))
  const maxNum = (x, y) => (x == null ? y : y == null ? x : Math.max(x, y))
  return {
    start_date: minDate(a?.start_date ?? null, b?.start_date ?? null),
    start_tach: minNum(num(a?.start_tach), num(b?.start_tach)),
    end_date: maxDate(a?.end_date ?? null, b?.end_date ?? null),
    end_tach: maxNum(num(a?.end_tach), num(b?.end_tach)),
  }
}

export async function listEvents(inspectionId) {
  const { data, error } = await supabase
    .from('logbook_events')
    .select('id, logbook_id, position, event_date, tach, category, title, description, source_page, next_due_date, next_due_hours, show_on_report')
    .eq('inspection_id', inspectionId)
    .order('event_date', { ascending: true })
  return { data: data ?? [], error }
}

/** Update a logbook event (e.g. toggle show_on_report). */
export async function updateLogbookEvent(id, patch) {
  const { data, error } = await supabase
    .from('logbook_events')
    .update(patch)
    .eq('id', id)
    .select('id, logbook_id, position, event_date, tach, category, title, description, source_page, next_due_date, next_due_hours, show_on_report')
    .single()
  return { data, error }
}

export async function addEvent(inspection, draft) {
  const t = String(draft.title ?? '').trim()
  if (!t) return { data: null, error: new Error('Give the event a title.') }
  const p = Number(draft.position)
  const sp = Number(draft.source_page)
  const row = {
    inspection_id: inspection.id,
    org_id: inspection.org_id,
    logbook_id: draft.logbookId || draft.logbook_id || null,
    category: EVENT_CATEGORIES.includes(draft.category) ? draft.category : 'other',
    title: t,
    position: Number.isFinite(p) && p > 0 ? p : null,
    event_date: draft.event_date || null,
    tach: num(draft.tach),
    description: draft.description?.trim() || null,
    source_page: Number.isFinite(sp) && sp > 0 ? sp : null,
    next_due_date: draft.next_due_date || null,
    next_due_hours: num(draft.next_due_hours),
  }
  const { data, error } = await supabase
    .from('logbook_events')
    .insert(row)
    .select('id, logbook_id, position, event_date, tach, category, title, description, source_page, next_due_date, next_due_hours, show_on_report')
    .single()
  return { data, error }
}

export async function deleteEvent(id) {
  const { error } = await supabase.from('logbook_events').delete().eq('id', id)
  return { error }
}

/** List the parts extracted for an aircraft (newest-ish first). */
export async function listParts(inspectionId) {
  const { data, error } = await supabase
    .from('logbook_parts')
    .select('id, logbook_id, part_number, description, event_date, tach, source_page, show_on_report')
    .eq('inspection_id', inspectionId)
    .order('event_date', { ascending: false, nullsFirst: false })
  return { data: data ?? [], error }
}

/** Set report visibility on ALL of an inspection's events at once. */
export async function setAllEventsReport(inspectionId, show) {
  const { error } = await supabase.from('logbook_events').update({ show_on_report: !!show }).eq('inspection_id', inspectionId)
  return { error }
}

/** Set report visibility on ALL of an inspection's parts at once. */
export async function setAllPartsReport(inspectionId, show) {
  const { error } = await supabase.from('logbook_parts').update({ show_on_report: !!show }).eq('inspection_id', inspectionId)
  return { error }
}

/** Update a logbook part (e.g. toggle show_on_report). */
export async function updatePart(id, patch) {
  const { data, error } = await supabase
    .from('logbook_parts')
    .update(patch)
    .eq('id', id)
    .select('id, logbook_id, part_number, description, event_date, tach, source_page, show_on_report')
    .single()
  return { data, error }
}

/** Insert extracted parts for an aircraft. Ignores empties. */
export async function addParts(inspection, logbookId, parts) {
  const rows = (parts ?? [])
    .map((p) => {
      const sp = Number(p.source_page)
      return {
        inspection_id: inspection.id,
        org_id: inspection.org_id,
        logbook_id: logbookId || null,
        part_number: cleanDraftValue(p.part_number) || null,
        description: cleanDraftValue(p.description) || null,
        event_date: cleanDraftValue(p.event_date) || null,
        tach: num(cleanDraftValue(p.tach)),
        source_page: Number.isFinite(sp) && sp > 0 ? sp : null,
      }
    })
    .filter((r) => r.part_number || r.description)
  if (!rows.length) return { data: [], error: null }
  const { data, error } = await supabase.from('logbook_parts').insert(rows).select('id, logbook_id, part_number, description, event_date, tach, source_page, show_on_report')
  return { data: data ?? [], error }
}

/** Delete an extracted part. */
export async function deletePart(id) {
  const { error } = await supabase.from('logbook_parts').delete().eq('id', id)
  return { error }
}

/**
 * Clear a logbook's extracted events + parts (used before a re-read, so re-reading
 * the same pages doesn't duplicate them). Manual entries on the book go too — the
 * UI confirms first.
 */
export async function deleteScanRecordsForLogbook(logbookId) {
  await supabase.from('logbook_events').delete().eq('logbook_id', logbookId)
  await supabase.from('logbook_parts').delete().eq('logbook_id', logbookId)
}

/** Realign a logbook's events to a new position (used when its type is corrected). */
export async function reassignLogbookEvents(logbookId, position) {
  const p = Number(position)
  const { error } = await supabase
    .from('logbook_events')
    .update({ position: Number.isFinite(p) && p > 0 ? p : null })
    .eq('logbook_id', logbookId)
  return { error }
}

// ── OCR import (Claude vision via the structure-logbook edge fn) ─────────────

/** Normalize a draft logbook/event field: empty string → null, 0 → null for tach. */
export function cleanDraftValue(v) {
  if (v === '' || v == null) return null
  if (typeof v === 'number') return v === 0 ? null : v
  return v
}

// The edge fn caps images per request (vision token budget). A full logbook is
// 80-100 pages, so the client scans in batches of this size and merges. Keep it
// comfortably under the fn's MAX_IMAGES.
export const SCAN_BATCH_SIZE = 12

/** Split an array into chunks of `size` (>=1). Pure. */
export function chunk(arr, size) {
  const n = Math.max(1, Math.floor(size) || 1)
  const list = Array.isArray(arr) ? arr : []
  const out = []
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n))
  return out
}

/**
 * Shift the 1-based `page` on a draft's events/parts by `offset` — used to turn a
 * per-batch page number into a page number over the whole set of pages read (each
 * batch starts at a later page). 0/absent page stays 0. Pure + tested.
 */
export function offsetDraftPages(draft, offset) {
  const off = Number(offset) || 0
  const bump = (arr) =>
    Array.isArray(arr)
      ? arr.map((x) => {
          const p = Number(x?.page)
          return { ...x, page: Number.isFinite(p) && p > 0 ? p + off : 0 }
        })
      : []
  return { ...(draft ?? {}), events: bump(draft?.events), parts: bump(draft?.parts) }
}

/**
 * Merge several {logbooks, events} extraction drafts into one by concatenating.
 * Duplicates/partials across batches are expected — the human review step curates
 * them. Pure. Tolerates null/missing arrays.
 */
export function mergeExtractDrafts(drafts) {
  const out = { logbooks: [], events: [], unclear: [], parts: [], compliance: [], limits: [], specs: {}, currency: {}, equipment: { avionics: [], additional: [] } }
  const fillBlanks = (into, from) => {
    if (from && typeof from === 'object') for (const [k, v] of Object.entries(from)) if (v && !into[k]) into[k] = v
  }
  for (const d of drafts ?? []) {
    if (Array.isArray(d?.logbooks)) out.logbooks.push(...d.logbooks)
    if (Array.isArray(d?.events)) out.events.push(...d.events)
    if (Array.isArray(d?.unclear)) out.unclear.push(...d.unclear)
    if (Array.isArray(d?.parts)) out.parts.push(...d.parts)
    if (Array.isArray(d?.compliance)) out.compliance.push(...d.compliance)
    if (Array.isArray(d?.limits)) out.limits.push(...d.limits)
    // Profile fields: fill blanks across batches (first legible value wins); equipment concatenates.
    fillBlanks(out.specs, d?.specs)
    fillBlanks(out.currency, d?.currency)
    if (Array.isArray(d?.equipment?.avionics)) out.equipment.avionics.push(...d.equipment.avionics)
    if (Array.isArray(d?.equipment?.additional)) out.equipment.additional.push(...d.equipment.additional)
  }
  return out
}

/**
 * Detect likely-duplicate events — the same entry read twice (e.g. a page scanned
 * twice). Groups by category + normalized title + date + tach; returns the groups
 * with more than one member. Pure + tested. (Duplicate-page handling at the
 * analysis level, per the product call.)
 */
export function duplicateEvents(events) {
  const groups = new Map()
  for (const e of events ?? []) {
    const key = [
      e.category ?? '',
      String(e.title ?? '').trim().toLowerCase(),
      e.event_date ?? '',
      e.tach ?? '',
    ].join('|')
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(e)
  }
  return [...groups.values()].filter((g) => g.length > 1)
}

/**
 * Filter an aircraft's records (events + parts) by a free-text query, across
 * title/description/category and part number/description. Pure + tested.
 */
export function searchRecords({ events = [], parts = [] }, query) {
  const q = String(query ?? '').trim().toLowerCase()
  if (!q) return { events: events, parts: parts }
  const hit = (...vals) => vals.some((v) => String(v ?? '').toLowerCase().includes(q))
  return {
    events: events.filter((e) => hit(e.title, e.description, e.category)),
    parts: parts.filter((p) => hit(p.part_number, p.description)),
  }
}

/**
 * Scan a whole logbook (many pages) in batches and merge the drafts. Sequential
 * so we don't hammer the AI / hit rate limits. `onProgress({ done, total })` is
 * called per batch. Returns { data, error, partial } — partial=true when some
 * batches failed but others succeeded (we keep what we got). Errors only when
 * EVERY batch failed.
 */
export async function extractLogbooksBatched(imageUrls, orgId, { onProgress, context } = {}) {
  const urls = (imageUrls ?? []).filter(Boolean)
  if (!urls.length) return { data: null, error: new Error('No images to read.'), partial: false }
  const batches = chunk(urls, SCAN_BATCH_SIZE)
  const drafts = []
  let failures = 0
  let lastError = null
  for (let i = 0; i < batches.length; i++) {
    const { data, error } = await extractLogbooks(batches[i], orgId, context)
    if (error) {
      failures += 1
      lastError = error
    } else if (data) {
      // Turn per-batch page numbers into positions across the whole read set.
      drafts.push(offsetDraftPages(data, i * SCAN_BATCH_SIZE))
    }
    onProgress?.({ done: i + 1, total: batches.length })
  }
  if (drafts.length === 0) {
    return { data: null, error: lastError || new Error('Couldn’t read the pages.'), partial: false }
  }
  return { data: mergeExtractDrafts(drafts), error: null, partial: failures > 0 }
}

/**
 * Extract draft logbooks + events from photographed pages (signed image URLs).
 * Optional `context` ({ kind, position }) tells the model which logbook these
 * pages are, so it reports that component's own time (TSN/TSO) and tailors
 * extraction for AD reports / 337s. Optional `pdfUrl` sends a records PDF (e.g.
 * an MM limits export) straight to the model as a document instead of images.
 */
export async function extractLogbooks(imageUrls, orgId, context = null, pdfUrl = null) {
  if (!imageUrls?.length && !pdfUrl) return { data: null, error: new Error('No pages to read.') }
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) return { data: null, error: new Error('You must be signed in.') }

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/structure-logbook`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ images: imageUrls ?? [], org_id: orgId || null, context: context || null, pdf_url: pdfUrl || null }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return { data: null, error: new Error(body.error || `Request failed (${res.status})`) }
    return {
      data: {
        logbooks: body.logbooks ?? [], events: body.events ?? [], unclear: body.unclear ?? [],
        parts: body.parts ?? [], compliance: body.compliance ?? [], limits: body.limits ?? [],
        // Aircraft-profile fields the same scan reads (specs/currency/equipment) —
        // used to suggest the profile from the logbook scans (fill-blanks only).
        specs: body.specs ?? {}, currency: body.currency ?? {},
        equipment: body.equipment ?? { avionics: [], additional: [] },
      },
      error: null,
    }
  } catch (e) {
    return { data: null, error: e instanceof Error ? e : new Error('Network error') }
  }
}
