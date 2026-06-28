// Checklist instantiation + item updates for the guided inspection view.
//
// "Assemble" stage: when an inspection is first opened, copy the matching global
// template's items into per-job `inspection_items` (an editable copy the shop can
// then work + customize). Matching is by vertical + model (e.g. A36). All under
// RLS — the client may read global templates and write its own org's items.

import { supabase } from './supabase.js'
import { normalizeProfile, engineLabel, propLabel } from './profile.js'

/**
 * Expand template items for a multi-engine aircraft: Engine/Propeller items are
 * duplicated per engine (title suffixed with the position label); everything else
 * passes through unchanged. Single-engine or non-aviation → no expansion. Pure.
 * Returns insert-ready partials (sans inspection_id/org_id/status).
 */
export function fanOutTemplateItems(tItems, { vertical, engineCount = 1, layout = 'conventional' } = {}) {
  const count = vertical === 'aviation' && engineCount > 1 ? engineCount : 1
  const rows = []
  for (const ti of tItems ?? []) {
    const cat = String(ti.category ?? '')
    const fan = count > 1 && (cat === 'Engine' || cat === 'Propeller')
    const copies = fan ? count : 1
    for (let i = 0; i < copies; i++) {
      const label = !fan ? '' : cat === 'Propeller' ? propLabel(i, count, layout) : engineLabel(i, count, layout)
      rows.push({
        template_item_id: ti.id,
        category: ti.category,
        title: fan ? `${ti.title} — ${label}` : ti.title,
        description: ti.description,
        sort_order: (Number(ti.sort_order) || 0) * 10 + i,
        risk_weight: ti.risk_weight,
      })
    }
  }
  return rows
}

/** Load one inspection by id (RLS scopes it to the user's orgs). */
export async function getInspection(id) {
  const { data, error } = await supabase
    .from('inspections')
    .select('id, org_id, vertical, identifier, make, model, year, customer_name, customer_email, inspector_name, location, inspection_date, status, attributes, share_token, published_at, created_at')
    .eq('id', id)
    .maybeSingle()
  return { data, error }
}

/** List an inspection's items. */
export async function listInspectionItems(inspectionId) {
  const { data, error } = await supabase
    .from('inspection_items')
    .select('id, template_item_id, category, title, description, sort_order, risk_weight, owner_priority, status, severity, findings, transcript')
    .eq('inspection_id', inspectionId)
  return { data: data ?? [], error }
}

/**
 * Find the best global template for an inspection: a model-specific one if it
 * exists, otherwise the vertical's generic fallback (model IS NULL, e.g. the
 * "General Aircraft" survey). Returns { data, error, generic }.
 */
export async function findTemplateFor({ vertical, make, model }) {
  // 1. Model-specific match (e.g. Beech A36).
  if (model) {
    let q = supabase
      .from('checklist_templates')
      .select('id, make, model, name')
      .eq('is_global', true)
      .eq('vertical', vertical)
      .ilike('model', model)
    if (make) q = q.ilike('make', make)
    const { data, error } = await q.limit(1).maybeSingle()
    if (error) return { data: null, error, generic: false }
    if (data) return { data, error: null, generic: false }
  }

  // 2. Generic fallback for the vertical (one template with model IS NULL).
  const { data, error } = await supabase
    .from('checklist_templates')
    .select('id, make, model, name')
    .eq('is_global', true)
    .eq('vertical', vertical)
    .is('model', null)
    .limit(1)
    .maybeSingle()
  return { data, error, generic: !!data }
}

/**
 * Ensure an inspection has its checklist items. If it already has some, returns
 * them. Otherwise instantiates from the matching global template (if any). Returns
 * { data: items, error, templateMatched }.
 */
export async function ensureInspectionItems(inspection) {
  const existing = await listInspectionItems(inspection.id)
  if (existing.error) return { data: [], error: existing.error, templateMatched: null, generic: false }
  if (existing.data.length > 0) return { data: existing.data, error: null, templateMatched: null, generic: false }

  const { data: template, error: tErr, generic } = await findTemplateFor(inspection)
  if (tErr) return { data: [], error: tErr, templateMatched: null, generic: false }
  if (!template) return { data: [], error: null, templateMatched: false, generic: false }

  const { data: tItems, error: tiErr } = await supabase
    .from('template_items')
    .select('id, category, title, description, sort_order, risk_weight, est_cost_low, est_cost_high, ata_chapter')
    .eq('template_id', template.id)
  if (tiErr) return { data: [], error: tiErr, templateMatched: null, generic }

  const prof = normalizeProfile(inspection.attributes?.profile)
  const engineCount = Math.max(prof.engine_count, Number(inspection.attributes?.engine_count) || 1)
  const rows = fanOutTemplateItems(tItems, { vertical: inspection.vertical, engineCount, layout: prof.layout }).map((r) => ({
    inspection_id: inspection.id,
    org_id: inspection.org_id,
    ...r,
    status: 'pending',
  }))
  if (rows.length === 0) return { data: [], error: null, templateMatched: true, generic }

  const { error: insErr } = await supabase.from('inspection_items').insert(rows)
  if (insErr) return { data: [], error: insErr, templateMatched: true, generic }

  const reload = await listInspectionItems(inspection.id)
  return { data: reload.data, error: reload.error, templateMatched: true, generic }
}

/** Update one inspection item (status / findings / severity / owner_priority). */
export async function updateInspectionItem(id, patch) {
  const { data, error } = await supabase
    .from('inspection_items')
    .update(patch)
    .eq('id', id)
    .select('id, status, severity, findings, owner_priority')
    .single()
  return { data, error }
}

/** Add a shop/owner-custom item to an inspection (not from a template). */
export async function addCustomItem(inspection, { category, title, description, risk_weight, owner_priority = false }) {
  const t = String(title ?? '').trim()
  if (!t) return { data: null, error: new Error('Give the item a title.') }
  const { data, error } = await supabase
    .from('inspection_items')
    .insert({
      inspection_id: inspection.id,
      org_id: inspection.org_id,
      category: String(category ?? '').trim() || 'Custom',
      title: t,
      description: String(description ?? '').trim() || null,
      risk_weight: Number.isFinite(Number(risk_weight)) ? Number(risk_weight) : 50,
      owner_priority,
      status: 'pending',
    })
    .select('id, template_item_id, category, title, description, sort_order, risk_weight, owner_priority, status, severity, findings, transcript')
    .single()
  return { data, error }
}

/** Delete an inspection item (used for custom, non-template items). */
export async function deleteInspectionItem(id) {
  const { error } = await supabase.from('inspection_items').delete().eq('id', id)
  return { error }
}
