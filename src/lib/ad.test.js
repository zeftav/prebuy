import { describe, it, expect } from 'vitest'
import { parseAdNumbers, compileAdCompliance, adStats } from './ad.js'

describe('parseAdNumbers', () => {
  it('reads modern and legacy AD numbers', () => {
    expect(parseAdNumbers('AD 2015-19-07 complied with')).toEqual(['2015-19-07'])
    expect(parseAdNumbers('72-07-09 wing spar')).toEqual(['72-07-09'])
  })
  it('de-dupes and finds multiple', () => {
    expect(parseAdNumbers('2015-19-07 and again 2015-19-07; also 2020-26-05')).toEqual(['2015-19-07', '2020-26-05'])
  })
  it('returns empty for none', () => {
    expect(parseAdNumbers('annual inspection')).toEqual([])
    expect(parseAdNumbers(null)).toEqual([])
  })
})

const ev = (o) => ({ category: 'ad', title: '', description: '', event_date: null, tach: null, logbook_id: null, ...o })

describe('compileAdCompliance', () => {
  const logbooks = [
    { id: 'af', kind: 'airframe' },
    { id: 'rep', kind: 'ad' }, // the AD compliance report scan
  ]

  it('compiles ADs from logbook events, keyed by number', () => {
    const events = [
      ev({ title: 'AD 2015-19-07 c/w', event_date: '2020-01-01', tach: 1000, logbook_id: 'af' }),
      ev({ title: 'AD 2015-19-07 recurring c/w', event_date: '2022-01-01', tach: 1400, logbook_id: 'af' }),
    ]
    const { ads } = compileAdCompliance(events, logbooks)
    expect(ads).toHaveLength(1)
    expect(ads[0].ad_number).toBe('2015-19-07')
    expect(ads[0].latest_date).toBe('2022-01-01')
    expect(ads[0].latest_tach).toBe(1400)
    expect(ads[0].recurring).toBe(true) // two dates + "recurring"
    expect(ads[0].sources).toEqual({ logbook: true, report: false })
  })

  it('flags an AD on the report but not in the logbooks (unverified)', () => {
    const events = [
      ev({ title: '2020-26-05', event_date: '2021-05-01', logbook_id: 'rep' }),
    ]
    const { hasReport, issues } = compileAdCompliance(events, logbooks)
    expect(hasReport).toBe(true)
    expect(issues).toHaveLength(1)
    expect(issues[0].type).toBe('unverified')
  })

  it('flags an AD in the logbooks but not on the report', () => {
    const events = [
      ev({ title: '2015-19-07', logbook_id: 'af' }),
      ev({ title: '2020-26-05', logbook_id: 'rep' }), // makes hasReport true
    ]
    const { issues } = compileAdCompliance(events, logbooks)
    expect(issues.some((i) => i.type === 'missing_from_report' && i.message.includes('2015-19-07'))).toBe(true)
  })

  it('carries next-due (date/hours) from the AD report occurrence', () => {
    const events = [
      ev({ title: '2015-19-07', event_date: '2020-01-01', logbook_id: 'af' }),
      ev({ title: '2015-19-07', event_date: '2021-06-01', next_due_date: '2023-06-01', next_due_hours: 1800, logbook_id: 'rep' }),
    ]
    const { ads } = compileAdCompliance(events, logbooks)
    expect(ads[0].next_due_date).toBe('2023-06-01')
    expect(ads[0].next_due_hours).toBe(1800)
    expect(ads[0].recurring).toBe(true)
  })

  it('marks an AD present in both sources as matched (no issue)', () => {
    const events = [
      ev({ title: '2015-19-07', logbook_id: 'af' }),
      ev({ title: '2015-19-07', logbook_id: 'rep' }),
    ]
    const { ads, issues } = compileAdCompliance(events, logbooks)
    expect(ads[0].sources).toEqual({ logbook: true, report: true })
    expect(issues).toHaveLength(0)
  })

  it('no report → no comparison issues even with logbook-only ADs', () => {
    const events = [ev({ title: '2015-19-07', logbook_id: 'af' })]
    const { hasReport, issues } = compileAdCompliance(events, logbooks)
    expect(hasReport).toBe(false)
    expect(issues).toHaveLength(0)
  })

  it('ignores non-AD events', () => {
    const events = [ev({ category: 'overhaul', title: 'Engine OH', logbook_id: 'af' })]
    expect(compileAdCompliance(events, logbooks).ads).toHaveLength(0)
  })
})

describe('adStats', () => {
  it('counts total and recurring', () => {
    expect(adStats([{ recurring: true }, { recurring: false }, { recurring: true }])).toEqual({ total: 3, recurring: 2 })
  })
})
