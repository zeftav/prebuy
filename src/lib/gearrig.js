// Landing-gear rigging data record for Beech aircraft — Zefting Aviation Form
// Z-32-LGR. A structured measurement form (spec vs measured vs pass/fail) that's
// offered on any Beechcraft inspection. Stored on inspections.attributes.gear_rigging
// so it needs no table; rendered on the inspection tool page and the report.
//
// The spec (nominal ranges) is baked in from the form; the tech records the
// measured value, marks Pass/Fail, and adds remarks.

import { supabase } from './supabase.js'

/** Beech aircraft (Bonanza/Baron/Debonair/Travel Air share this gear system). */
export function isBeech(make) {
  return /\bbeech/i.test(String(make ?? ''))
}

// Header identity fields.
export const GEAR_RIG_HEADER = [
  { key: 'model', label: 'Aircraft model' },
  { key: 'serial', label: 'Serial number' },
  { key: 'registration', label: 'Registration' },
  { key: 'work_order', label: 'Work order #' },
  { key: 'airframe_time', label: 'Airframe total time (hrs)' },
  { key: 'voltage', label: 'System voltage', type: 'voltage' }, // '14' | '28'
]

// Parameter groups (label · spec lines · guidance remark).
export const GEAR_RIG_GROUPS = [
  {
    title: 'Up-travel',
    rows: [
      { key: 'up_sector_gear', label: 'Sector gear clearance (circuit breaker pulled)', spec: ['Green Box: 1/8–1/4 handcrank turn remaining', 'White Box: 5/8–3/4 handcrank turn remaining'], remark: 'Check for manual clearance' },
      { key: 'up_vbrace', label: 'Main V-brace knee-to-wing-skin', spec: ['0.060 in min (ABS guideline)', '0.120 in min (Beech MM standard)'], remark: 'Slide feeler gauge' },
      { key: 'up_stop_bolt', label: 'Main gear up stop bolt', spec: ['0.003 in clearance, then back out 3/4 turn'], remark: 'Lock nut securely' },
      { key: 'up_uplock_roller', label: 'Uplock hook-to-roller clearance', spec: ['0.010–0.020 in (aim wide side ~0.020 in)'], remark: 'Roller must spin freely' },
      { key: 'up_uplock_cable', label: 'Uplock cable tension', spec: ['52.5–62.5 lbs (52.5 +10 / −0)'], remark: 'Measure inside cabin' },
      { key: 'up_nose_bumper', label: 'Retracted nose gear-to-bumper tension', spec: ['30–35 lbs (no doors connected)', '20 lbs min (doors connected)'], remark: 'Scale downward at tow pin' },
    ],
  },
  {
    title: 'Down-travel',
    rows: [
      { key: 'dn_main_knee', label: 'Main gear knee joint tension', spec: ['45–60 lbs over-center break force (ABS: 45–65)'], remark: 'Check both sides' },
      { key: 'dn_main_spring', label: 'Main gear spring coil gap', spec: ['0.060 in min gap remaining between coils'], remark: 'Verify no coil stacking' },
      { key: 'dn_nose_knee', label: 'Nose gear knee joint tension', spec: ['55 lbs min deflection force over-center'], remark: 'Check nose drag brace' },
    ],
  },
  {
    title: 'Clearance',
    rows: [
      { key: 'cl_inner_door', label: 'Inner main gear door-to-tire', spec: ['0.50 in min at the 3/4 down position'], remark: 'Slack removed from door link' },
      { key: 'cl_outboard_door', label: 'Outboard main gear door-to-strut', spec: ['No chafing or contact when retracted'], remark: 'Must clear the strut barrel' },
    ],
  },
  {
    title: 'System — electrical',
    rows: [
      { key: 'el_voltage', label: 'Test voltage under load', spec: ['14.25 ± 0.25 VDC (14V)', '28.25 ± 0.25 VDC (28V)'], remark: 'Regulated GPU power required' },
      { key: 'el_dynamic_brake', label: 'Dynamic braking action', spec: ['Instant stop; motor must not coast or overrun'], remark: 'Check Dynamic Brake Relay' },
    ],
  },
  {
    title: 'System — warning',
    rows: [
      { key: 'wn_gear_horn', label: 'Gear warning horn activation', spec: ['Throttle to idle, within 3/8–1/2 in of stop'], remark: 'Check both throttles in a twin' },
    ],
  },
  {
    title: 'Servicing',
    rows: [
      { key: 'sv_shimmy', label: 'Shimmy damper fluid level', spec: ['2-3/16 in dipstick (full 2.19")', '3-1/16 in dipstick (empty 3.06")'], remark: 'Service with MIL-H-5606' },
    ],
  },
]

export const GEAR_RIG_SIGNOFF = [
  { key: 'rigging_tech', label: 'Rigging technician' },
  { key: 'ap_license', label: 'A&P license #' },
  { key: 'lead_inspector', label: 'Lead inspector' },
  { key: 'ia_cert', label: 'IA certificate #' },
  { key: 'completed_date', label: 'Date completed', type: 'date' },
]

/** All parameter keys, flat. Pure. */
export function gearRigRowKeys() {
  return GEAR_RIG_GROUPS.flatMap((g) => g.rows.map((r) => r.key))
}

/** Fresh, empty record. Pure. */
export function emptyGearRig() {
  const rows = {}
  for (const k of gearRigRowKeys()) rows[k] = { measured: '', status: '', remarks: '' }
  return { header: {}, rows, signoff: {} }
}

/** Normalize a stored record so every field exists. Pure. */
export function normalizeGearRig(data) {
  const base = emptyGearRig()
  if (!data || typeof data !== 'object') return base
  base.header = { ...data.header }
  base.signoff = { ...data.signoff }
  for (const k of gearRigRowKeys()) {
    const r = data.rows?.[k] ?? {}
    base.rows[k] = { measured: String(r.measured ?? ''), status: r.status === 'P' || r.status === 'F' ? r.status : '', remarks: String(r.remarks ?? '') }
  }
  return base
}

/** Pass/fail/completed tallies for the summary + report. Pure. */
export function gearRigStats(data) {
  const rows = normalizeGearRig(data).rows
  let pass = 0, fail = 0, done = 0
  const keys = gearRigRowKeys()
  for (const k of keys) {
    const r = rows[k]
    if (r.status === 'P') { pass++; done++ }
    else if (r.status === 'F') { fail++; done++ }
    else if (r.measured.trim()) done++
  }
  return { pass, fail, done, total: keys.length }
}

/** Has the tech entered anything? Pure. */
export function isGearRigEmpty(data) {
  const s = gearRigStats(data)
  const n = normalizeGearRig(data)
  const hasHeader = Object.values(n.header).some((v) => String(v ?? '').trim())
  return s.done === 0 && !hasHeader
}

/** Save the record onto the inspection's attributes (preserving profile etc.). */
export async function saveGearRigging(inspection, data) {
  const attributes = { ...(inspection.attributes ?? {}), gear_rigging: data }
  const { error } = await supabase.from('inspections').update({ attributes }).eq('id', inspection.id)
  return { error }
}
