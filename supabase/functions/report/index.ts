// report — two jobs, one function:
//   • SERVE  { token }                      → public customer report (JWT OFF).
//   • PUBLISH { action:'publish', inspection_id, note? } + Bearer JWT
//                                            → freeze a revision SNAPSHOT.
//
// The public report is served HERE (service role), never via anon RLS (see
// 001_init.sql header). Publishing freezes a snapshot (report_revisions); the share
// link serves the LATEST published revision, so edits made after publishing stay in
// draft until the next revision is published. Media are stored in the snapshot as
// storage PATHS and signed fresh per request (signed URLs are short-lived).
//
// Deploy with Verify JWT OFF — the publish action self-verifies the Bearer token.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const BUCKET = 'inspection-media'

// deno-lint-ignore no-explicit-any
type Admin = any

// Assemble the report payload from live data, with media as storage PATHS (not
// signed URLs) so it can be stored in a snapshot. Shape matches what ReportView
// expects, except media entries carry `path` instead of `url` (signPayload fills url).
async function assemble(admin: Admin, insp: Record<string, unknown>) {
  const inspId = insp.id as string
  const [{ data: org }, { data: items }, { data: media }, { data: events }, { data: followups }] = await Promise.all([
    admin.from('orgs').select('name').eq('id', insp.org_id).maybeSingle(),
    admin.from('inspection_items').select('id, category, title, description, status, severity, findings, risk_weight, owner_priority, sort_order').eq('inspection_id', inspId),
    admin.from('media').select('storage_path, kind, purpose, caption, inspection_item_id, show_on_report').eq('inspection_id', inspId),
    admin.from('logbook_events').select('event_date, tach, category, title, description, position').eq('inspection_id', inspId),
    admin.from('inspection_followups').select('note, reason, status, created_at').eq('inspection_id', inspId).eq('show_on_report', true).neq('status', 'dismissed'),
  ])

  const overview = (media ?? [])
    .filter((m: Record<string, unknown>) => m.purpose === 'overview')
    .map((m: Record<string, unknown>) => ({ caption: m.caption, path: m.storage_path, kind: m.kind }))

  const documents = (media ?? [])
    .filter((m: Record<string, unknown>) => m.purpose === 'logbook_pdf' && m.show_on_report)
    .map((m: Record<string, unknown>) => ({ name: m.caption || 'Document', path: m.storage_path }))

  const photosByItem = new Map<string, { path: string; kind: string }[]>()
  const filesByItem = new Map<string, { path: string; name: string }[]>()
  for (const m of media ?? []) {
    if (!m.inspection_item_id) continue
    if (m.purpose === 'discrepancy' && m.kind !== 'document') {
      const arr = photosByItem.get(m.inspection_item_id) ?? []
      arr.push({ path: m.storage_path, kind: m.kind })
      photosByItem.set(m.inspection_item_id, arr)
    } else if (m.purpose === 'attachment') {
      const arr = filesByItem.get(m.inspection_item_id) ?? []
      arr.push({ path: m.storage_path, name: m.caption || 'Attachment' })
      filesByItem.set(m.inspection_item_id, arr)
    }
  }

  const attrs = (insp.attributes ?? {}) as Record<string, unknown>
  return {
    shop: { name: org?.name ?? 'Inspection shop' },
    inspection: {
      identifier: insp.identifier, make: insp.make, model: insp.model, year: insp.year,
      vertical: insp.vertical, mode: insp.mode ?? 'inspection', serial: attrs?.serial ?? null,
      customer_name: insp.customer_name, inspector_name: insp.inspector_name, location: insp.location,
      inspection_date: insp.inspection_date, published_at: insp.published_at,
      profile: attrs?.profile ?? null, gear_rigging: attrs?.gear_rigging ?? null, compliance: attrs?.compliance ?? null,
      // Per-item compression-test readings, keyed by inspection_item id.
      compression: attrs?.compression ?? null,
    },
    items: (items ?? []).map((i: Record<string, unknown>) => ({
      id: i.id, category: i.category, title: i.title, description: i.description, status: i.status,
      severity: i.severity, findings: i.findings, risk_weight: i.risk_weight, owner_priority: i.owner_priority,
      sort_order: i.sort_order, photos: photosByItem.get(i.id as string) ?? [], attachments: filesByItem.get(i.id as string) ?? [],
    })),
    events: (events ?? [])
      .map((e: Record<string, unknown>) => ({ event_date: e.event_date, tach: e.tach, category: e.category, title: e.title, description: e.description, position: e.position ?? null }))
      .sort((a: { event_date: unknown }, b: { event_date: unknown }) => String(b.event_date ?? '').localeCompare(String(a.event_date ?? ''))),
    overview,
    documents,
    followups: (followups ?? []).map((f: Record<string, unknown>) => ({ note: f.note, reason: f.reason, status: f.status })),
  }
}

