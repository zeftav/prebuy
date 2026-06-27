// structure-logbook — read photographed aircraft logbook pages / records (Claude
// vision) and extract a DRAFT of: logbook spans, notable maintenance events, and
// — for the Aircraft Profile spec sheet — specs/times, currency due-dates, and a
// categorized equipment list. Whole-batch: send many page images at once.
//
// Two consumers, one vision pass: the Logbook audit page uses logbooks+events; the
// Aircraft profile page uses specs+currency+equipment. Each ignores the other's
// fields, so this stays one function / one deploy.
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
    specs: {
      type: 'object',
      additionalProperties: false,
      description: 'Aircraft specs/times for the profile spec sheet. Use 0 / empty string for anything not legible. Notes are short free text (e.g. "RAM to new limits, new cams 2019").',
      properties: {
        total_time: { type: 'number', description: 'Airframe total time (hrs), or 0.' },
        engine_smoh: { type: 'number', description: 'Hours since major overhaul, or 0.' },
        engine_notes: { type: 'string', description: 'Engine notes (shop, mods), or empty.' },
        prop_since: { type: 'number', description: 'Prop hours since new/OH, or 0.' },
        prop_notes: { type: 'string', description: 'Prop notes (date, blades), or empty.' },
        mgtow: { type: 'number', description: 'Max gross takeoff weight (lbs), or 0.' },
        empty_weight: { type: 'number', description: 'Empty/basic weight (lbs), or 0.' },
        useful_load: { type: 'number', description: 'Useful load (lbs), or 0.' },
        fuel_capacity: { type: 'number', description: 'Usable fuel (gal), or 0.' },
      },
      required: ['total_time', 'engine_smoh', 'engine_notes', 'prop_since', 'prop_notes', 'mgtow', 'empty_weight', 'useful_load', 'fuel_capacity'],
    },
    currency: {
      type: 'object',
      additionalProperties: false,
      description: 'Inspection/check due dates, as YYYY-MM or YYYY-MM-DD. Empty string if not shown.',
      properties: {
        annual_due: { type: 'string' },
        ifr_pitot_static_due: { type: 'string', description: 'Pitot/static 91.411 due.' },
        transponder_due: { type: 'string', description: 'Transponder 91.413 due.' },
        elt_battery_due: { type: 'string' },
        o2_hydro_due: { type: 'string', description: 'Oxygen bottle hydro due.' },
      },
      required: ['annual_due', 'ifr_pitot_static_due', 'transponder_due', 'elt_battery_due', 'o2_hydro_due'],
    },
    equipment: {
      type: 'object',
      additionalProperties: false,
      description: 'Installed equipment found in records (weight & balance equipment lists, 337s, placards). Split avionics from other equipment. Add a short condition/detail note where shown.',
      properties: {
        avionics: {
          type: 'array',
          description: 'GPS/nav/comm, autopilot, audio panel, transponder/ADS-B, engine monitor, radar, stormscope…',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: { name: { type: 'string' }, notes: { type: 'string' } },
            required: ['name', 'notes'],
          },
        },
        additional: {
          type: 'array',
          description: 'Non-avionics: known-ice/FIKI, GAMIjectors, oxygen, A/C, winglets/VGs, long-range fuel…',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: { name: { type: 'string' }, notes: { type: 'string' } },
            required: ['name', 'notes'],
          },
        },
      },
      required: ['avionics', 'additional'],
    },
  },
  required: ['logbooks', 'events', 'specs', 'currency', 'equipment'],
}

const EMPTY_SPECS = { total_time: 0, engine_smoh: 0, engine_notes: '', prop_since: 0, prop_notes: '', mgtow: 0, empty_weight: 0, useful_load: 0, fuel_capacity: 0 }
const EMPTY_CURRENCY = { annual_due: '', ifr_pitot_static_due: '', transponder_due: '', elt_battery_due: '', o2_hydro_due: '' }
const EMPTY_EQUIPMENT = { avionics: [], additional: [] }

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
        'These are photographed pages from an aircraft’s maintenance records (logbooks, weight & ' +
        'balance / equipment lists, 337s, placards). Extract a DRAFT of: ' +
        '(1) each distinct logbook covered, with its type and date/tach span; ' +
        '(2) notable maintenance events a broker would highlight (overhauls, 337s, prop strikes & ' +
        'teardowns, damage, AD compliance, major mods/STCs); ' +
        '(3) aircraft specs/times (total time, engine SMOH, prop, weights, fuel); ' +
        '(4) currency due-dates (annual, IFR pitot/static 91.411, transponder 91.413, ELT battery, O2 hydro); ' +
        '(5) installed equipment, split into avionics vs additional, with short condition notes. ' +
        'Only report what is legible — do not guess. Use empty strings / 0 for anything you cannot ' +
        'read. This is a draft a human will review.',
    },
    ...images.map((url) => ({ type: 'image', source: { type: 'url', url } })),
  ]

  try {
    const message = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 8192,
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
    const eq = result.equipment && typeof result.equipment === 'object' ? result.equipment : EMPTY_EQUIPMENT
    return json({
      logbooks: Array.isArray(result.logbooks) ? result.logbooks : [],
      events: Array.isArray(result.events) ? result.events : [],
      specs: result.specs && typeof result.specs === 'object' ? { ...EMPTY_SPECS, ...result.specs } : EMPTY_SPECS,
      currency: result.currency && typeof result.currency === 'object' ? { ...EMPTY_CURRENCY, ...result.currency } : EMPTY_CURRENCY,
      equipment: {
        avionics: Array.isArray(eq.avionics) ? eq.avionics : [],
        additional: Array.isArray(eq.additional) ? eq.additional : [],
      },
    })
  } catch (e) {
    const status = (e as { status?: number })?.status
    if (status === 429) return json({ error: 'AI is busy — try again in a moment.' }, 429)
    return json({ error: 'AI request failed.' }, 502)
  }
})
