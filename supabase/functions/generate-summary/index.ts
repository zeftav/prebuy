// generate-summary — write an original, broker-style narrative overview of an
// inspection from its STRUCTURED data (asset, specs, currency, equipment, damage,
// notable maintenance, and the inspection findings). The prose becomes the report's
// opening summary; the structured blocks still render beneath it.
//
// The client sends the assembled context (same pattern as structure-finding) — this
// function does no DB access, it just turns structured facts into clean prose.
//
// JWT: ON (deploy with Verify JWT ON). Reuses the ANTHROPIC_API_KEY secret.
// Model: claude-opus-4-8 + structured outputs.
//
// IMPORTANT: original prose generated from the provided facts only — never copied
// from any listing, and no invented figures.

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

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    summary: {
      type: 'string',
      description:
        'A professional, customer-facing overview of the asset and its pre-purchase inspection: 2–4 short paragraphs of original prose. Lead with what it is and overall condition, then notable maintenance/equipment strengths, then a balanced note on open discrepancies or items to monitor. Plain, factual, neutral — never salesy.',
    },
  },
  required: ['summary'],
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return json({ error: 'AI is not configured.' }, 500)

  let payload: { context?: unknown }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid request body.' }, 400)
  }
  const context = payload.context && typeof payload.context === 'object' ? payload.context : null
  if (!context) return json({ error: 'Nothing to summarize yet.' }, 400)
  // Cap the payload so a huge inspection can't blow the prompt.
  const factsJson = JSON.stringify(context).slice(0, 12000)

  const anthropic = new Anthropic({ apiKey })

  try {
    const message = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1200,
      system:
        'You are a pre-purchase inspection report writer (aviation and other high-value assets). ' +
        'You are given STRUCTURED FACTS about one asset and its inspection as JSON. Write an original, ' +
        'professional overview suitable for the top of a customer-facing report. Rules: ' +
        '(1) Use ONLY the facts provided — never invent times, dates, equipment, or figures, and never ' +
        'copy phrasing from any listing. (2) Be balanced and factual: state strengths AND any open ' +
        'discrepancies or items to monitor; do not oversell. (3) If damage history is present, mention ' +
        'it plainly, including what was and was not affected when given; if none is provided, you may ' +
        'note that no damage history was reported. (4) Keep it tight: 2–4 short paragraphs, no headings, ' +
        'no bullet lists. (5) Refer to the asset naturally (e.g. "this 1970 Beechcraft A36"). Omit any ' +
        'field that is absent rather than guessing.',
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{ role: 'user', content: `Structured facts (JSON):\n${factsJson}` }],
    })

    const text = message.content.find((b: { type: string }) => b.type === 'text')?.text ?? ''
    let result
    try {
      result = JSON.parse(text)
    } catch {
      return json({ error: 'Could not generate a summary. Try again.' }, 502)
    }
    const summary = String(result.summary ?? '').trim()
    if (!summary) return json({ error: 'Could not generate a summary. Try again.' }, 502)
    return json({ summary })
  } catch (e) {
    const status = (e as { status?: number })?.status
    if (status === 429) return json({ error: 'AI is busy — try again in a moment.' }, 429)
    return json({ error: 'AI request failed.' }, 502)
  }
})
