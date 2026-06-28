// structure-walkaround — turn a mechanic's continuous walk-around dictation into
// discrete, mapped findings. The mechanic talks through the whole inspection in
// one pass ("…left main tire worn to the cords, nose strut a little low, small oil
// weep at the left valve cover, prop looks good, right brake disc has a lip…") and
// this splits the monologue into individual findings, maps each to the right
// checklist item (or proposes a new custom item), and writes a clean, customer-
// facing note + status/severity for each.
//
// Sibling to `structure-finding` (one note) — this does MANY findings + mapping.
//
// JWT: ON (deploy with Verify JWT ON). Logged-in action, spends Anthropic credits.
// Secret: reuses ANTHROPIC_API_KEY.
// Model: claude-opus-4-8 with structured outputs (output_config.format) so the
// response is validated JSON we can apply directly — no brittle parsing.

import Anthropic from 'npm:@anthropic-ai/sdk'
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

// Fire-and-forget AI usage log (cost attribution for the super-admin dashboard).
// Never throws — logging must not break the actual response.
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
    // swallow — usage logging is best-effort
  }
}

// One parsed finding. item_id is "" for an unmatched observation (→ a new custom
// item, described by suggested_category/title); otherwise it's an existing item id.
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          item_id: {
            type: 'string',
            description: 'The id of the matching checklist item from the provided list, or "" if no item matches (a new custom item will be proposed).',
          },
          suggested_category: {
            type: 'string',
            description: 'For an unmatched finding (item_id ""), the category for a new custom item (e.g. "Brakes"). Empty when matched.',
          },
          suggested_title: {
            type: 'string',
            description: 'For an unmatched finding (item_id ""), a short title for the new custom item. Empty when matched.',
          },
          status: {
            type: 'string',
            enum: ['ok', 'monitor', 'discrepancy'],
            description: 'ok = no problem noted; monitor = minor/watch; discrepancy = a defect needing attention.',
          },
          severity: {
            type: 'integer',
            description: 'Estimated severity 0-100: 0 = cosmetic/none, ~40 = monitor, ~70+ = significant.',
          },
          finding: {
            type: 'string',
            description: 'A concise, professional, customer-facing note for this observation. Factual; no fabrication beyond what was said.',
          },
          confidence: {
            type: 'string',
            enum: ['high', 'medium', 'low'],
            description: 'Confidence that this observation was correctly understood AND mapped to the right item.',
          },
        },
        required: ['item_id', 'suggested_category', 'suggested_title', 'status', 'severity', 'finding', 'confidence'],
      },
    },
  },
  required: ['findings'],
}

type Item = { id?: unknown; category?: unknown; title?: unknown; risk?: unknown }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return json({ error: 'AI is not configured.' }, 500)

  let payload: { transcript?: unknown; items?: unknown; vertical?: unknown; org_id?: unknown }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid request body.' }, 400)
  }
  // Cap very long transcripts defensively (a thorough walk-around is still a few
  // thousand chars; this guards against a runaway/garbage input, not normal use).
  const transcript = String(payload.transcript ?? '').trim().slice(0, 16000)
  if (!transcript) return json({ error: 'Nothing to parse — dictate the walk-around first.' }, 400)

  const noun = String(payload.vertical === 'marine' ? 'boat' : payload.vertical === 'home' ? 'property' : 'aircraft')
  const orgId = String(payload.org_id ?? '')
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')

  // The checklist items are the grounding context for mapping. Keep it compact.
  const items = (Array.isArray(payload.items) ? payload.items : []) as Item[]
  const itemLines = items
    .slice(0, 400)
    .map((it) => `- id=${String(it?.id ?? '')} | ${String(it?.category ?? '')} :: ${String(it?.title ?? '')}${it?.risk ? ` (risk: ${String(it.risk)})` : ''}`)
    .join('\n')

  const anthropic = new Anthropic({ apiKey })

  try {
    const message = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 4096,
      system:
        `You are a ${noun} pre-purchase inspection assistant. A mechanic dictates an entire ` +
        'walk-around in one continuous, informal monologue. Split it into DISCRETE observations — ' +
        'one finding per distinct thing mentioned. For each, map it to the single best-matching ' +
        'checklist item from the list by id; STRONGLY PREFER matching an existing item over creating ' +
        'a new one. Only set item_id to "" when nothing in the list reasonably covers the observation, ' +
        'and then propose a suggested_category and suggested_title for a new custom item. ' +
        'Rewrite each observation as a concise, professional, customer-facing finding (1-2 sentences); ' +
        'be factual and specific, never invent details beyond what was said. Choose status: ok when the ' +
        'mechanic explicitly calls something good/fine, monitor for minor/watch items, discrepancy for ' +
        'defects. Set severity and confidence honestly — use low/medium confidence when the mapping or ' +
        'meaning is uncertain so a human can verify. Do NOT invent observations that were not spoken, and ' +
        'do not emit a finding for an item that was never mentioned.',
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages: [
        {
          role: 'user',
          content:
            `Checklist items (map findings to these by id):\n${itemLines || '(no checklist items yet — propose new items for everything)'}\n\n` +
            `Walk-around dictation:\n${transcript}`,
        },
      ],
    })

    const text = message.content.find((b: { type: string }) => b.type === 'text')?.text ?? ''
    let result
    try {
      result = JSON.parse(text)
    } catch {
      return json({ error: 'Could not parse the walk-around. Try again.' }, 502)
    }
    await logAiUsage('structure-walkaround', 'claude-opus-4-8', message.usage, orgId, jwt)

    // Defensive normalization (schema can't clamp numeric range / enum fallbacks).
    const valid = new Set(items.map((it) => String(it?.id ?? '')))
    const findings = (Array.isArray(result.findings) ? result.findings : []).map((f: Record<string, unknown>) => {
      const rawId = String(f.item_id ?? '')
      const item_id = valid.has(rawId) ? rawId : ''
      return {
        item_id,
        suggested_category: String(f.suggested_category ?? '').trim(),
        suggested_title: String(f.suggested_title ?? '').trim(),
        status: ['ok', 'monitor', 'discrepancy'].includes(f.status as string) ? f.status : 'monitor',
        severity: Math.max(0, Math.min(100, Number(f.severity) || 0)),
        finding: String(f.finding ?? '').trim(),
        confidence: ['high', 'medium', 'low'].includes(f.confidence as string) ? f.confidence : 'medium',
      }
    })
    return json({ findings })
  } catch (e) {
    const status = (e as { status?: number })?.status
    if (status === 429) return json({ error: 'AI is busy — try again in a moment.' }, 429)
    return json({ error: 'AI request failed.' }, 502)
  }
})
