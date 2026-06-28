// admin-orgs — platform-owner ("super admin") view of every shop, plus roster
// management. This is the privileged cross-tenant primitive: it reads across ALL
// orgs (which RLS deliberately forbids), so it runs with the service-role key and
// re-checks super-admin from the JWT before doing anything.
//
// JWT: ON (deploy with Verify JWT ON). Caller must be a super admin (hardcoded
// founder list OR the super_admins table).
//
// Actions (POST body):
//   { action: 'list' }                              → orgs + engagement + totals + roster
//   { action: 'add_super_admin', email }            → add to super_admins (founder locked)
//   { action: 'remove_super_admin', email }         → remove from super_admins (founder locked)
//   { action: 'rename_org', org_id, name }          → rename a shop
//   { action: 'delete_org', org_id }                → cascade-delete a shop + its data
//
// NOTE: no subscription / seat / billing actions — billing isn't built yet. Add
// those alongside Stripe (see docs/backlog.md → Financial).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Hardcoded founder(s): never removable, mirrored in the client AuthProvider.
const SUPER_ADMINS = ['brett@zeftingaviation.com']

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const isFounder = (email: string) => SUPER_ADMINS.includes(email.toLowerCase())

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) return json({ error: 'Server is misconfigured.' }, 500)
  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

  // Identify + authorize the caller (founder list OR super_admins table).
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  const { data: userData } = await admin.auth.getUser(jwt)
  const email = (userData?.user?.email || '').toLowerCase()
  if (!email) return json({ error: 'You must be signed in.' }, 401)
  let isSuper = isFounder(email)
  if (!isSuper) {
    const { data } = await admin.from('super_admins').select('email').ilike('email', email).maybeSingle()
    isSuper = !!data
  }
  if (!isSuper) return json({ error: 'Forbidden' }, 403)

  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid request body.' }, 400)
  }
  const action = String(payload.action ?? 'list')

  // ----- roster management -----
  if (action === 'add_super_admin' || action === 'remove_super_admin') {
    const target = String(payload.email ?? '').trim().toLowerCase()
    if (!target || !target.includes('@')) return json({ error: 'Enter a valid email.' }, 400)
    if (isFounder(target)) return json({ error: 'That account is a permanent founder and can’t be changed here.' }, 400)
    if (action === 'add_super_admin') {
      await admin.from('super_admins').upsert({ email: target, added_by: email }, { onConflict: 'email' })
    } else {
      await admin.from('super_admins').delete().eq('email', target)
    }
    return json({ ok: true })
  }

  // ----- rename a shop -----
  if (action === 'rename_org') {
    const orgId = String(payload.org_id ?? '')
    const name = String(payload.name ?? '').trim()
    if (!UUID.test(orgId)) return json({ error: 'Invalid shop.' }, 400)
    if (!name) return json({ error: 'Enter a name.' }, 400)
    const { error } = await admin.from('orgs').update({ name }).eq('id', orgId)
    if (error) return json({ error: 'Could not rename the shop.' }, 500)
    return json({ ok: true })
  }

  // ----- delete a shop (cascades tenant data via FKs; auth users are left intact) -----
  if (action === 'delete_org') {
    const orgId = String(payload.org_id ?? '')
    if (!UUID.test(orgId)) return json({ error: 'Invalid shop.' }, 400)
    const { error } = await admin.from('orgs').delete().eq('id', orgId)
    if (error) return json({ error: 'Could not delete the shop.' }, 500)
    return json({ ok: true })
  }

  if (action !== 'list') return json({ error: 'Unknown action.' }, 400)

  // ----- list orgs + engagement + totals + roster -----
  const [{ data: orgs }, { data: members }, { data: inspections }, { data: roster }] = await Promise.all([
    admin.from('orgs').select('id, name, slug, vertical, created_at').order('created_at', { ascending: false }),
    admin.from('memberships').select('org_id, user_id, role'),
    admin.from('inspections').select('id, org_id, mode, status, created_at, updated_at'),
    admin.from('super_admins').select('email, added_by, created_at').order('created_at', { ascending: true }),
  ])

  const now = Date.now()
  const DAY = 86400000
  const since30 = now - 30 * DAY

  // Index helpers per org.
  const memberByOrg = new Map<string, { total: number; roles: Record<string, number>; users: Set<string> }>()
  for (const m of members ?? []) {
    const e = memberByOrg.get(m.org_id) ?? { total: 0, roles: {}, users: new Set<string>() }
    e.total += 1
    e.roles[m.role] = (e.roles[m.role] ?? 0) + 1
    e.users.add(m.user_id)
    memberByOrg.set(m.org_id, e)
  }
  const inspByOrg = new Map<string, { total: number; last30: number; listings: number; published: number; lastActive: number }>()
  for (const i of inspections ?? []) {
    const e = inspByOrg.get(i.org_id) ?? { total: 0, last30: 0, listings: 0, published: 0, lastActive: 0 }
    e.total += 1
    const created = Date.parse(i.created_at) || 0
    const updated = Date.parse(i.updated_at) || created
    if (created >= since30) e.last30 += 1
    if (i.mode === 'listing') e.listings += 1
    if (i.status === 'published') e.published += 1
    e.lastActive = Math.max(e.lastActive, updated, created)
    inspByOrg.set(i.org_id, e)
  }

  const orgRows = (orgs ?? []).map((o) => {
    const m = memberByOrg.get(o.id) ?? { total: 0, roles: {}, users: new Set() }
    const ins = inspByOrg.get(o.id) ?? { total: 0, last30: 0, listings: 0, published: 0, lastActive: 0 }
    return {
      id: o.id,
      name: o.name,
      slug: o.slug,
      vertical: o.vertical,
      created_at: o.created_at,
      member_count: m.total,
      roles: m.roles,
      inspection_count: ins.total,
      inspections_30d: ins.last30,
      listing_count: ins.listings,
      published_count: ins.published,
      last_active: ins.lastActive ? new Date(ins.lastActive).toISOString() : null,
    }
  })

  const allUsers = new Set<string>()
  for (const m of members ?? []) allUsers.add(m.user_id)
  const signups30 = (orgs ?? []).filter((o) => (Date.parse(o.created_at) || 0) >= since30).length

  const totals = {
    orgs: orgRows.length,
    users: allUsers.size,
    inspections: (inspections ?? []).length,
    listings: (inspections ?? []).filter((i) => i.mode === 'listing').length,
    published: (inspections ?? []).filter((i) => i.status === 'published').length,
    signups_30d: signups30,
  }

  const founders = SUPER_ADMINS.map((e) => ({ email: e, founder: true }))
  const dbAdmins = (roster ?? [])
    .filter((r) => !isFounder(String(r.email)))
    .map((r) => ({ email: r.email, founder: false, added_by: r.added_by, created_at: r.created_at }))

  return json({ orgs: orgRows, totals, super_admins: [...founders, ...dbAdmins] })
})
