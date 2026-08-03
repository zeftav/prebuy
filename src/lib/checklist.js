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
        phase: [1, 2].includes(Number(ti.phase)) ? Number(ti.phase) : null,
      })
    }
  }
  return rows
}

/**
 * Pick the best-matching shop template for an aircraft from a shop's templates.
 * Prefers an exact model match, then a fuzzy model match, then a make-wide
 * template (no model), then a catch-all (no make/model). Pure + tested.
 */
export function pickTemplate(templates, { make, model } = {}) {
  const norm = (s) => String(s ?? '').trim().toLowerCase()
  const m = norm(model)
  const mk = norm(make)
  const list = templates ?? []
  return (
    (m && list.find((t) => t.model && norm(t.model) === m)) ||
    (m && list.find((t) => t.model && (norm(t.model).includes(m) || m.includes(norm(t.model))))) ||
    (mk && list.find((t) => !t.model && t.make && (norm(t.make).includes(mk) || mk.includes(norm(t.make))))) ||
    list.find((t) => !t.model && !t.make) ||
    null
  )
}

/** Load one inspection by id (RLS scopes it to the user's orgs). */
export async function getInspection(id) {
  const { data, error } = await supabase
    .from('inspections')
    .select('id, org_id, vertical, mode, source_inspection_id, identifier, make, model, year, customer_name, customer_email, inspector_name, location, inspection_date, status, attributes, share_token, published_at, created_at')
    .eq('id', id)
    .maybeSingle()
  return { data, error }
}

/** List an inspection's items. */
export async function listInspectionItems(inspectionId) {
  const { data, error } = await supabase
    .from('inspection_items')
    .select('id, template_item_id, category, title, description, sort_order, risk_weight, owner_priority, status, severity, findings, transcript, phase')
    .eq('inspection_id', inspectionId)
  return { data: data ?? [], error }
}

/**
 * Resolve the template to instantiate for an inspection.
 *
 * A shop's OWN uploaded template (e.g. their Savvy Beechcraft prebuy) is only used
 * when it's *explicitly selected* — the inspection carries its id in
 * `attributes.template_id`. Otherwise we fall back to the standard global library:
 * a model-specific template if one exists, else the vertical's generic survey.
 * Returns { data, error, generic, shopOwned }.
 */
export async function findTemplateFor({ vertical, make, model, template_id }) {
  // 0. Explicitly-chosen template (shop-owned or a specific global one). RLS scopes
  //    it to templates this shop may read (its own + globals).
  if (template_id) {
    const { data, error } = await supabase
      .from('checklist_templates')
      .select('id, make, model, name, is_global')
      .eq('id', template_id)
      .maybeSingle()
    if (error) return { data: null, error, generic: false }
    if (data) return { data, error: null, generic: false, shopOwned: !data.is_global }
    // Selected template vanished (deleted) — fall through to the standard library.
  }

  // 1. Model-specific global match (e.g. Beech A36).
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
  // Listings and records-onboarding are capture-only — no checklist to instantiate.
  if (inspection.mode === 'listing' || inspection.mode === 'records')
    return { data: [], error: null, templateMatched: null, generic: false }
  const existing = await listInspectionItems(inspection.id)
  if (existing.error) return { data: [], error: existing.error, templateMatched: null, generic: false }
  if (existing.data.length > 0) return { data: existing.data, error: null, templateMatched: null, generic: false }
  return instantiateTemplate(inspection)
}

/**
 * Copy the resolved template's items into `inspection_items` (with multi-engine
 * fan-out), then return the full item list. Assumes template-derived items don't
 * already exist. Returns { data: items, error, templateMatched, generic }.
 */
async function instantiateTemplate(inspection) {
  const { data: template, error: tErr, generic } = await findTemplateFor({
    vertical: inspection.vertical,
    make: inspection.make,
    model: inspection.model,
    template_id: inspection.attributes?.template_id,
  })
  if (tErr) return { data: [], error: tErr, templateMatched: null, generic: false }
  if (!template) {
    const reload = await listInspectionItems(inspection.id)
    return { data: reload.data, error: reload.error, templateMatched: false, generic: false }
  }

  const { data: tItems, error: tiErr } = await supabase
    .from('template_items')
    .select('id, category, title, description, sort_order, risk_weight, est_cost_low, est_cost_high, ata_chapter, phase')
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
  if (rows.length > 0) {
    const { error: insErr } = await supabase.from('inspection_items').insert(rows)
    if (insErr) return { data: [], error: insErr, templateMatched: true, generic }
  }

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
export async function addCustomItem(inspection, { category, title, description, risk_weight, owner_priority = false, phase = null }) {
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
      phase: [1, 2].includes(Number(phase)) ? Number(phase) : null,
      status: 'pending',
    })
    .select('id, template_item_id, category, title, description, sort_order, risk_weight, owner_priority, status, severity, findings, transcript, phase')
    .single()
  return { data, error }
}

/** Delete an inspection item (used for custom, non-template items). */
export async function deleteInspectionItem(id) {
  const { error } = await supabase.from('inspection_items').delete().eq('id', id)
  return { error }
}

/**
 * Switch which checklist an inspection uses. `templateId` = a shop template's id, or
 * null to go back to the standard library. Only allowed before any item has been
 * worked (all still 'pending'), since it re-instantiates from scratch: it clears the
 * existing template-derived items, records the choice on `attributes.template_id`,
 * and rebuilds. Custom (owner-added) items are preserved. Returns { data: items,
 * error, generic }.
 */
export async function setInspectionChecklist(inspection, templateId) {
  const existing = await listInspectionItems(inspection.id)
  if (existing.error) return { data: [], error: existing.error }
  const worked = existing.data.filter((i) => i.template_item_id).some((i) => i.status && i.status !== 'pending')
  if (worked) {
    return { data: existing.data, error: new Error('This inspection already has worked items — clear them before switching checklists.') }
  }

  // Persist the choice (null removes the key → standard library).
  const attributes = { ...(inspection.attributes ?? {}) }
  if (templateId) attributes.template_id = templateId
  else delete attributes.template_id
  const { error: uErr } = await supabase.from('inspections').update({ attributes }).eq('id', inspection.id)
  if (uErr) return { data: existing.data, error: uErr }

  // Drop only template-derived items (keep custom ones); then re-instantiate.
  const toDrop = existing.data.filter((i) => i.template_item_id).map((i) => i.id)
  if (toDrop.length) {
    const { error: dErr } = await supabase.from('inspection_items').delete().in('id', toDrop)
    if (dErr) return { data: existing.data, error: dErr }
  }
  return instantiateTemplate({ ...inspection, attributes })
}
