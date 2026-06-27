// structure-finding — turn a mechanic's raw dictation about an inspection item
// into a clean, customer-facing finding (+ a suggested severity and status).
//
// JWT: ON (deploy with Verify JWT ON). This is a logged-in action and it spends
// our Anthropic credits, so only authenticated users may call it — the gateway
// enforces the JWT; we don't need a further identity check here.
//
// Secret: set ANTHROPIC_API_KEY as an edge-function secret (Supabase → Edge
// Functions → Secrets). Never in the client.
//
// Model: claude-opus-4-8 with structured outputs (output_config.format) so the
// response is validated JSON we can use directly — no brittle parsing.

import Anthropic from 'npm:@anthropic-ai/sdk'

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

// Validated shape of a structured finding.
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    finding: {
      type: 'string',
      description: 'A concise, professional, customer-facing description of the finding. Plain language. No fabrication beyond what the transcript states.',
    },
    severity: {
      type: 'integer',
      description: 'Estimated severity 0-100: 0 = cosmetic/none, ~40 = monitor, ~70+ = significant discrepancy affecting safety or value.',
    },
    suggested_status: {
      type: 'string',
      enum: ['ok', 'monitor', 'discrepancy'],
    },
  },
  required: ['finding', 'severity', 'suggested_status'],
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return json({ error: 'AI is not configured.' }, 500)

  let payload: { transcript?: unknown; item?: unknown }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid request body.' }, 400)
  }
  const transcript = String(payload.transcript ?? '').trim()
  if (!transcript) return json({ error: 'Nothing to structure — dictate a note first.' }, 400)
  // Optional context: the checklist item title/category, to ground the finding.
  const item = typeof payload.item === 'string' ? payload.item.slice(0, 200) : ''

  const anthropic = new Anthropic({ apiKey })

  try {
    const message = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      system:
        'You are an aircraft (and general asset) pre-purchase inspection assistant. ' +
        'A mechanic dictates a rough, spoken note about one checklist item. Rewrite it as a ' +
        'concise, professional finding suitable for a customer-facing report. Be factual and ' +
        'specific; do not invent details not present in the note. If the note clearly indicates a ' +
        'problem, reflect that in the severity and status. Keep the finding to 1-3 sentences.',
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages: [
        {
          role: 'user',
          content:
            (item ? `Checklist item: ${item}\n\n` : '') +
            `Dictated note:\n${transcript}`,
        },
      ],
    })

    const text = message.content.find((b: { type: string }) => b.type === 'text')?.text ?? ''
    let result
    try {
      result = JSON.parse(text)
    } catch {
      return json({ error: 'Could not structure the note. Try again.' }, 502)
    }
    // Clamp severity defensively (schema can't enforce numeric range).
    const severity = Math.max(0, Math.min(100, Number(result.severity) || 0))
    return json({
      finding: String(result.finding ?? '').trim(),
      severity,
      suggested_status: ['ok', 'monitor', 'discrepancy'].includes(result.suggested_status)
        ? result.suggested_status
        : 'monitor',
    })
  } catch (e) {
    const status = (e as { status?: number })?.status
    if (status === 429) return json({ error: 'AI is busy — try again in a moment.' }, 429)
    return json({ error: 'AI request failed.' }, 502)
  }
})
