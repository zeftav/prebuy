// Client for the `structure-walkaround` edge function (Claude) + pure helpers to
// turn its output into a review list and, on accept, into item patches and
// new-item drafts. JWT ON on the function, so we pass the user's token.
//
// Flow: dictate the whole walk-around → parseWalkaround() → buildReviewRows()
// (pure) → the mechanic reviews/edits/ticks → planApply() (pure) → apply to
// inspection_items (patch matched, addCustomItem for new).

import { supabase } from './supabase.js'
import { riskBand } from './risk.js'

/**
 * Compact the inspection's items into the grounding context the edge fn needs:
 * id, category, title, and a coarse risk band. Pure.
 */
export function itemsContext(items) {
  return (items ?? []).map((i) => ({
    id: i.id,
    category: i.category ?? '',
    title: i.title ?? '',
    risk: riskBand(i),
  }))
}

/**
 * Parse a continuous walk-around transcript into mapped findings via the edge fn.
 * @returns {Promise<{data: {findings: Array}|null, error: Error|null}>}
 */
export async function parseWalkaround(transcript, items, vertical, orgId) {
  const text = String(transcript ?? '').trim()
  if (!text) return { data: null, error: new Error('Dictate or type the walk-around first.') }

  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) return { data: null, error: new Error('You must be signed in.') }

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/structure-walkaround`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        transcript: text,
        items: itemsContext(items),
        vertical: vertical || 'aviation',
        org_id: orgId || null,
      }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { data: null, error: new Error(body.error || `Request failed (${res.status})`) }
    }
    return { data: body, error: null }
  } catch (e) {
    return { data: null, error: e instanceof Error ? e : new Error('Network error') }
  }
}

const STATUSES = ['ok', 'monitor', 'discrepancy']

/**
 * Turn raw AI findings into editable review rows resolved against the current
 * items. Each row: { key, itemId, category, title, status, severity, finding,
 * confidence, accept, isNew }. An item_id that doesn't exist falls back to a new
 * item. `accept` defaults on for everything except empty findings. Pure + tested.
 */
export function buildReviewRows(findings, items) {
  const byId = new Map((items ?? []).map((i) => [i.id, i]))
  return (Array.isArray(findings) ? findings : []).map((f, idx) => {
    const matched = f?.item_id && byId.get(f.item_id)
    const isNew = !matched
    const status = STATUSES.includes(f?.status) ? f.status : 'monitor'
    const severity = clampInt(f?.severity, 0, 100)
    const finding = String(f?.finding ?? '').trim()
    return {
      key: `w${idx}`,
      itemId: matched ? f.item_id : null,
      // For a matched row we show the existing item's labels; for a new one, the
      // model's suggestions (fallback to category 'Walk-around' so it's never blank).
      category: matched ? matched.category : (String(f?.suggested_category ?? '').trim() || 'Walk-around'),
      title: matched ? matched.title : (String(f?.suggested_title ?? '').trim() || titleFromFinding(finding)),
      status,
      severity,
      finding,
      confidence: ['high', 'medium', 'low'].includes(f?.confidence) ? f.confidence : 'medium',
      isNew,
      accept: finding.length > 0,
    }
  })
}

/**
 * From accepted review rows, produce the apply plan. Pure + tested.
 *   { patches: [{ id, patch }], newItems: [{ draft, patch }] }
 * - patches: existing items to update (status/severity/findings + keep transcript).
 * - newItems: a custom-item draft (category/title/description/risk_weight) plus the
 *   patch (status/severity/findings) to apply once the item is created.
 */
export function planApply(rows) {
  const patches = []
  const newItems = []
  for (const r of rows ?? []) {
    if (!r?.accept) continue
    const finding = String(r.finding ?? '').trim()
    if (!finding) continue
    const status = STATUSES.includes(r.status) ? r.status : 'monitor'
    const severity = clampInt(r.severity, 0, 100)
    const patch = { status, severity, findings: finding, transcript: finding }
    if (r.itemId) {
      patches.push({ id: r.itemId, patch })
    } else {
      newItems.push({
        draft: {
          category: String(r.category ?? '').trim() || 'Walk-around',
          title: String(r.title ?? '').trim() || titleFromFinding(finding),
          description: null,
          // New custom items slot into the risk order by severity (min 25).
          risk_weight: Math.max(25, severity),
        },
        patch,
      })
    }
  }
  return { patches, newItems }
}

/** Count rows that will be applied. Pure. */
export function acceptedCount(rows) {
  return (rows ?? []).filter((r) => r?.accept && String(r?.finding ?? '').trim()).length
}

// A short title from a finding (first clause / few words) when the model didn't
// supply one for a new item.
function titleFromFinding(finding) {
  const s = String(finding ?? '').trim()
  if (!s) return 'Walk-around note'
  const clause = s.split(/[.;,—-]/)[0].trim() || s
  const words = clause.split(/\s+/).slice(0, 8).join(' ')
  return words.length > 60 ? `${words.slice(0, 57)}…` : words
}

function clampInt(v, lo, hi) {
  const n = Math.round(Number(v))
  if (!Number.isFinite(n)) return lo
  return Math.min(hi, Math.max(lo, n))
}
