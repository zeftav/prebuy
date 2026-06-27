// structure-logbook — read photographed aircraft logbook pages (Claude vision)
// and extract a DRAFT of logbook spans + notable maintenance events for the
// inspector to review and import. Whole-batch: send many page images at once.
//
// JWT: ON (deploy with Verify JWT ON). Reuses the ANTHROPIC_API_KEY secret.
//
// Output is a draft for HUMAN REVIEW — handwritten/faded logs are imperfect.
// Model: claude-opus-4-8 (vision) + structured outputs.

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

const MAX_IMAGES = 20

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    logbooks: {
      type: 'array',
      description: 'One entry per distinct physical logbook covered by the pages.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          kind: { type: 'string', enum: ['airframe', 'engine', 'propeller', 'other'] },
          label: { type: 'string', description: 'Short label, e.g. "Airframe Book 2". Empty string if unknown.' },
          start_date: { type: 'string', description: 'YYYY-MM-DD of first entry, or empty string.' },
          start_tach: { type: 'number', description: 'Tach/total time at first entry, or 0 if unknown.' },
          end_date: { type: 'string', description: 'YYYY-MM-DD of last entry, or empty string.' },
          end_tach: { type: 'number', description: 'Tach/total time at last entry, or 0 if unknown.' },
        },
        required: ['kind', 'label', 'start_date', 'start_tach', 'end_date', 'end_tach'],
      },
    },
    events: {
      type: 'array',
      description: 'Notable maintenance events a broker would highlight: 337s, overhauls, prop strikes/teardowns, damage, AD compliance, major mods/STCs, big-ticket maintenance.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          category: { type: 'string', enum: ['ad', '337', 'overhaul', 'prop_strike', 'damage', 'other'] },
          title: { type: 'string' },
          event_date: { type: 'string', description: 'YYYY-MM-DD or empty string.' },
          tach: { type: 'number', description: 'Tach at the event, or 0 if unknown.' },
          description: { type: 'string', description: 'One-line detail. Empty string if none.' },
        },
        required: ['category', 'title', 'event_date', 'tach', 'description'],
      },
    },
  },
  required: ['logbooks', 'events'],
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return json({ error: 'AI is not configured.' }, 500)

  let payload: { images?: unknown }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid request body.' }, 400)
  }
  const images = Array.isArray(payload.images)
    ? payload.images.filter((u) => typeof u === 'string').slice(0, MAX_IMAGES)
    : []
  if (!images.length) return json({ error: 'No images to read.' }, 400)

  const anthropic = new Anthropic({ apiKey })
  const content: unknown[] = [
    {
      type: 'text',
      text:
        'These are photographed pages from an aircraft’s maintenance logbooks. Extract a DRAFT of: ' +
        '(1) each distinct logbook covered, with its type and date/tach span; and (2) notable ' +
        'maintenance events a broker would highlight (overhauls, 337s, prop strikes & teardowns, ' +
        'damage, AD compliance, major mods/STCs). Only report what is legible — do not guess. Use ' +
        'empty strings / 0 for fields you cannot read. This is a draft a human will review.',
    },
    ...images.map((url) => ({ type: 'image', source: { type: 'url', url } })),
  ]

  try {
    const message = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 4096,
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content }],
    })
    const text = message.content.find((b: { type: string }) => b.type === 'text')?.text ?? ''
    let result
    try {
      result = JSON.parse(text)
    } catch {
      return json({ error: 'Could not read the pages. Try clearer photos.' }, 502)
    }
    return json({
      logbooks: Array.isArray(result.logbooks) ? result.logbooks : [],
      events: Array.isArray(result.events) ? result.events : [],
    })
  } catch (e) {
    const status = (e as { status?: number })?.status
    if (status === 429) return json({ error: 'AI is busy — try again in a moment.' }, 429)
    return json({ error: 'AI request failed.' }, 502)
  }
})
