// Timed-items / airworthiness compliance summary.
//
// Recurring inspections and life-limited items pertinent to an airframe — the IFR
// checks (pitot-static / transponder / altimeter, FAR 91.411/413), the ELT and its
// battery, the annual, plus make-specific items (e.g. Beech wing-bolt retorque) and
// on-condition components (vacuum/air pump). Life-limited parts read off the
// Maintenance Manual can be added too. We compute each item's next-due (calendar
// months and/or hours) and a status: overdue / due-soon / ok / unknown.
//
// Stored on `inspections.attributes.compliance = { items: [...], current_tach }`
// (a JSONB bag, like the profile — no migration). Pure helpers are tested; the
// persistence is thin (saveCompliance merges into attributes).

import { supabase } from './supabase.js'

// Due-soon windows (a recurring item this close to due should get attention now).
const DUE_SOON_MONTHS = 2
const DUE_SOON_HOURS = 25

/**
 * The standard recurring set for an aviation airframe, plus make-specific items.
 * `interval_months` / `interval_hours` drive the due math; either or both may be
 * set. `basis` is the regulatory / manufacturer reference shown to the inspector.
 * Pure.
 */
export function defaultComplianceItems({ vertical = 'aviation', make = '' } = {}) {
  if (vertical !== 'aviation') return []
  const items = [
    { key: 'annual', label: 'Annual inspection', category: 'inspection', basis: 'FAR 91.409(a)', interval_months: 12 },
    { key: 'pitot_static', label: 'Pitot-static system', category: 'ifr', basis: 'FAR 91.411', interval_months: 24 },
    { key: 'altimeter', label: 'Altimeter / encoder', category: 'ifr', basis: 'FAR 91.411', interval_months: 24 },
    { key: 'transponder', label: 'Transponder', category: 'ifr', basis: 'FAR 91.413', interval_months: 24 },
    { key: 'elt', label: 'ELT inspection', category: 'airworthiness', basis: 'FAR 91.207(d)', interval_months: 12 },
    { key: 'elt_battery', label: 'ELT battery', category: 'airworthiness', basis: 'FAR 91.207(c) — replace by date' },
    { key: 'vacuum_pump', label: 'Vacuum / air pump', category: 'component', basis: 'On-condition — typical ~500 hr', interval_hours: 500 },
  ]
  if (/\bbeech/i.test(String(make))) {
    items.push({ key: 'wing_bolts', label: 'Wing-bolt torque / inspection', category: 'airworthiness', basis: 'Beech recurring wing-bolt inspection' })
  }
  return items
}

