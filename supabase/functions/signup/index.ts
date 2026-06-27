// signup — create a shop (org) + owner membership for the calling user.
//
// JWT: OFF (set "Verify JWT" off when deploying). We do our OWN auth check here:
// the client sends its Supabase access token in the Authorization header, and we
// validate it with the service-role client before writing anything. JWT is off
// (not on) so this same function can later branch into pre-session flows if
// needed, and so the platform gateway never rejects a request before our own
// checks run — the convention for all PreBuy privileged functions.
//
// Why an edge function at all: the client can't insert into `orgs`/`memberships`
// (RLS blocks it — there's no policy for INSERT, by design). The first owner row
// must be written with the service role. See supabase/functions/README.md.
//
// Atomicity: org + owner membership must both exist or neither. supabase-js has
// no multi-statement transaction, so we create the org, then the membership, and
// roll the org back if the membership insert fails.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SHOP_NAME_MIN = 2
const SHOP_NAME_MAX = 60
const VERTICALS = ['aviation', 'marine', 'home', 'automotive']

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

function cleanName(raw: unknown): string {
  return String(raw ?? '').trim().replace(/\s+/g, ' ')
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'Server is misconfigured.' }, 500)
  }
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // --- our own auth check (JWT verification is off at the gateway) ---
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'Missing authorization token.' }, 401)
  const { data: userData, error: userErr } = await admin.auth.getUser(token)
  if (userErr || !userData?.user) return json({ error: 'Invalid or expired session.' }, 401)
  const user = userData.user

  // --- validate input ---
  let payload: { name?: unknown; vertical?: unknown }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid request body.' }, 400)
  }
  const name = cleanName(payload.name)
  if (name.length < SHOP_NAME_MIN || name.length > SHOP_NAME_MAX) {
    return json({ error: `Shop name must be ${SHOP_NAME_MIN}-${SHOP_NAME_MAX} characters.` }, 400)
  }
  // A shop does one vertical; defaults to aviation if unspecified.
  const vertical = VERTICALS.includes(String(payload.vertical)) ? String(payload.vertical) : 'aviation'

  // --- create org (retry slug on collision) ---
  const base = slugify(name) || 'shop'
  let org = null
  for (let attempt = 0; attempt < 5 && !org; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${randomSuffix()}`
    const { data, error } = await admin
      .from('orgs')
      .insert({ name, slug, vertical })
      .select('id, name, slug, vertical')
      .single()
    if (!error) {
      org = data
      break
    }
    // 23505 = unique_violation (slug taken) → try another suffix
    if (error.code !== '23505') {
      return json({ error: 'Could not create shop.' }, 500)
    }
  }
  if (!org) return json({ error: 'Could not create a unique shop address. Try a different name.' }, 409)

  // --- make the caller the owner; roll back the org if this fails ---
  const { error: memErr } = await admin
    .from('memberships')
    .insert({ org_id: org.id, user_id: user.id, role: 'owner' })
  if (memErr) {
    await admin.from('orgs').delete().eq('id', org.id)
    return json({ error: 'Could not finish setting up your shop.' }, 500)
  }

  return json({ org }, 201)
})

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6)
}
