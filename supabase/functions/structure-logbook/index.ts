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
          page: { type: 'number', description: '1-based number of the page image (in the order given) where this entry appears. 0 if unsure.' },
          next_due_date: { type: 'string', description: 'For a RECURRING item (esp. a recurring AD), the next-due date YYYY-MM-DD if shown, else "".' },
          next_due_hours: { type: 'number', description: 'For a recurring item, the next-due tach/hours if shown, else 0.' },
        },
        required: ['category', 'title', 'event_date', 'tach', 'description', 'page', 'next_due_date', 'next_due_hours'],
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
    unclear: {
      type: 'array',
      description:
        'Things you could NOT confidently read on these pages — smudged/faded figures, illegible ' +
        'handwriting, a cut-off or blurry entry. One short note each, e.g. "Engine SMOH figure smudged ' +
        'on the 2019 overhaul entry" or "Last airframe entry date unreadable". Empty array if everything ' +
        'was legible. Do NOT include things simply absent from the pages — only things present but not readable.',
      items: { type: 'string' },
    },
    parts: {
      type: 'array',
      description:
        'Notable part numbers / components INSTALLED or REPLACED as recorded in the entries — e.g. a ' +
        'replaced magneto, alternator, cylinder, avionics unit, pump, actuator, tire. For each, the ' +
        'part number as written and a short description (what it is). Include the entry date and tach if ' +
        'shown. Only real part numbers or clearly-identified components; skip generic mentions.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          part_number: { type: 'string', description: 'The part number as written, or "" if only a component name is given.' },
          description: { type: 'string', description: 'What the part is, e.g. "Left magneto Slick 4371", "#3 cylinder".' },
          event_date: { type: 'string', description: 'YYYY-MM-DD or "".' },
          tach: { type: 'number', description: 'Tach/total time at install, or 0.' },
          page: { type: 'number', description: '1-based number of the page image (in the order given) where this part appears. 0 if unsure.' },
        },
        required: ['part_number', 'description', 'event_date', 'tach', 'page'],
      },
    },
    compliance: {
      type: 'array',
      description:
        'Recurring inspection / airworthiness compliance recorded in the entries — the annual (or 100-hr), ' +
        'pitot-static system (91.411), altimeter/encoder, transponder (91.413), ELT inspection & ELT ' +
        'battery replacement (91.207), vacuum/air pump replacement, and (Beech) wing-bolt torque check. ' +
        'For EACH, report the MOST RECENT compliance you can see: the standard key if it matches, a short ' +
        'label, the date, and the tach if shown. Skip anything not present on these pages.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          key: {
            type: 'string',
            enum: ['annual', 'pitot_static', 'altimeter', 'transponder', 'elt', 'elt_battery', 'vacuum_pump', 'wing_bolts', ''],
            description: 'The standard item key it matches, or "" if it is some other recurring item.',
          },
          label: { type: 'string', description: 'Short label, e.g. "Annual inspection", "Transponder 91.413".' },
          date: { type: 'string', description: 'YYYY-MM-DD of the most recent compliance, or "".' },
          tach: { type: 'number', description: 'Tach at compliance, or 0.' },
        },
        required: ['key', 'label', 'date', 'tach'],
      },
    },
    limits: {
      type: 'array',
      description:
        'Life-limited / hard-time items from a Maintenance Manual limits table (Chapter 4 / Airworthiness ' +
        'Limitations Section). One entry per item: the component, its part number if shown, and its limit ' +
        'expressed in flight HOURS and/or CYCLES and/or calendar MONTHS. Only populate this from actual ' +
        'MM limits pages; leave it an empty array for ordinary logbook pages.',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          label: { type: 'string', description: 'The item, e.g. "Fuel bladder", "Seat rails", "Rescue hoist cable".' },
          part_number: { type: 'string', description: 'Part number if shown, else "".' },
          limit_hours: { type: 'number', description: 'Hour limit, or 0.' },
          limit_cycles: { type: 'number', description: 'Cycle limit, or 0.' },
          limit_months: { type: 'number', description: 'Calendar-month limit, or 0.' },
          note: { type: 'string', description: 'Short note (e.g. "on condition after", ref), or "".' },
        },
        required: ['label', 'part_number', 'limit_hours', 'limit_cycles', 'limit_months', 'note'],
      },
    },
  },
  required: ['logbooks', 'events', 'specs', 'currency', 'equipment', 'unclear', 'parts', 'compliance', 'limits'],
}

