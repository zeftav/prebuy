// Report: publish an inspection and fetch the customer-facing report.
//
// Publishing flips status → 'published' + stamps published_at (the client can,
// under RLS, as an org member). The public report itself is served by the
// `report` edge function (service role, no login) — never via anon RLS.

import { supabase } from './supabase.js'

/** Publish an inspection so its share link works. */
export async function publishInspection(id) {
  const { data, error } = await supabase
    .from('inspections')
    .update({ status: 'published', published_at: new Date().toISOString() })
    .eq('id', id)
    .select('id, status, published_at, share_token')
    .single()
  return { data, error }
}

/** Unpublish (back to in-progress) — the share link then 404s. */
export async function unpublishInspection(id) {
  const { data, error } = await supabase
    .from('inspections')
    .update({ status: 'in_progress', published_at: null })
    .eq('id', id)
    .select('id, status')
    .single()
  return { data, error }
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
