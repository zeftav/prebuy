// claim-listing — cross-org broker handoff. Given a handoff token, an authenticated
// user can PREVIEW a broker's listing and then CLAIM it into one of their own shops,
// which copies the listing into that org as a full pre-purchase inspection —
// including the Storage objects (photos/scans), logbooks and events. The copy is
// cross-org, so it must run with the service role (RLS would otherwise block reading
// the broker's data / writing the claimer's).
//
// JWT: ON (deploy with Verify JWT ON) — only signed-in users can preview/claim, and
// we verify the caller actually belongs to the target org before copying.
//
// Actions (POST body):
//   { token, action: 'preview' }              → listing summary + originating shop
//   { token, action: 'claim', org_id }        → copy into org_id; returns inspection_id

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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) return json({ error: 'Server is misconfigured.' }, 500)
  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

  // Identify the caller from their JWT (gateway already verified it).
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  const { data: userData } = await admin.auth.getUser(jwt)
  const user = userData?.user
  if (!user) return json({ error: 'You must be signed in.' }, 401)

  let payload: { token?: unknown; action?: unknown; org_id?: unknown }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid request body.' }, 400)
  }
  const token = String(payload.token ?? '')
  const action = String(payload.action ?? 'preview')
  if (!UUID.test(token)) return json({ error: 'Invalid handoff link.' }, 404)

  // Load the handoff + its listing.
  const { data: handoff } = await admin
    .from('handoffs')
    .select('id, listing_id, from_org_id, status, to_shop_name')
    .eq('token', token)
    .maybeSingle()
  if (!handoff) return json({ error: 'This handoff link is invalid.' }, 404)

  const { data: listing } = await admin
    .from('inspections')
    .select('id, org_id, vertical, identifier, make, model, year, attributes, customer_name, customer_email, inspector_name, location, inspection_date')
    .eq('id', handoff.listing_id)
    .maybeSingle()
  if (!listing) return json({ error: 'The listing no longer exists.' }, 404)

  const { data: fromOrg } = await admin.from('orgs').select('name').eq('id', handoff.from_org_id).maybeSingle()

  if (action === 'preview') {
    const profile = (listing.attributes as { profile?: unknown } | null)?.profile ?? null
    return json({
      status: handoff.status,
      from_shop: fromOrg?.name ?? 'A broker',
      asset: [listing.year, listing.make, listing.model].filter(Boolean).join(' '),
      identifier: listing.identifier,
      vertical: listing.vertical,
      has_profile: !!profile,
    })
  }

  if (action !== 'claim') return json({ error: 'Unknown action.' }, 400)
  if (handoff.status !== 'pending') return json({ error: 'This handoff has already been claimed or revoked.' }, 409)

  const orgId = String(payload.org_id ?? '')
  if (!UUID.test(orgId)) return json({ error: 'Choose a shop to claim into.' }, 400)

  // The caller must belong to the target org.
  const { data: membership } = await admin
    .from('memberships')
    .select('id')
    .eq('user_id', user.id)
    .eq('org_id', orgId)
    .maybeSingle()
  if (!membership) return json({ error: 'You are not a member of that shop.' }, 403)

  // 1. Create the inspection in the target org.
  const { data: created, error: insErr } = await admin
    .from('inspections')
    .insert({
      org_id: orgId,
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
      created_by: user.id,
    })
    .select('id')
    .single()
  if (insErr || !created) return json({ error: 'Could not create the inspection.' }, 500)
  const newId = created.id

  // 2. Copy media — Storage objects (cross-org path) + rows.
  const { data: media } = await admin
    .from('media')
    .select('storage_path, kind, purpose, caption')
    .eq('inspection_id', listing.id)
  for (const m of media ?? []) {
    const file = String(m.storage_path).split('/').slice(2).join('/') || String(m.storage_path)
    const newPath = `${orgId}/${newId}/${file}`
    const { error: copyErr } = await admin.storage.from(BUCKET).copy(m.storage_path, newPath)
    if (copyErr) continue // skip a missing/failed object rather than abort the whole claim
    await admin.from('media').insert({
      org_id: orgId,
      inspection_id: newId,
      inspection_item_id: null,
      storage_path: newPath,
      kind: m.kind,
      purpose: m.purpose,
      caption: m.caption,
    })
  }

  // 3. Copy logbooks + events.
  const { data: books } = await admin
    .from('logbooks')
    .select('kind, position, label, start_date, start_tach, end_date, end_tach, sort_order, notes')
    .eq('inspection_id', listing.id)
  if (books?.length) {
    await admin.from('logbooks').insert(books.map((b) => ({ ...b, inspection_id: newId, org_id: orgId })))
  }
  const { data: events } = await admin
    .from('logbook_events')
    .select('category, title, position, event_date, tach, description')
    .eq('inspection_id', listing.id)
  if (events?.length) {
    await admin.from('logbook_events').insert(events.map((e) => ({ ...e, inspection_id: newId, org_id: orgId })))
  }

  // 4. Mark the handoff claimed.
  await admin
    .from('handoffs')
    .update({ status: 'claimed', claimed_org_id: orgId, claimed_inspection_id: newId, claimed_at: new Date().toISOString() })
    .eq('id', handoff.id)

  return json({ inspection_id: newId })
})
