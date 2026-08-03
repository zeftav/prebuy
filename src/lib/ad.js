// AD (Airworthiness Directive) compliance resource.
//
// We already read ADs off the scans as `logbook_events` with category 'ad'. This
// compiles them into a de-duplicated AD list keyed by AD number, and — when the
// shop has also scanned a standalone **AD compliance report** (a logbook of kind
// 'ad', e.g. an IA's ADlog printout) — compares the two sources and flags
// discrepancies: ADs on the report but not found in the logbooks (unverified), and
// ADs in the logbooks but not on the report (report may be stale). All pure + tested.

/**
 * Extract AD numbers from free text. Handles modern (YYYY-CC-NN, e.g. 2015-19-07),
 * legacy (YY-CC-NN, e.g. 72-07-09) and emergency formats, ignoring an optional
 * "AD" prefix. Returns de-duplicated numbers in first-seen order. Pure.
 */
export function parseAdNumbers(text) {
  const s = String(text ?? '')
  const re = /\b(\d{2,4}-\d{1,2}-\d{1,3})\b/g
  const out = []
  for (const m of s.matchAll(re)) out.push(m[1])
  return [...new Set(out)]
}

// Words that mark an AD as recurring/repetitive.
const RECURRING_RE = /recurr|repetitive|\bevery\b|interval|repeat/i

/**
 * Compile AD compliance from logbook events. Each 'ad' event is attributed to a
 * source by the kind of the logbook it came from: kind 'ad' → the AD compliance
 * report; anything else (or manual) → the logbooks. Returns { ads, hasReport,
 * issues }. Pure.
 *
 * ads: [{ key, ad_number|null, title, latest_date, latest_tach, recurring,
 *         sources:{logbook,report}, count }] sorted by AD number/title.
 */
export function compileAdCompliance(events, logbooks) {
  const kindById = new Map((logbooks ?? []).map((b) => [b.id, b.kind]))
  const adEvents = (events ?? []).filter((e) => e?.category === 'ad')
  const map = new Map()
  let hasReport = false

  for (const e of adEvents) {
    const source = kindById.get(e.logbook_id) === 'ad' ? 'report' : 'logbook'
    if (source === 'report') hasReport = true
    const nums = parseAdNumbers(`${e.title ?? ''} ${e.description ?? ''}`)
    // Key by AD number when we can read one; otherwise fall back to the title so
    // un-numbered entries still group and show.
    const keys = nums.length ? nums : [`~${String(e.title ?? 'AD').trim().toLowerCase()}`]
    const text = `${e.title ?? ''} ${e.description ?? ''}`
    for (const k of keys) {
      if (!map.has(k)) {
        map.set(k, { ad_number: nums.length ? k : null, title: e.title ?? '', dates: [], tachs: [], sources: { logbook: false, report: false }, recurring: false, count: 0 })
      }
      const rec = map.get(k)
      rec.count += 1
      rec.sources[source] = true
      if (e.event_date) rec.dates.push(e.event_date)
      if (e.tach != null && Number.isFinite(Number(e.tach))) rec.tachs.push(Number(e.tach))
      if (RECURRING_RE.test(text)) rec.recurring = true
      if (!rec.title && e.title) rec.title = e.title
    }
  }

  const ads = [...map.entries()]
    .map(([key, r]) => ({
      key,
      ad_number: r.ad_number,
      title: r.title,
      latest_date: r.dates.length ? [...r.dates].sort().slice(-1)[0] : null,
      latest_tach: r.tachs.length ? Math.max(...r.tachs) : null,
      // Multiple compliance dates for one AD implies it recurs.
      recurring: r.recurring || new Set(r.dates).size > 1,
      sources: r.sources,
      count: r.count,
    }))
    .sort((a, b) => String(a.ad_number ?? a.title).localeCompare(String(b.ad_number ?? b.title), undefined, { numeric: true }))

  const issues = []
  if (hasReport) {
    for (const ad of ads) {
      const id = ad.ad_number || ad.title || 'AD'
      if (ad.sources.report && !ad.sources.logbook) {
        issues.push({ type: 'unverified', key: ad.key, message: `${id}: on the AD compliance report but no logbook entry found — verify the logbooks record compliance.` })
      } else if (ad.sources.logbook && !ad.sources.report) {
        issues.push({ type: 'missing_from_report', key: ad.key, message: `${id}: found in the logbooks but not on the AD compliance report — confirm the report is current.` })
      }
    }
  }

  return { ads, hasReport, issues }
}

/** Count ADs by whether they're recurring. Pure. */
export function adStats(ads) {
  const list = ads ?? []
  return { total: list.length, recurring: list.filter((a) => a.recurring).length }
}
