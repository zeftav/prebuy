// Media (photo/video) capture → Supabase Storage + the `media` table.
//
// Files go to a private bucket pathed `<org_id>/<inspection_id>/<file>` (the org
// folder is what the Storage policy checks). The bucket is private, so display
// uses short-lived signed URLs. Pure path/name helpers are split out + tested.

import { supabase } from './supabase.js'

const BUCKET = 'inspection-media'

/** Make a filename safe for a storage key. */
export function sanitizeFilename(name) {
  const base = String(name ?? 'photo').split(/[\\/]/).pop() || 'photo'
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-64) || 'photo'
}

/** Storage object path for a file: `<org>/<inspection>/<file>`. */
export function mediaStoragePath(orgId, inspectionId, filename) {
  return `${orgId}/${inspectionId}/${filename}`
}

/** Derive media kind from a MIME type. */
export function mediaKind(mime) {
  const m = String(mime ?? '')
  if (m.startsWith('video/')) return 'video'
  if (m.startsWith('image/')) return 'photo'
  return 'document' // PDFs, lab reports, etc.
}

function uniqueName(filename) {
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  return `${id}-${sanitizeFilename(filename)}`
}

/**
 * Upload a file and record it. `purpose` is 'overview' | 'discrepancy';
 * `inspectionItemId` is set for discrepancy shots, null for overview.
 */
export async function uploadMedia({ orgId, inspectionId, inspectionItemId = null, file, purpose, caption = null, sortOrder = 0 }) {
  if (!orgId || !inspectionId || !file) {
    return { data: null, error: new Error('Missing upload details.') }
  }
  const path = mediaStoragePath(orgId, inspectionId, uniqueName(file.name))
  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || undefined,
  })
  if (upErr) return { data: null, error: upErr }

  const { data, error } = await supabase
    .from('media')
    .insert({
      inspection_id: inspectionId,
      inspection_item_id: inspectionItemId,
      org_id: orgId,
      storage_path: path,
      kind: mediaKind(file.type),
      purpose,
      caption,
      sort_order: sortOrder,
    })
    .select('id, inspection_item_id, storage_path, kind, purpose, caption, sort_order, rotation, show_on_report, created_at')
    .single()
  if (error) {
    // Orphan cleanup: remove the uploaded object if the row insert failed.
    await supabase.storage.from(BUCKET).remove([path])
    return { data: null, error }
  }
  return { data, error: null }
}

const MEDIA_COLS = 'id, inspection_item_id, storage_path, kind, purpose, caption, sort_order, rotation, show_on_report, created_at'

/** List media for an inspection, with short-lived signed URLs attached. */
export async function listMedia(inspectionId) {
  const { data, error } = await supabase
    .from('media')
    .select(MEDIA_COLS)
    .eq('inspection_id', inspectionId)
    .order('created_at', { ascending: true })
  if (error) return { data: [], error }

  const rows = data ?? []
  if (rows.length === 0) return { data: [], error: null }
  const { data: signed } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(rows.map((r) => r.storage_path), 3600)
  const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]))
  return { data: rows.map((r) => ({ ...r, url: urlByPath.get(r.storage_path) ?? null })), error: null }
}

/**
 * List one purpose's media for an inspection, ordered by sort_order then created,
 * with signed URLs. Used by the logbook page manager (purpose='logbook') and to
 * find the current compiled PDF (purpose='logbook_pdf').
 */
export async function listMediaByPurpose(inspectionId, purpose) {
  const { data, error } = await supabase
    .from('media')
    .select(MEDIA_COLS)
    .eq('inspection_id', inspectionId)
    .eq('purpose', purpose)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (error) return { data: [], error }
  const rows = data ?? []
  if (rows.length === 0) return { data: [], error: null }
  const { data: signed } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(rows.map((r) => r.storage_path), 3600)
  const urlByPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]))
  return { data: rows.map((r) => ({ ...r, url: urlByPath.get(r.storage_path) ?? null })), error: null }
}

/** Patch a media row (rotation / sort_order / show_on_report / caption). */
export async function updateMedia(id, patch) {
  const { data, error } = await supabase
    .from('media')
    .update(patch)
    .eq('id', id)
    .select(MEDIA_COLS)
    .single()
  return { data, error }
}

/** Create short-lived signed URLs for a set of storage paths. */
export async function signedUrlsFor(paths) {
  if (!paths?.length) return []
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600)
  return (data ?? []).map((s) => s.signedUrl).filter(Boolean)
}

/** Delete a media row + its storage object. */
export async function deleteMedia(row) {
  const { error } = await supabase.from('media').delete().eq('id', row.id)
  if (error) return { error }
  await supabase.storage.from(BUCKET).remove([row.storage_path])
  return { error: null }
}

/**
 * Remove ALL Storage objects for an inspection. The `media` rows themselves
 * cascade-delete with the inspection (FK), but the files in the bucket do not —
 * so call this BEFORE deleting the inspection, while the rows are still readable.
 */
export async function removeInspectionStorage(inspectionId) {
  if (!inspectionId) return { removed: 0 }
  const { data } = await supabase.from('media').select('storage_path').eq('inspection_id', inspectionId)
  const paths = (data ?? []).map((r) => r.storage_path).filter(Boolean)
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths)
  return { removed: paths.length }
}
