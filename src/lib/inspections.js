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
      customer_name: clean(draft.customerName),
      customer_email: clean(draft.customerEmail),
    },
  }
}

/** Create a draft inspection in an org. `userId` (optional) records who created it. */
export async function createInspection(orgId, draft, userId) {
  if (!orgId) return { data: null, error: new Error('No shop selected.') }
  const v = validateInspectionDraft(draft)
  if (!v.valid) return { data: null, error: new Error(v.error) }

  const row = { org_id: orgId, status: 'draft', ...v.value }
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
