import { describe, it, expect } from 'vitest'
import { reasonLabel, openCount, groupByStatus, groupByReason, reportFollowups, FOLLOWUP_REASONS } from './followups.js'

const F = [
  { id: '1', reason: 'research', status: 'open', show_on_report: true },
  { id: '2', reason: 'look-deeper', status: 'open', show_on_report: false },
  { id: '3', reason: 'research', status: 'resolved', show_on_report: true },
  { id: '4', reason: 'second-opinion', status: 'dismissed', show_on_report: true },
  { id: '5', reason: 'bogus', status: 'open', show_on_report: false },
]

describe('reasonLabel', () => {
  it('maps known keys', () => {
    expect(reasonLabel('research')).toBe('Needs research')
    expect(reasonLabel('awaiting-records')).toBe('Awaiting records')
  })
  it('falls back to Other for unknown', () => {
    expect(reasonLabel('nope')).toBe('Other')
  })
  it('has 5 reasons', () => {
    expect(FOLLOWUP_REASONS).toHaveLength(5)
  })
})

describe('openCount', () => {
  it('counts only open', () => {
    expect(openCount(F)).toBe(3)
  })
  it('handles nullish', () => {
    expect(openCount(null)).toBe(0)
  })
})

describe('groupByStatus', () => {
  it('buckets by status', () => {
    const g = groupByStatus(F)
    expect(g.open.map((x) => x.id)).toEqual(['1', '2', '5'])
    expect(g.resolved.map((x) => x.id)).toEqual(['3'])
    expect(g.dismissed.map((x) => x.id)).toEqual(['4'])
  })
  it('treats unknown status as open', () => {
    const g = groupByStatus([{ id: 'x', status: 'weird' }])
    expect(g.open).toHaveLength(1)
  })
})

describe('groupByReason', () => {
  it('groups open items by reason in display order, dropping empties', () => {
    const g = groupByReason(F)
    // open items: 1 (research), 2 (look-deeper), 5 (bogus→other)
    expect(g.map((x) => x.key)).toEqual(['research', 'look-deeper', 'other'])
    expect(g[0].items.map((x) => x.id)).toEqual(['1'])
    expect(g[2].items.map((x) => x.id)).toEqual(['5'])
  })
  it('handles nullish', () => {
    expect(groupByReason(null)).toEqual([])
  })
})

describe('reportFollowups', () => {
  it('keeps show_on_report and not-dismissed', () => {
    const r = reportFollowups(F)
    expect(r.map((x) => x.id)).toEqual(['1', '3']) // 4 is dismissed → excluded
  })
  it('handles nullish', () => {
    expect(reportFollowups(null)).toEqual([])
  })
})
