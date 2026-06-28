// Inspection follow-ups ("to-investigate" list) — a per-inspection backlog of
// open questions, kept separate from inspection_items so findings stay clean.
// CRUD (org-scoped RLS) + pure helpers (open count, group by reason) that the
// InspectionDetail panel and the report section use.

import { supabase } from './supabase.js'

// Reason taxonomy (matches the migration's CHECK). Order = display order.
export const FOLLOWUP_REASONS = [
  { key: 'research', label: 'Needs research' },
  { key: 'look-deeper', label: 'Look deeper' },
  { key: 'awaiting-records', label: 'Awaiting records' },
  { key: 'second-opinion', label: 'Second opinion' },
  { key: 'other', label: 'Other' },
]

const REASON_KEYS = FOLLOWUP_REASONS.map((r) => r.key)
const SELECT = 'id, inspection_id, org_id, inspection_item_id, note, reason, status, show_on_report, created_at, updated_at'

/** Human label for a reason key. Pure. */
export function reasonLabel(key) {
  return FOLLOWUP_REASONS.find((r) => r.key === key)?.label ?? 'Other'
}

/** List an inspection's follow-ups (newest first). */
export async function listFollowups(inspectionId) {
  const { data, error } = await supabase
    .from('inspection_followups')
    .select(SELECT)
    .eq('inspection_id', inspectionId)
    .order('created_at', { ascending: false })
  return { data: data ?? [], error }
}

/** Add a follow-up to an inspection. */
export async function addFollowup(inspection, { note, reason = 'research', inspectionItemId = null, showOnReport = false }, userId = null) {
  const text = String(note ?? '').trim()
  if (!text) return { data: null, error: new Error('Write what to follow up on.') }
  const { data, error } = await supabase
    .from('inspection_followups')
    .insert({
      inspection_id: inspection.id,
      org_id: inspection.org_id,
      inspection_item_id: inspectionItemId,
      note: text,
      reason: REASON_KEYS.includes(reason) ? reason : 'other',
      show_on_report: !!showOnReport,
      created_by: userId,
    })
    .select(SELECT)
    .single()
  return { data, error }
}

/** Update a follow-up (status / reason / note / show_on_report). Stamps updated_at. */
export async function updateFollowup(id, patch) {
  const clean = { ...patch, updated_at: new Date().toISOString() }
  const { data, error } = await supabase
    .from('inspection_followups')
    .update(clean)
    .eq('id', id)
    .select(SELECT)
    .single()
  return { data, error }
}

/** Delete a follow-up outright. */
export async function deleteFollowup(id) {
  const { error } = await supabase.from('inspection_followups').delete().eq('id', id)
  return { error }
}

// ── Pure helpers (tested) ────────────────────────────────────────────────────

/** Count of still-open follow-ups. Pure. */
export function openCount(followups) {
  return (followups ?? []).filter((f) => f?.status === 'open').length
}

/**
 * Split follow-ups into open / resolved / dismissed buckets, each preserving
 * input order. Pure.
 */
export function groupByStatus(followups) {
  const out = { open: [], resolved: [], dismissed: [] }
  for (const f of followups ?? []) {
    const s = out[f?.status] ? f.status : 'open'
    out[s].push(f)
  }
  return out
}

/**
 * Group OPEN follow-ups by reason (display order), dropping empty reasons. Pure.
 * Returns [{ key, label, items }].
 */
export function groupByReason(followups) {
  const open = (followups ?? []).filter((f) => f?.status === 'open')
  return FOLLOWUP_REASONS
    .map((r) => ({ key: r.key, label: r.label, items: open.filter((f) => (REASON_KEYS.includes(f?.reason) ? f.reason : 'other') === r.key) }))
    .filter((g) => g.items.length > 0)
}

/**
 * The follow-ups that belong on the customer report: opted-in (show_on_report)
 * AND not dismissed (resolved-but-shown is allowed — it can still warrant a
 * closer look). Pure — mirrors what the report edge fn selects.
 */
export function reportFollowups(followups) {
  return (followups ?? []).filter((f) => f?.show_on_report && f?.status !== 'dismissed')
}
