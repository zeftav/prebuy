// Client for the platform-owner ("super admin") dashboard. The privileged,
// cross-tenant reads/writes go through two JWT-ON edge functions that re-check
// super-admin then use the service role: `admin-orgs` and `admin-ai-cost`.
//
// The pure helpers (formatUsd / formatCount / daysSince / relativeTime /
// engagementFlag) are UI-only and tested — see admin.test.js.

import { supabase } from './supabase.js'

// ---- edge-function calls ---------------------------------------------------

async function callAdmin(fn, body) {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) return { data: null, error: new Error('You must be signed in.') }
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${fn}`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return { data: null, error: new Error(json.error || `Request failed (${res.status})`) }
    return { data: json, error: null }
  } catch (e) {
    return { data: null, error: e instanceof Error ? e : new Error('Network error') }
  }
}

/** Orgs + engagement + totals + super-admin roster. */
export function fetchAdminOrgs() {
  return callAdmin('admin-orgs', { action: 'list' })
}
export function addSuperAdmin(email) {
  return callAdmin('admin-orgs', { action: 'add_super_admin', email })
}
export function removeSuperAdmin(email) {
  return callAdmin('admin-orgs', { action: 'remove_super_admin', email })
}
export function renameOrg(orgId, name) {
  return callAdmin('admin-orgs', { action: 'rename_org', org_id: orgId, name })
}
export function deleteOrg(orgId) {
  return callAdmin('admin-orgs', { action: 'delete_org', org_id: orgId })
}
/** Read-only drill-in for one shop: org + members (with emails) + inspections. */
export function fetchOrgDetail(orgId) {
  return callAdmin('admin-orgs', { action: 'org_detail', org_id: orgId })
}
/** Anthropic spend aggregated over the last `days`. */
export function fetchAiCost(days = 30) {
  return callAdmin('admin-ai-cost', { action: 'summary', days })
}

// ---- pure helpers (tested) -------------------------------------------------

/** Format a USD amount, null-safe, negatives handled. Small amounts get cents. */
export function formatUsd(n) {
  if (n === null || n === undefined || n === '') return '—'
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  const abs = Math.abs(v)
  const digits = abs > 0 && abs < 100 ? 2 : 0
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits })
}

/** Format an integer count with thousands separators, null-safe. */
export function formatCount(n) {
  if (n === null || n === undefined || n === '') return '—'
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  return Math.round(v).toLocaleString('en-US')
}

/** Whole days between an ISO timestamp and `now` (ms). null for missing/invalid. */
export function daysSince(iso, now = Date.now()) {
  if (!iso) return null
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  return Math.max(0, Math.floor((now - t) / 86400000))
}

/** Human "x days ago" from an ISO timestamp. "Never" for null. */
export function relativeTime(iso, now = Date.now()) {
  const d = daysSince(iso, now)
  if (d === null) return 'Never'
  if (d === 0) return 'Today'
  if (d === 1) return 'Yesterday'
  if (d < 30) return `${d} days ago`
  if (d < 60) return 'Last month'
  const months = Math.floor(d / 30)
  return `${months} months ago`
}

/**
 * Engagement / at-risk classification for an org row (from admin-orgs). Pure.
 * Returns { level: 'ok'|'warn'|'risk', reason }.
 *   - no inspections, freshly signed up (<7d) → warn "New — no inspections yet"
 *   - no inspections, older                   → risk "Never active"
 *   - inactive ≥30d                           → risk "Inactive Nd"
 *   - quiet 14–29d                            → warn "Quiet Nd"
 *   - otherwise                               → ok "Active"
 */
export function engagementFlag(org, now = Date.now()) {
  const inspections = Number(org?.inspection_count) || 0
  if (inspections === 0) {
    const age = daysSince(org?.created_at, now)
    if (age !== null && age < 7) return { level: 'warn', reason: 'New — no inspections yet' }
    return { level: 'risk', reason: 'Never active' }
  }
  const idle = daysSince(org?.last_active, now)
  if (idle === null) return { level: 'ok', reason: 'Active' }
  if (idle >= 30) return { level: 'risk', reason: `Inactive ${idle}d` }
  if (idle >= 14) return { level: 'warn', reason: `Quiet ${idle}d` }
  return { level: 'ok', reason: 'Active' }
}
