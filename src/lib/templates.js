// Shop checklist templates: upload a checklist PDF → AI-parse into phase-tagged
// items (parse-checklist edge fn) → review → save as a reusable, org-owned
// template (RLS lets a shop own its own templates). A saved template is opt-in per
// inspection — it's applied only when explicitly selected (checklist.js resolves
// `attributes.template_id`); otherwise the standard global library is used.

import { supabase } from './supabase.js'

const BUCKET = 'inspection-media'

export const PHASES = [
  { key: 1, label: 'Phase 1' },
  { key: 2, label: 'Phase 2' },
]
export function phaseLabel(phase) {
  const p = Number(phase)
  return p === 1 ? 'Phase 1' : p === 2 ? 'Phase 2' : ''
}

/** Group parsed/instantiated items by phase (1, 2, then unphased 0). Pure. */
export function groupByPhase(items) {
  const groups = new Map()
  for (const it of items ?? []) {
    const p = [1, 2].includes(Number(it?.phase)) ? Number(it.phase) : 0
    if (!groups.has(p)) groups.set(p, [])
    groups.get(p).push(it)
  }
  return [1, 2, 0].filter((p) => groups.has(p)).map((p) => ({ phase: p, items: groups.get(p) }))
}

/** Does this set of items use phases at all? Pure. */
export function hasPhases(items) {
  return (items ?? []).some((it) => [1, 2].includes(Number(it?.phase)))
}

/**
 * Upload a checklist PDF to private storage, parse it via the edge fn, then remove
 * the temporary object. Returns { data: { name, two_phase, items }, error }.
 */
export async function uploadAndParseChecklist(file, orgId) {
  if (!file) return { data: null, error: new Error('Choose a checklist PDF first.') }
  if (!orgId) return { data: null, error: new Error('No shop selected.') }
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) return { data: null, error: new Error('You must be signed in.') }

  const rand = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`
  const path = `${orgId}/_checklists/${rand}.pdf`
  const up = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'application/pdf', upsert: false })
  if (up.error) return { data: null, error: up.error }

  try {
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 600)
    const url = signed?.signedUrl
    if (!url) return { data: null, error: new Error('Could not read the uploaded file.') }

    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-checklist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ pdf_url: url, org_id: orgId }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) return { data: null, error: new Error(body.error || `Request failed (${res.status})`) }
    return { data: body, error: null }
  } finally {
    // Remove the temporary source PDF — we keep only the parsed template.
    await supabase.storage.from(BUCKET).remove([path]).catch(() => {})
  }
}

/** List a shop's own checklist templates (with item counts). */
export async function listShopTemplates(orgId) {
  const { data, error } = await supabase
    .from('checklist_templates')
    .select('id, name, vertical, make, model, created_at, template_items(count)')
    .eq('org_id', orgId)
    .eq('is_global', false)
    .order('created_at', { ascending: false })
  const rows = (data ?? []).map((t) => ({ ...t, item_count: t.template_items?.[0]?.count ?? 0 }))
  return { data: rows, error }
}

/**
 * Save a reviewed checklist as an org-owned template. `items` are the reviewed
 * rows ({ phase, category, title, description, risk_weight, sort_order }).
 */
export async function saveShopTemplate({ orgId, vertical, make, model, name, items }) {
  const clean = (items ?? []).filter((it) => String(it?.title ?? '').trim())
  if (!clean.length) return { data: null, error: new Error('No items to save.') }

  const { data: tmpl, error: tErr } = await supabase
    .from('checklist_templates')
    .insert({
      org_id: orgId,
      is_global: false,
      vertical: vertical || 'aviation',
      make: make?.trim() || null,
      model: model?.trim() || null,
      name: String(name ?? '').trim() || 'Uploaded checklist',
    })
    .select('id, name, vertical, make, model')
    .single()
  if (tErr) return { data: null, error: tErr }

  const rows = clean.map((it, i) => ({
    template_id: tmpl.id,
    category: String(it.category ?? '').trim() || 'General',
    title: String(it.title ?? '').trim(),
    description: String(it.description ?? '').trim() || null,
    sort_order: Number.isFinite(Number(it.sort_order)) ? Number(it.sort_order) : i,
    risk_weight: Math.max(0, Math.min(100, Math.round(Number(it.risk_weight)) || 0)),
    phase: [1, 2].includes(Number(it.phase)) ? Number(it.phase) : null,
  }))
  const { error: iErr } = await supabase.from('template_items').insert(rows)
  if (iErr) {
    await supabase.from('checklist_templates').delete().eq('id', tmpl.id) // roll back
    return { data: null, error: iErr }
  }
  return { data: { ...tmpl, item_count: rows.length }, error: null }
}

/** Delete a shop template (its items cascade). */
export async function deleteTemplate(id) {
  const { error } = await supabase.from('checklist_templates').delete().eq('id', id)
  return { error }
}