const EMPTY_SPECS = { total_time: 0, engine_smoh: 0, engine_notes: '', prop_since: 0, prop_notes: '', mgtow: 0, empty_weight: 0, useful_load: 0, fuel_capacity: 0 }
const EMPTY_CURRENCY = { annual_due: '', ifr_pitot_static_due: '', transponder_due: '', elt_battery_due: '', o2_hydro_due: '' }
const EMPTY_EQUIPMENT = { avionics: [], additional: [] }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return json({ error: 'AI is not configured.' }, 500)

  let payload: { images?: unknown; org_id?: unknown; context?: unknown }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid request body.' }, 400)
  }
  const orgId = String(payload.org_id ?? '')
  const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  const images = Array.isArray(payload.images)
    ? payload.images.filter((u) => typeof u === 'string').slice(0, MAX_IMAGES)
    : []
  if (!images.length) return json({ error: 'No images to read.' }, 400)

  // Optional: the scan flow tells us which logbook these pages are. When set, we
  // tell the model to report THIS component's own accumulated time (time since
  // new / since overhaul) for the span — not the airframe tach — which is the
  // figure that matters for an engine or propeller book.
  const ctx = (payload.context && typeof payload.context === 'object' ? payload.context : {}) as { kind?: string; position?: number; label?: string }
  const ctxKind = ['airframe', 'engine', 'propeller', 'other', 'ad', 'form_337', 'mm_limits'].includes(String(ctx.kind)) ? String(ctx.kind) : ''
  let contextLine = ''
  if (ctxKind === 'mm_limits') {
    contextLine =
      '\n\nIMPORTANT CONTEXT: these pages are a Maintenance Manual Airworthiness Limitations / life-limited ' +
      'items table. Focus on the "limits" array: extract EVERY life-limited or hard-time item with its ' +
      'limit in hours and/or cycles and/or calendar months, and its part number if shown. Logbook span, ' +
      'events and specs are not expected here — return them empty.'
  } else if (ctxKind === 'ad') {
    contextLine =
      '\n\nIMPORTANT CONTEXT: these pages are an AD (Airworthiness Directive) compliance report. ' +
      'Focus on the events list: extract EACH AD as an event with category="ad", the AD number in the ' +
      'title (e.g. "AD 2015-19-07"), the compliance date in event_date, the method + subject in ' +
      'description, and — for recurring ADs — the NEXT-DUE date in next_due_date and/or next-due hours in ' +
      'next_due_hours. A logbook time span is not needed here.'
  } else if (ctxKind === 'form_337') {
    contextLine =
      '\n\nIMPORTANT CONTEXT: these pages are FAA Form 337s (major repair & alteration). Focus on the ' +
      'events list: extract EACH 337 as an event with category="337", a short description of the repair/ ' +
      'alteration in the title, and the date in event_date. A logbook time span is not needed here.'
  } else if (ctxKind) {
    const where = ctx.position ? ` (position #${ctx.position})` : ''
    const timeWord =
      ctxKind === 'propeller'
        ? 'the PROPELLER’s own time — its time since new, or since the last propeller overhaul'
        : ctxKind === 'engine'
          ? 'the ENGINE’s own time — its time since major overhaul (SMOH), or since new'
          : ctxKind === 'airframe'
            ? 'the AIRFRAME total time (tach/Hobbs)'
            : 'this component’s own accumulated time'
    contextLine =
      `\n\nIMPORTANT CONTEXT: these pages are the ${ctxKind} logbook${where}. ` +
      `Return exactly ONE logbook entry, with kind="${ctxKind}". For start_tach and end_tach, use ${timeWord} ` +
      `as recorded in THIS book — NOT the airframe tach if it differs. If the book tracks this component’s ` +
      `running total separately from the aircraft tach, use the component’s running total.`
  }

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
        '(5) installed equipment, split into avionics vs additional, with short condition notes; ' +
        '(6) "unclear" — short notes on anything PRESENT on the pages you could not confidently read ' +
        '(smudged/faded figures, illegible handwriting), so a human knows to verify it; ' +
        '(7) "parts" — notable part numbers / components installed or replaced (mag, alternator, cylinder, ' +
        'avionics, pump, tire) with their part number + a short description; ' +
        '(8) "compliance" — the most recent recurring inspection / airworthiness compliance you can see ' +
        '(annual/100-hr, pitot-static 91.411, altimeter, transponder 91.413, ELT & ELT battery 91.207, ' +
        'vacuum/air pump replacement, Beech wing-bolt torque) with its date + tach; ' +
        '(9) "limits" — life-limited / hard-time items ONLY if these are Maintenance Manual limits pages. ' +
        'For every event and part, set "page" to the 1-based number of the page image (in the order given) ' +
        'where you read it, so a human can jump straight to that page. ' +
        'Only report what is legible — do not guess. Use empty strings / 0 for anything you cannot ' +
        'read, and add it to "unclear". This is a draft a human will review.' +
        contextLine,
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
    await logAiUsage('structure-logbook', 'claude-opus-4-8', message.usage, orgId, jwt)
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
      unclear: Array.isArray(result.unclear) ? result.unclear.filter((u: unknown) => typeof u === 'string' && u.trim()).map((u: string) => u.trim()) : [],
      parts: Array.isArray(result.parts)
        ? result.parts
            .map((p: Record<string, unknown>) => ({
              part_number: String(p.part_number ?? '').trim(),
              description: String(p.description ?? '').trim(),
              event_date: String(p.event_date ?? '').trim(),
              tach: Number(p.tach) || 0,
              page: Number(p.page) || 0,
            }))
            .filter((p: { part_number: string; description: string }) => p.part_number || p.description)
        : [],
      compliance: Array.isArray(result.compliance)
        ? result.compliance
            .map((c: Record<string, unknown>) => ({
              key: String(c.key ?? '').trim(),
              label: String(c.label ?? '').trim(),
              date: String(c.date ?? '').trim(),
              tach: Number(c.tach) || 0,
            }))
            .filter((c: { key: string; label: string; date: string; tach: number }) => (c.key || c.label) && (c.date || c.tach))
        : [],
      limits: Array.isArray(result.limits)
        ? result.limits
            .map((l: Record<string, unknown>) => ({
              label: String(l.label ?? '').trim(),
              part_number: String(l.part_number ?? '').trim(),
              limit_hours: Number(l.limit_hours) || 0,
              limit_cycles: Number(l.limit_cycles) || 0,
              limit_months: Number(l.limit_months) || 0,
              note: String(l.note ?? '').trim(),
            }))
            .filter((l: { label: string; limit_hours: number; limit_cycles: number; limit_months: number }) => l.label && (l.limit_hours || l.limit_cycles || l.limit_months))
        : [],
    })
  } catch (e) {
    const status = (e as { status?: number })?.status
    if (status === 429) return json({ error: 'AI is busy — try again in a moment.' }, 429)
    return json({ error: 'AI request failed.' }, 502)
  }
})
