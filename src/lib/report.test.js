import { describe, it, expect } from 'vitest'
import { reportSummary } from './report.js'

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
