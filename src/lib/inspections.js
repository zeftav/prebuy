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
      mode: draft.mode === 'listing' ? 'listing' : 'inspection',
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
    .select('id, vertical, mode, identifier, make, model, customer_name, status, created_at')
    .single()
  return { data, error }
}

/** List an org's inspections, newest first. */
export async function listInspectionsForOrg(orgId) {
  if (!orgId) return { data: [], error: null }
  const { data, error } = await supabase
    .from('inspections')
    .select('id, vertical, mode, identifier, make, model, customer_name, status, created_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
  return { data: data ?? [], error }
}

/**
 * Handoff: start a full inspection from a broker listing (same org). Copies the
 * aircraft profile (attributes) + provenance, and clones the listing's overview
 * media, logbooks and events to the new inspection (same org → media rows can
 * reuse the storage paths). Returns { data: { id }, error }. Cross-org transfer
 * (a different shop) is a separate flow — see docs/backlog.md.
 */
export async function startInspectionFromListing(listing, userId) {
  if (!listing?.id) return { data: null, error: new Error('No listing to convert.') }
  const row = {
    org_id: listing.org_id,
    status: 'draft',
    mode: 'inspection',
    source_inspection_id: listing.id,
    vertical: listing.vertical,
    identifier: listing.identifier,
    make: listing.make,
    model: listing.model,
    year: listing.year,
    attributes: listing.attributes ?? {},
    customer_name: listing.customer_name,
    customer_email: listing.customer_email,
    inspector_name: listing.inspector_name,
    location: listing.location,
    inspection_date: listing.inspection_date,
  }
  if (userId) row.created_by = userId

  const { data: created, error } = await supabase.from('inspections').insert(row).select('id').single()
  if (error) return { data: null, error }
  const newId = created.id

  // Clone media (overview shots / attachments), logbooks and events. Same org, so
  // media rows can point at the existing storage objects (no file copy needed).
  const [{ data: mediaRows }, { data: books }, { data: events }] = await Promise.all([
    supabase.from('media').select('storage_path, kind, purpose, caption').eq('inspection_id', listing.id),
    supabase.from('logbooks').select('kind, position, label, start_date, start_tach, end_date, end_tach, sort_order, notes').eq('inspection_id', listing.id),
    supabase.from('logbook_events').select('category, title, position, event_date, tach, description').eq('inspection_id', listing.id),
  ])
  if (mediaRows?.length) {
    await supabase.from('media').insert(mediaRows.map((m) => ({ ...m, inspection_id: newId, org_id: listing.org_id, inspection_item_id: null })))
  }
  if (books?.length) {
    await supabase.from('logbooks').insert(books.map((b) => ({ ...b, inspection_id: newId, org_id: listing.org_id })))
  }
  if (events?.length) {
    await supabase.from('logbook_events').insert(events.map((e) => ({ ...e, inspection_id: newId, org_id: listing.org_id })))
  }
  return { data: { id: newId }, error: null }
}
