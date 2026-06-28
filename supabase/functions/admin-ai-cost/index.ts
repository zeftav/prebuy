// admin-ai-cost — platform-owner view of Anthropic spend, aggregated from the
// ai_usage log (written fire-and-forget by the AI edge fns). Cross-tenant read →
// service role + super-admin re-check, same gate as admin-orgs.
//
// JWT: ON (deploy with Verify JWT ON). Caller must be a super admin.
//
// Action (POST body): { action: 'summary', days? }  (days defaults to 30)
//
// Rates are ESTIMATES for internal cost tracking, in USD per 1M tokens. Adjust the
// RATES map if Anthropic pricing changes (a DB-backed editable rate table can come
// later — see docs/backlog.md). Unknown models fall back to DEFAULT_RATE.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPER_ADMINS = ['brett@zeftingaviation.com']

// USD per 1,000,000 tokens. Estimates — tune to your actual contracted rates.
const RATES: Record<string, { input: number; output: number }> = {
  'claude-opus-4-8': { input: 15, output: 75 },
}
const DEFAULT_RATE = { input: 15, output: 75 }

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })
}
const isFounder = (email: string) => SUPER_ADMINS.includes(email.toLowerCase())
function costUsd(model: string, input: number, output: number) {
  const r = RATES[model] ?? DEFAULT_RATE
  return (input / 1_000_000) * r.input + (output / 1_000_000) * r.output
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) return json({ error: 'Server is misconfigured.' }, 500)
  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

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

  let payload: Record<string, unknown> = {}
  try {
    payload = await req.json()
  } catch {
    // body optional
  }
  const days = Math.max(1, Math.min(365, Number(payload.days) || 30))
  const sinceIso = new Date(Date.now() - days * 86400000).toISOString()

  // Pull the window's usage + org names for attribution.
  const [{ data: usage }, { data: orgs }] = await Promise.all([
    admin.from('ai_usage').select('org_id, function_name, model, input_tokens, output_tokens, created_at').gte('created_at', sinceIso),
    admin.from('orgs').select('id, name'),
  ])
  const orgName = new Map<string, string>((orgs ?? []).map((o) => [o.id, o.name]))

  const byFn = new Map<string, { calls: number; input: number; output: number; cost: number }>()
  const byOrg = new Map<string, { calls: number; input: number; output: number; cost: number }>()
  const byDay = new Map<string, number>()
  let totalCalls = 0, totalInput = 0, totalOutput = 0, totalCost = 0

  for (const u of usage ?? []) {
    const cost = costUsd(String(u.model ?? ''), u.input_tokens ?? 0, u.output_tokens ?? 0)
    totalCalls += 1
    totalInput += u.input_tokens ?? 0
    totalOutput += u.output_tokens ?? 0
    totalCost += cost

    const fn = String(u.function_name ?? 'unknown')
    const f = byFn.get(fn) ?? { calls: 0, input: 0, output: 0, cost: 0 }
    f.calls += 1; f.input += u.input_tokens ?? 0; f.output += u.output_tokens ?? 0; f.cost += cost
    byFn.set(fn, f)

    const key = u.org_id ? String(u.org_id) : '__none__'
    const o = byOrg.get(key) ?? { calls: 0, input: 0, output: 0, cost: 0 }
    o.calls += 1; o.input += u.input_tokens ?? 0; o.output += u.output_tokens ?? 0; o.cost += cost
    byOrg.set(key, o)

    const day = String(u.created_at).slice(0, 10)
    byDay.set(day, (byDay.get(day) ?? 0) + cost)
  }

  const fnRows = [...byFn.entries()].map(([fn, v]) => ({ function_name: fn, ...v })).sort((a, b) => b.cost - a.cost)
  const orgRows = [...byOrg.entries()]
    .map(([id, v]) => ({ org_id: id === '__none__' ? null : id, name: id === '__none__' ? 'Unattributed' : (orgName.get(id) ?? 'Unknown shop'), ...v }))
    .sort((a, b) => b.cost - a.cost)
  const dayRows = [...byDay.entries()].map(([date, cost]) => ({ date, cost })).sort((a, b) => a.date.localeCompare(b.date))

  return json({
    days,
    totals: { calls: totalCalls, input_tokens: totalInput, output_tokens: totalOutput, cost: totalCost },
    by_function: fnRows,
    by_org: orgRows,
    by_day: dayRows,
    rates: RATES,
  })
})