// Replace every media `path` in a payload/snapshot with a fresh signed url.
async function signPayload(admin: Admin, payload: Record<string, unknown>) {
  const paths: string[] = []
  const collect = (m: { path?: string }) => { if (m?.path) paths.push(m.path) }
  ;(payload.overview as { path?: string }[] ?? []).forEach(collect)
  ;(payload.documents as { path?: string }[] ?? []).forEach(collect)
  ;(payload.items as { photos?: { path?: string }[]; attachments?: { path?: string }[] }[] ?? []).forEach((i) => {
    (i.photos ?? []).forEach(collect); (i.attachments ?? []).forEach(collect)
  })
  let urlByPath = new Map<string, string>()
  if (paths.length) {
    const { data: signed } = await admin.storage.from(BUCKET).createSignedUrls(paths, 3600)
    urlByPath = new Map((signed ?? []).map((s: { path: string; signedUrl: string }) => [s.path, s.signedUrl]))
  }
  const sign = (m: { path?: string }) => {
    const { path, ...rest } = m
    return { ...rest, url: (path && urlByPath.get(path)) || null }
  }
  return {
    ...payload,
    overview: (payload.overview as { path?: string }[] ?? []).map(sign),
    documents: (payload.documents as { path?: string }[] ?? []).map(sign).filter((d: { url: string | null }) => d.url),
    items: (payload.items as { photos?: { path?: string }[]; attachments?: { path?: string }[] }[] ?? []).map((i) => ({
      ...i,
      photos: (i.photos ?? []).map(sign).filter((p: { url: string | null }) => p.url),
      attachments: (i.attachments ?? []).map(sign).filter((a: { url: string | null }) => a.url),
    })),
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) return json({ error: 'Server is misconfigured.' }, 500)
  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

  let payload: { token?: unknown; action?: unknown; inspection_id?: unknown; note?: unknown }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid request body.' }, 400)
  }

  // ── PUBLISH a revision (authenticated) ─────────────────────────────────────
  if (payload.action === 'publish') {
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
    const { data: userData } = await admin.auth.getUser(jwt)
    const user = userData?.user
    if (!user) return json({ error: 'Not authorized.' }, 401)

    const inspectionId = String(payload.inspection_id ?? '')
    if (!UUID.test(inspectionId)) return json({ error: 'Inspection not found.' }, 404)
    const { data: insp } = await admin
      .from('inspections')
      .select('id, org_id, vertical, mode, identifier, make, model, year, customer_name, inspector_name, location, inspection_date, attributes, published_at, share_token, current_revision')
      .eq('id', inspectionId)
      .maybeSingle()
    if (!insp) return json({ error: 'Inspection not found.' }, 404)

    // Caller must be a member of the inspection's org.
    const { data: mem } = await admin.from('memberships').select('role').eq('org_id', insp.org_id).eq('user_id', user.id).maybeSingle()
    if (!mem) return json({ error: 'Not authorized.' }, 403)

    const revision = (Number(insp.current_revision) || 0) + 1
    const publishedAt = new Date().toISOString()
    const snapshot = await assemble(admin, { ...insp, published_at: publishedAt })

    const { error: revErr } = await admin.from('report_revisions').insert({
      inspection_id: insp.id, org_id: insp.org_id, revision, snapshot,
      note: typeof payload.note === 'string' && payload.note.trim() ? payload.note.trim().slice(0, 500) : null,
      published_by: user.id, published_at: publishedAt,
    })
    if (revErr) return json({ error: 'Could not save the revision.' }, 500)

    await admin.from('inspections').update({ status: 'published', published_at: publishedAt, current_revision: revision }).eq('id', insp.id)
    return json({ revision, published_at: publishedAt, share_token: insp.share_token })
  }

  // ── SERVE the public report by share token ─────────────────────────────────
  const token = String(payload.token ?? '')
  if (!UUID.test(token)) return json({ error: 'Report not found.' }, 404)

  const { data: insp } = await admin
    .from('inspections')
    .select('id, org_id, vertical, mode, identifier, make, model, year, customer_name, inspector_name, location, inspection_date, attributes, published_at, status')
    .eq('share_token', token)
    .maybeSingle()
  if (!insp || insp.status !== 'published') return json({ error: 'Report not found.' }, 404)

  // Prefer the latest frozen revision; fall back to live assembly for legacy
  // inspections published before revisions existed.
  const { data: rev } = await admin
    .from('report_revisions')
    .select('revision, snapshot, published_at')
    .eq('inspection_id', insp.id)
    .order('revision', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (rev?.snapshot) {
    const signed = await signPayload(admin, rev.snapshot as Record<string, unknown>)
    return json({ ...signed, revision: rev.revision, published_at: rev.published_at })
  }
  const live = await signPayload(admin, await assemble(admin, insp))
  return json({ ...live, revision: null })
})