/** Coerce to a finite number or null. Pure. */
function num(v) {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Merge stored compliance values onto the default set (keyed by `key`), append any
 * custom items the shop added, and drop defaults the shop disabled. Returns
 * { items, current_tach }. Pure. Each item carries the last-complied data
 * (last_date / last_tach), an optional note, its source ('standard' | 'custom' |
 * 'mm-scan'), and `disabled`.
 */
export function normalizeCompliance(attributes, { vertical = 'aviation', make = '' } = {}) {
  const stored = attributes?.compliance ?? {}
  const storedItems = Array.isArray(stored.items) ? stored.items : []
  const byKey = new Map(storedItems.filter((i) => i?.key).map((i) => [i.key, i]))

  const defaults = defaultComplianceItems({ vertical, make }).map((d) => {
    const s = byKey.get(d.key) ?? {}
    return {
      ...d,
      source: 'standard',
      last_date: s.last_date ?? null,
      last_tach: num(s.last_tach),
      note: s.note ?? null,
      disabled: !!s.disabled,
      // A shop may override the interval on a standard item.
      interval_months: s.interval_months != null ? num(s.interval_months) : d.interval_months ?? null,
      interval_hours: s.interval_hours != null ? num(s.interval_hours) : d.interval_hours ?? null,
    }
  })

  const defaultKeys = new Set(defaults.map((d) => d.key))
  const custom = storedItems
    .filter((i) => i?.key && !defaultKeys.has(i.key))
    .map((i) => ({
      key: i.key,
      label: i.label ?? 'Item',
      category: i.category ?? 'component',
      basis: i.basis ?? null,
      source: i.source === 'mm-scan' ? 'mm-scan' : 'custom',
      last_date: i.last_date ?? null,
      last_tach: num(i.last_tach),
      note: i.note ?? null,
      disabled: !!i.disabled,
      interval_months: num(i.interval_months),
      interval_hours: num(i.interval_hours),
    }))

  return { items: [...defaults, ...custom], current_tach: num(stored.current_tach) }
}

/** Add calendar months to an ISO date (YYYY-MM-DD). Returns ISO date. Pure. */
export function addMonths(isoDate, months) {
  const m = Number(months)
  if (!isoDate || !Number.isFinite(m)) return null
  const [y, mo, d] = String(isoDate).split('-').map(Number)
  if (!y || !mo || !d) return null
  const base = new Date(Date.UTC(y, mo - 1, d))
  base.setUTCMonth(base.getUTCMonth() + m)
  return base.toISOString().slice(0, 10)
}

/** Whole days between two ISO dates (b − a). Pure. */
export function daysBetween(a, b) {
  if (!a || !b) return null
  const da = Date.parse(`${a}T00:00:00Z`)
  const db = Date.parse(`${b}T00:00:00Z`)
  if (Number.isNaN(da) || Number.isNaN(db)) return null
  return Math.round((db - da) / 86400000)
}

/**
 * Compute an item's due status as of `asOfDate` (ISO) and `currentTach` (hours).
 * Considers calendar-months and/or hours intervals; when both apply, the nearest
 * (worst) governs the status. Returns { status, dueDate, dueTach, daysRemaining,
 * hoursRemaining, reason }. status ∈ overdue | due-soon | ok | unknown. Pure.
 */
export function dueStatus(item, { asOfDate = null, currentTach = null } = {}) {
  if (item?.disabled) return { status: 'unknown', dueDate: null, dueTach: null, daysRemaining: null, hoursRemaining: null, reason: 'disabled' }
  const out = { status: 'unknown', dueDate: null, dueTach: null, daysRemaining: null, hoursRemaining: null, reason: null }
  const states = []

  // Calendar-months track.
  if (item?.interval_months && item.last_date) {
    const dueDate = addMonths(item.last_date, item.interval_months)
    out.dueDate = dueDate
    const days = asOfDate ? daysBetween(asOfDate, dueDate) : null
    out.daysRemaining = days
    if (days != null) {
      states.push(days < 0 ? 'overdue' : days <= DUE_SOON_MONTHS * 30 ? 'due-soon' : 'ok')
    }
  }
  // Hours track.
  if (item?.interval_hours && item.last_tach != null) {
    const dueTach = Math.round((item.last_tach + item.interval_hours) * 10) / 10
    out.dueTach = dueTach
    const hrs = currentTach != null ? Math.round((dueTach - currentTach) * 10) / 10 : null
    out.hoursRemaining = hrs
    if (hrs != null) {
      states.push(hrs < 0 ? 'overdue' : hrs <= DUE_SOON_HOURS ? 'due-soon' : 'ok')
    }
  }
  // A by-date item with a last_date but no interval (e.g. ELT battery replace-by):
  // treat last_date as the due date itself when no interval is set.
  if (!item?.interval_months && !item?.interval_hours && item?.last_date) {
    out.dueDate = item.last_date
    const days = asOfDate ? daysBetween(asOfDate, item.last_date) : null
    out.daysRemaining = days
    if (days != null) states.push(days < 0 ? 'overdue' : days <= DUE_SOON_MONTHS * 30 ? 'due-soon' : 'ok')
  }

  if (states.includes('overdue')) out.status = 'overdue'
  else if (states.includes('due-soon')) out.status = 'due-soon'
  else if (states.includes('ok')) out.status = 'ok'
  else out.status = 'unknown'
  return out
}

const STATUS_RANK = { overdue: 0, 'due-soon': 1, unknown: 2, ok: 3 }

/** Tally items by status (skips disabled). Pure. */
export function complianceStats(items, ctx = {}) {
  const stats = { overdue: 0, 'due-soon': 0, ok: 0, unknown: 0 }
  for (const it of items ?? []) {
    if (it.disabled) continue
    stats[dueStatus(it, ctx).status] += 1
  }
  return stats
}

/**
 * Rows for display/report: each item with its computed status, sorted worst-first
 * (overdue → due-soon → unknown → ok). Skips disabled items. Pure.
 */
export function complianceRows(items, ctx = {}) {
  return (items ?? [])
    .filter((it) => !it.disabled)
    .map((it) => ({ ...it, due: dueStatus(it, ctx) }))
    .sort((a, b) => (STATUS_RANK[a.due.status] - STATUS_RANK[b.due.status]) || String(a.label).localeCompare(String(b.label)))
}

/** True when nothing has been filled in (no last-complied data on any item). Pure. */
export function isComplianceEmpty(items) {
  return !(items ?? []).some((it) => !it.disabled && (it.last_date || it.last_tach != null))
}

export function statusLabel(status) {
  return { overdue: 'Overdue', 'due-soon': 'Due soon', ok: 'Current', unknown: 'Unknown' }[status] || status
}

/**
 * Persist the compliance bag onto `inspections.attributes.compliance`. `items`
 * should be the editable list (we store only the shop-set fields per item, keyed by
 * `key`, so defaults stay code-driven). Returns { data, error }.
 */
export async function saveCompliance(inspection, { items, currentTach }) {
  const compact = (items ?? [])
    .filter((i) => i?.key)
    .map((i) => {
      const row = { key: i.key }
      if (i.source && i.source !== 'standard') {
        row.source = i.source
        row.label = i.label
        row.category = i.category
        if (i.basis) row.basis = i.basis
      }
      if (i.last_date) row.last_date = i.last_date
      if (num(i.last_tach) != null) row.last_tach = num(i.last_tach)
      if (i.note) row.note = i.note
      if (i.disabled) row.disabled = true
      if (num(i.interval_months) != null) row.interval_months = num(i.interval_months)
      if (num(i.interval_hours) != null) row.interval_hours = num(i.interval_hours)
      return row
    })
  const compliance = { items: compact }
  if (num(currentTach) != null) compliance.current_tach = num(currentTach)
  const attributes = { ...(inspection.attributes ?? {}), compliance }
  const { data, error } = await supabase
    .from('inspections')
    .update({ attributes })
    .eq('id', inspection.id)
    .select('id, attributes')
    .single()
  return { data, error }
}

/** A slug for a new custom item's key. Pure. */
export function slugKey(label) {
  const base = String(label ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return `custom_${base || 'item'}`
}
