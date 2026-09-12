import { describe, it, expect } from 'vitest'
import { reportSummary, viewStats } from './report.js'

describe('viewStats', () => {
  it('counts views and finds the most recent timestamp', () => {
    const s = viewStats([
      { viewed_at: '2026-09-10T10:00:00Z' },
      { viewed_at: '2026-09-12T08:00:00Z' },
      { viewed_at: '2026-09-11T12:00:00Z' },
    ])
    expect(s.count).toBe(3)
    expect(s.lastAt).toBe('2026-09-12T08:00:00.000Z')
  })
  it('is empty-safe', () => {
    expect(viewStats([])).toEqual({ count: 0, lastAt: null })
    expect(viewStats(null)).toEqual({ count: 0, lastAt: null })
  })
})

describe('reportSummary', () => {
  it('counts items by status', () => {
    const c = reportSummary([
      { status: 'ok' },
      { status: 'ok' },
      { status: 'discrepancy' },
      { status: 'monitor' },
      { status: 'na' },
      { status: 'pending' },
    ])
    expect(c).toEqual({ discrepancy: 1, monitor: 1, ok: 2, na: 1, pending: 1 })
  })

  it('handles empty/missing input', () => {
    expect(reportSummary([])).toEqual({ discrepancy: 0, monitor: 0, ok: 0, na: 0, pending: 0 })
    expect(reportSummary(null).ok).toBe(0)
  })

  it('ignores unknown statuses safely', () => {
    expect(reportSummary([{ status: 'weird' }, { status: 'ok' }]).ok).toBe(1)
  })
})
