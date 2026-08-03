// parse-checklist — turn an uploaded inspection-checklist PDF (e.g. Savvy's
// Beechcraft prebuy) into structured, phase-tagged items the shop can save as a
// reusable template. Claude reads the PDF directly (document input) and returns
// each line item with its phase (1/2), category (section), title, detail, and an
// estimated financial-risk weight for ordering.
//
// JWT: ON (deploy with Verify JWT ON). Logged-in action, spends Anthropic credits.
// Secret: reuses ANTHROPIC_API_KEY. Model: claude-opus-4-8 + structured output.
//
// The parsed content is returned for HUMAN REVIEW and saved by the client (RLS
// lets a shop own its templates) — we never store the source PDF text here, so a
// shop's licensed checklist stays the shop's.

import Anthropic from 'npm:@anthropic-ai/sdk'
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

async function logAiUsage(fnName: string, model: string, usage: { input_tokens?: number; output_tokens?: number } | undefined, orgId: string, jwt: string) {
  try {
    const url = Deno.env.get('SUPABASE_URL')
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !key) return
    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    let email: string | null = null
    if (jwt) {
      const { data } = await admin.auth.getUser(jwt)
      email = data?.user?.email ?? null
    }
    await admin.from('ai_usage').insert({
      org_id: orgId && UUID.test(orgId) ? orgId : null,
      user_email: email,
      function_name: fnName,
      model,
      input_tokens: usage?.input_tokens ?? 0,
      output_tokens: usage?.output_tokens ?? 0,
    })
  } catch {
    // best-effort
  }
}

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', description: 'A short name for this checklist template, e.g. "Savvy Beechcraft Bonanza Prebuy".' },
    two_phase: { type: 'boolean', description: 'True if the checklist is explicitly divided into Phase 1 and Phase 2.' },
    items: {
      type: 'array',
      description: 'Every line item, IN DOCUMENT ORDER. Include sub-items as their own entries.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          phase: { type: 'integer', description: '1 or 2 for a two-phase checklist; 0 if the checklist has no phases.' },
          number: { type: 'string', description: 'The item number as printed (e.g. "1.2.4"), or "".' },
          category: { type: 'string', description: 'The section heading this item falls under, e.g. "Engine and Propeller", "Landing Gear, Wheels, Brakes".' },
          title: { type: 'string', description: 'A concise action title (a few words), e.g. "Check cylinder compressions hot".' },
          description: { type: 'string', description: 'The remaining instruction detail. "" if the title already says it all.' },
          risk_weight: { type: 'integer', description: 'Estimated financial risk 0-100 if this item is a problem: engine internals / spar / structure / corrosion / landing gear / ADs = 70-95; systems/avionics/fuel = 40-65; cosmetics/placards/paperwork = 10-30.' },
        },
        required: ['phase', 'number', 'category', 'title', 'description', 'risk_weight'],
      },
    },
  },
  required: ['name', 'two_phase', 'items'],
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return json({ error: 'AI is not configured.' }, 500)

  let payload: { pdf_url?: unknown; org_id?: unknown }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid request body.' }, 400)
  }
  const pdfUrl = String(payload.pdf_url ?? '')
  if (!/^https?:\/\//i.test(pdfUrl)) return json({ error: 'No checklist file to read.' }, 400)
  const orgId = String(payload.org_id ?? '')
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')

  const anthropic = new Anthropic({ apiKey })

  try {
    const message = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 8192,
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      system:
        'You convert an aircraft pre-purchase inspection checklist (PDF) into a structured, ordered list ' +
        'of line items for a shop to reuse. Capture EVERY item, in order. If the checklist is divided into ' +
        '"Phase 1" and "Phase 2", tag each item with its phase; otherwise use phase 0. Group items by their ' +
        'section heading (category). Give each a concise action title and keep the detail in description. ' +
        'Estimate a financial-risk weight for ordering. Do not invent items; only extract what is printed.',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'document', source: { type: 'url', url: pdfUrl } },
            { type: 'text', text: 'Extract this checklist into structured, phase-tagged items.' },
          ] as never,
        },
      ],
    })

    const text = message.content.find((b: { type: string }) => b.type === 'text')?.text ?? ''
    let result
    try {
      result = JSON.parse(text)
    } catch {
      return json({ error: 'Could not read the checklist. Try a clearer PDF.' }, 502)
    }
    await logAiUsage('parse-checklist', 'claude-opus-4-8', message.usage, orgId, jwt)

    const items = (Array.isArray(result.items) ? result.items : []).map((it: Record<string, unknown>, i: number) => ({
      phase: [1, 2].includes(Number(it.phase)) ? Number(it.phase) : 0,
      number: String(it.number ?? '').trim(),
      category: String(it.category ?? '').trim() || 'General',
      title: String(it.title ?? '').trim(),
      description: String(it.description ?? '').trim(),
      risk_weight: Math.max(0, Math.min(100, Math.round(Number(it.risk_weight)) || 0)),
      sort_order: i,
    })).filter((it: { title: string }) => it.title)

    return json({ name: String(result.name ?? '').trim() || 'Uploaded checklist', two_phase: !!result.two_phase, items })
  } catch (e) {
    const status = (e as { status?: number })?.status
    if (status === 429) return json({ error: 'AI is busy — try again in a moment.' }, 429)
    return json({ error: 'Could not parse the checklist.' }, 502)
  }
})
