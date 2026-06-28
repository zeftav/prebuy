// research-asset — draft an asset's profile (spec sheet) from year/make/model
// using Claude + web search. The client sends the vertical's profile field defs
// (keys + labels) so we can shape a structured-output schema that fills OUR exact
// keys; Claude searches the web for the model's published/typical specs and
// returns a DRAFT for human review (typical-for-the-model, not this specific unit)
// plus a guessed model, confidence, and sources.
//
// JWT: ON (deploy with Verify JWT ON). Logged-in action, spends Anthropic credits.
// Secret: reuses ANTHROPIC_API_KEY.
// Model: claude-opus-4-8 with the web_search_20260209 server tool (dynamic
// filtering, no beta header) + structured outputs (output_config.format).

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

// Fire-and-forget AI usage log (cost attribution). Never throws.
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

type Field = { key?: unknown; label?: unknown }
// Safe, deduped field-key list (our own keys; sanitize defensively for the schema).
function keysOf(fields: unknown): string[] {
  if (!Array.isArray(fields)) return []
  const out: string[] = []
  for (const f of fields as Field[]) {
    const k = String(f?.key ?? '').replace(/[^a-z0-9_]/gi, '')
    if (k && !out.includes(k)) out.push(k)
  }
  return out
}
function labelMap(fields: unknown): string {
  if (!Array.isArray(fields)) return ''
  return (fields as Field[])
    .map((f) => `${String(f?.key ?? '')} = ${String(f?.label ?? '')}`)
    .filter((s) => s.trim() !== ' = ')
    .join('; ')
}
const strProps = (keys: string[]) => Object.fromEntries(keys.map((k) => [k, { type: 'string' }]))
const equipItem = {
  type: 'object',
  additionalProperties: false,
  properties: { name: { type: 'string' }, notes: { type: 'string' } },
  required: ['name', 'notes'],
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return json({ error: 'AI is not configured.' }, 500)

  let payload: Record<string, unknown>
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid request body.' }, 400)
  }

  const orgId = String(payload.org_id ?? '')
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  const asset = (payload.asset && typeof payload.asset === 'object' ? payload.asset : {}) as Record<string, unknown>
  const noun = String(asset.noun || 'asset')
  const year = asset.year ? String(asset.year) : ''
  const make = String(asset.make || '')
  const model = String(asset.model || '')
  const identifier = String(asset.identifier || '')
  const descriptor = [year, make, model].filter(Boolean).join(' ').trim()
  if (!descriptor && !identifier) return json({ error: 'Need a make/model or identifier to research.' }, 400)

  const specKeys = keysOf(payload.spec_fields)
  const curKeys = keysOf(payload.currency_fields)
  const hasEngines = payload.has_engines === true
  const engKeys = keysOf(payload.engine_fields)
  const propKeys = keysOf(payload.prop_fields)
  if (!specKeys.length) return json({ error: 'No fields to research.' }, 400)

  // Build the structured-output schema to fill exactly our keys (all strings).
  const props: Record<string, unknown> = {
    model_guess: { type: 'string' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    summary: { type: 'string' },
    specs: { type: 'object', additionalProperties: false, properties: strProps(specKeys), required: specKeys },
    equipment: {
      type: 'object',
      additionalProperties: false,
      properties: { avionics: { type: 'array', items: equipItem }, additional: { type: 'array', items: equipItem } },
      required: ['avionics', 'additional'],
    },
    sources: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, properties: { title: { type: 'string' }, url: { type: 'string' } }, required: ['title', 'url'] },
    },
  }
  const required = ['model_guess', 'confidence', 'summary', 'specs', 'equipment', 'sources']
  if (curKeys.length) {
    props.currency = { type: 'object', additionalProperties: false, properties: strProps(curKeys), required: curKeys }
    required.push('currency')
  }
  if (hasEngines && engKeys.length) {
    props.engines = { type: 'array', items: { type: 'object', additionalProperties: false, properties: strProps(engKeys), required: engKeys } }
    props.props = { type: 'array', items: { type: 'object', additionalProperties: false, properties: strProps(propKeys.length ? propKeys : ['notes']), required: propKeys.length ? propKeys : ['notes'] } }
    required.push('engines', 'props')
  }
  const SCHEMA = { type: 'object', additionalProperties: false, properties: props, required }

  const fieldGuide = [
    `Specifications fields (key = meaning): ${labelMap(payload.spec_fields)}`,
    curKeys.length ? `Currency/compliance fields: ${labelMap(payload.currency_fields)}` : '',
    hasEngines ? `Engine fields per engine: ${labelMap(payload.engine_fields)}; propeller fields: ${labelMap(payload.prop_fields)}` : '',
  ].filter(Boolean).join('\n')

  const anthropic = new Anthropic({ apiKey })
  const userText =
    `Research the typical published specifications for this ${noun}: ${descriptor || identifier}.` +
    (identifier ? ` Identifier: ${identifier}.` : '') +
    `\n\nUse web search to find the model's spec sheet / brochure / a reputable listing, AND draw on your ` +
    `own knowledge of this model. FILL EVERY field below for which a typical value exists for this ` +
    `make/model/year — these are typical-for-the-model figures the user will verify against the actual ` +
    `${noun}, so prefer giving a typical value over leaving it blank. Use a plain number for numeric ` +
    `fields (no units). Leave a field blank ("") ONLY when there is genuinely no standard value for the ` +
    `model. For engines/props, return one entry per engine the model typically has. Equipment: list the ` +
    `standard/notable factory equipment grouped as avionics (electronics/nav) and additional (everything ` +
    `else). Write a neutral 2-3 sentence summary of the model. Set model_guess to the model you identified ` +
    `and confidence accordingly. List the sources you used (may be empty if you relied on known specs).` +
    `\n\nWork efficiently: answer mainly from your knowledge of this model and use web search only briefly ` +
    `(a couple of queries at most) to confirm or fill gaps — do not over-search.` +
    `\n\nFields:\n${fieldGuide}`

  try {
    // The web_search server tool may yield stop_reason "pause_turn"; resume by
    // re-sending the accumulated turn until we get a final answer.
    const messages: { role: 'user' | 'assistant'; content: unknown }[] = [{ role: 'user', content: userText }]
    let message
    for (let i = 0; i < 4; i++) {
      message = await anthropic.messages.create({
        model: 'claude-opus-4-8',
        max_tokens: 4096,
        system:
          'You research published specifications for high-value assets (aircraft, boats, vehicles, homes). ' +
          'Fill in the model’s TYPICAL published specifications using web search and your own knowledge of ' +
          'the model. These are starting-point, typical-for-the-model figures the user will verify against the ' +
          'actual asset, so prefer giving a typical value over leaving a field blank. Only leave a field blank ' +
          'when the model has no standard value for it; do not fabricate implausible numbers, and never present ' +
          'a value as specific to this exact unit.',
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 }],
        // Low effort keeps this fast — it's structured extraction, not deep reasoning.
        output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
        messages: messages as never,
      })
      if (message.stop_reason !== 'pause_turn') break
      messages.push({ role: 'assistant', content: message.content })
    }

    const text = message?.content?.find((b: { type: string }) => b.type === 'text')?.text ?? ''
    let result
    try {
      result = JSON.parse(text)
    } catch {
      return json({ error: 'Could not research this one — try adding the make/model and retry.' }, 502)
    }

    await logAiUsage('research-asset', 'claude-opus-4-8', message?.usage, orgId, jwt)
    return json(result)
  } catch (e) {
    const status = (e as { status?: number })?.status
    if (status === 429) return json({ error: 'AI is busy — try again in a moment.' }, 429)
    return json({ error: 'Research request failed.' }, 502)
  }
})
