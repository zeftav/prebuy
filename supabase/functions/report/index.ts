// report — return a published inspection as a customer-facing report, by its
// share token. No login: the public report is served HERE (service role), never
// via anon RLS (see 001_init.sql header). JWT: OFF (deploy with Verify JWT OFF).
//
// Only PUBLISHED inspections are returned; anything else 404s, so a share link
// can't leak a draft. Media URLs are short-lived signed URLs minted per request.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  })
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) return json({ error: 'Server is misconfigured.' }, 500)
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let payload: { token?: unknown }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid request body.' }, 400)
  }
  const token = String(payload.token ?? '')
  if (!UUID.test(token)) return json({ error: 'Report not found.' }, 404)

  // Published inspection only.
  const { data: insp } = await admin
    .from('inspections')
    .select('id, org_id, vertical, mode, identifier, make, model, year, customer_name, inspector_name, location, inspection_date, attributes, published_at, status')
    .eq('share_token', token)
    .maybeSingle()
  if (!insp || insp.status !== 'published') return json({ error: 'Report not found.' }, 404)

  const [{ data: org }, { data: items }, { data: media }, { data: events }] = await Promise.all([
    admin.from('orgs').select('name').eq('id', insp.org_id).maybeSingle(),
    admin
      .from('inspection_items')
      .select('id, category, title, description, status, severity, findings, risk_weight, owner_priority, sort_order')
      .eq('inspection_id', insp.id),
    admin
      .from('media')
      .select('storage_path, kind, purpose, caption, inspection_item_id')
      .eq('inspection_id', insp.id),
    admin
      .from('logbook_events')
      .select('event_date, tach, category, title, description, position')
      .eq('inspection_id', insp.id),
  ])

  // Sign all media URLs in one batch.
  const paths = (media ?? []).map((m) => m.storage_path)
  let urlByPath = new Map<string, string>()
  if (paths.length) {
    const { data: signed } = await admin.storage.from('inspection-media').createSignedUrls(paths, 3600)
    urlByPath = new Map((signed ?? []).map((s: { path: string; signedUrl: string }) => [s.path, s.signedUrl]))
  }
  const withUrl = (m: { storage_path: string }) => urlByPath.get(m.storage_path) ?? null

  const overview = (media ?? [])
    .filter((m) => m.purpose === 'overview')
    .map((m) => ({ caption: m.caption, url: withUrl(m) }))

  const photosByItem = new Map<string, string[]>()
  const filesByItem = new Map<string, { url: string; name: string }[]>()
  for (const m of media ?? []) {
    if (!m.inspection_item_id) continue
    const u = withUrl(m)
    if (!u) continue
    if (m.purpose === 'discrepancy' && m.kind !== 'document') {
      const arr = photosByItem.get(m.inspection_item_id) ?? []
      arr.push(u)
      photosByItem.set(m.inspection_item_id, arr)
    } else if (m.purpose === 'attachment') {
      const arr = filesByItem.get(m.inspection_item_id) ?? []
      arr.push({ url: u, name: m.caption || 'Attachment' })
      filesByItem.set(m.inspection_item_id, arr)
    }
  }

  return json({
    shop: { name: org?.name ?? 'Inspection shop' },
    inspection: {
      identifier: insp.identifier,
      make: insp.make,
      model: insp.model,
      year: insp.year,
      vertical: insp.vertical,
      mode: insp.mode ?? 'inspection',
      serial: insp.attributes?.serial ?? null,
      customer_name: insp.customer_name,
      inspector_name: insp.inspector_name,
      location: insp.location,
      inspection_date: insp.inspection_date,
      published_at: insp.published_at,
      // Spec-sheet ("Aircraft profile") block; null/legacy inspections degrade gracefully.
      profile: insp.attributes?.profile ?? null,
    },
    items: (items ?? []).map((i) => ({
      id: i.id,
      category: i.category,
      title: i.title,
      description: i.description,
      status: i.status,
      severity: i.severity,
      findings: i.findings,
      risk_weight: i.risk_weight,
      owner_priority: i.owner_priority,
      sort_order: i.sort_order,
      photos: photosByItem.get(i.id) ?? [],
      attachments: filesByItem.get(i.id) ?? [],
    })),
    // Dated maintenance chronology (broker-style highlights), newest first.
    events: (events ?? [])
      .map((e) => ({
        event_date: e.event_date,
        tach: e.tach,
        category: e.category,
        title: e.title,
        description: e.description,
        position: e.position ?? null,
      }))
      .sort((a, b) => String(b.event_date ?? '').localeCompare(String(a.event_date ?? ''))),
    overview,
  })
})
