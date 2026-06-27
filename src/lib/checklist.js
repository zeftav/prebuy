// Checklist instantiation + item updates for the guided inspection view.
//
// "Assemble" stage: when an inspection is first opened, copy the matching global
// template's items into per-job `inspection_items` (an editable copy the shop can
// then work + customize). Matching is by vertical + model (e.g. A36). All under
// RLS — the client may read global templates and write its own org's items.

import { supabase } from './supabase.js'

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

/** Find the best global template for an inspection (by vertical + model). */
export async function findTemplateFor({ vertical, make, model }) {
  if (!model) return { data: null, error: null }
  let q = supabase
    .from('checklist_templates')
    .select('id, make, model, name')
    .eq('is_global', true)
    .eq('vertical', vertical)
    .ilike('model', model)
  if (make) q = q.ilike('make', make)
  const { data, error } = await q.limit(1).maybeSingle()
  return { data, error }
}

/**
 * Ensure an inspection has its checklist items. If it already has some, returns
 * them. Otherwise instantiates from the matching global template (if any). Returns
 * { data: items, error, templateMatched }.
 */
export async function ensureInspectionItems(inspection) {
  const existing = await listInspectionItems(inspection.id)
  if (existing.error) return { data: [], error: existing.error, templateMatched: null }
  if (existing.data.length > 0) return { data: existing.data, error: null, templateMatched: null }

  const { data: template, error: tErr } = await findTemplateFor(inspection)
  if (tErr) return { data: [], error: tErr, templateMatched: null }
  if (!template) return { data: [], error: null, templateMatched: false }

  const { data: tItems, error: tiErr } = await supabase
    .from('template_items')
    .select('id, category, title, description, sort_order, risk_weight, est_cost_low, est_cost_high, ata_chapter')
    .eq('template_id', template.id)
  if (tiErr) return { data: [], error: tiErr, templateMatched: null }

  const rows = (tItems ?? []).map((ti) => ({
    inspection_id: inspection.id,
    org_id: inspection.org_id,
    template_item_id: ti.id,
    category: ti.category,
    title: ti.title,
    description: ti.description,
    sort_order: ti.sort_order,
    risk_weight: ti.risk_weight,
    status: 'pending',
  }))
  if (rows.length === 0) return { data: [], error: null, templateMatched: true }

  const { error: insErr } = await supabase.from('inspection_items').insert(rows)
  if (insErr) return { data: [], error: insErr, templateMatched: true }

  const reload = await listInspectionItems(inspection.id)
  return { data: reload.data, error: reload.error, templateMatched: true }
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
export async function addCustomItem(inspection, { category, title, risk_weight, owner_priority = false }) {
  const t = String(title ?? '').trim()
  if (!t) return { data: null, error: new Error('Give the item a title.') }
  const { data, error } = await supabase
    .from('inspection_items')
    .insert({
      inspection_id: inspection.id,
      org_id: inspection.org_id,
      category: String(category ?? '').trim() || 'Custom',
      title: t,
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
