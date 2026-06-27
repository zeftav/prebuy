// Inspections data layer. Reads/writes go through the client under RLS — members
// of an org have full CRUD on that org's inspections (see 001_init.sql
// `inspections_all`). Pure draft validation is split out so it can be tested.

import { supabase } from './supabase.js'
import { validateIdentifier } from './verticals.js'

/**
 * Validate a new-inspection form. Returns { valid, value, error }.
 * `value` is the normalized, insert-ready subset (org/created_by added by caller).
 */
export function validateInspectionDraft(draft) {
  const vertical = draft?.vertical
  if (!vertical) return { valid: false, value: null, error: 'Choose what you’re inspecting.' }

  const id = validateIdentifier(vertical, draft.identifier)
  if (!id.valid) return { valid: false, value: null, error: id.error }

  const clean = (s) => {
    const v = String(s ?? '').trim()
    return v.length ? v : null
  }

  return {
    valid: true,
    error: null,
    value: {
      vertical,
      identifier: id.value,
      make: clean(draft.make),
      model: clean(draft.model),
      year: Number.isFinite(Number(draft.year)) && String(draft.year ?? '').trim() ? Number(draft.year) : null,
      serial: clean(draft.serial), // long-tail facts (serial, etc.) live in attributes
      engine_count: Number.isFinite(Number(draft.engineCount)) && Number(draft.engineCount) > 0 ? Number(draft.engineCount) : null,
      customer_name: clean(draft.customerName),
      customer_email: clean(draft.customerEmail),
      inspector_name: clean(draft.inspectorName),
      location: clean(draft.location),
      inspection_date: draft.inspectionDate || null,
    },
  }
}

/** Update the report-header provenance (who/where/when). */
export async function updateInspectionMeta(id, patch) {
  const clean = (s) => {
    const v = String(s ?? '').trim()
    return v.length ? v : null
  }
  const row = {}
  if ('inspector_name' in patch) row.inspector_name = clean(patch.inspector_name)
  if ('location' in patch) row.location = clean(patch.location)
  if ('inspection_date' in patch) row.inspection_date = patch.inspection_date || null
  const { data, error } = await supabase
    .from('inspections')
    .update(row)
    .eq('id', id)
    .select('id, inspector_name, location, inspection_date')
    .single()
  return { data, error }
}

/** Create a draft inspection in an org. `userId` (optional) records who created it. */
export async function createInspection(orgId, draft, userId) {
  if (!orgId) return { data: null, error: new Error('No shop selected.') }
  const v = validateInspectionDraft(draft)
  if (!v.valid) return { data: null, error: new Error(v.error) }

  const { serial, engine_count, ...cols } = v.value
  const attributes = {}
  if (serial) attributes.serial = serial
  if (engine_count) attributes.engine_count = engine_count
  const row = { org_id: orgId, status: 'draft', attributes, ...cols }
  if (userId) row.created_by = userId

  const { data, error } = await supabase
    .from('inspections')
    .insert(row)
    .select('id, vertical, identifier, make, model, customer_name, status, created_at')
    .single()
  return { data, error }
}

/** List an org's inspections, newest first. */
export async function listInspectionsForOrg(orgId) {
  if (!orgId) return { data: [], error: null }
  const { data, error } = await supabase
    .from('inspections')
    .select('id, vertical, identifier, make, model, customer_name, status, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
  return { data: data ?? [], error }
}
