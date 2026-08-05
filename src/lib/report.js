// Report: publish an inspection (as a frozen revision) and fetch the customer-
// facing report.
//
// Publishing freezes a SNAPSHOT (a revision) via the `report` edge fn: the share
// link serves the latest published revision, so edits made afterward stay in draft
// until the next revision is published. The public report is served by the same
// edge function (service role, no login) — never via anon RLS.

import { supabase } from './supabase.js'

/**
 * Publish the current state of an inspection as a new revision. The share link then
 * serves this snapshot; further edits are draft until the next revision. Returns
 * { data: { revision, published_at, share_token }, error }.
 */
export async function publishInspection(id, note = null) {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) return { data: null, error: new Error('You must be signed in.') }
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/report`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'publish', inspection_id: id, note }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return { data: null, error: new Error(body.error || `Request failed (${res.status})`) }
    return { data: body, error: null }
  } catch (e) {
    return { data: null, error: e instanceof Error ? e : new Error('Network error') }
  }
}

/** Unpublish (back to in-progress) — the share link then 404s. Revisions are kept. */
export async function unpublishInspection(id) {
  const { data, error } = await supabase
    .from('inspections')
    .update({ status: 'in_progress', published_at: null })
    .eq('id', id)
    .select('id, status')
    .single()
  return { data, error }
}

/** List an inspection's published revisions, newest first. */
export async function listRevisions(inspectionId) {
  const { data, error } = await supabase
    .from('report_revisions')
    .select('id, revision, note, published_at')
    .eq('inspection_id', inspectionId)
    .order('revision', { ascending: false })
  return { data: data ?? [], error }
}

/** Public report URL for a share token. */
export function reportUrl(token) {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}/r/${token}`
}

/** Fetch a published report by share token (via the edge fn; no login). */
export async function fetchReport(token) {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/report`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return { data: null, error: new Error(body.error || `Request failed (${res.status})`) }
    return { data: body, error: null }
  } catch (e) {
    return { data: null, error: e instanceof Error ? e : new Error('Network error') }
  }
}

/** Count items by status. Pure — used by the report summary. */
export function reportSummary(items) {
  const counts = { discrepancy: 0, monitor: 0, ok: 0, na: 0, pending: 0 }
  for (const i of items ?? []) {
    if (i?.status in counts) counts[i.status] += 1
  }
  return counts
}
