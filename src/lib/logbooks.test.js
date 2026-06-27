import { describe, it, expect } from 'vitest'
import { summarizeKind, reconcileLogbooks, cleanDraftValue } from './logbooks.js'

describe('cleanDraftValue', () => {
  it('maps empty/zero placeholders to null', () => {
    expect(cleanDraftValue('')).toBeNull()
    expect(cleanDraftValue(0)).toBeNull()
    expect(cleanDraftValue(null)).toBeNull()
  })
  it('keeps real values', () => {
    expect(cleanDraftValue('2020-01-01')).toBe('2020-01-01')
    expect(cleanDraftValue(1200.5)).toBe(1200.5)
  })
})

const book = (start, end, extra = {}) => ({ kind: 'airframe', start_tach: start, end_tach: end, ...extra })

describe('summarizeKind', () => {
  it('sorts by start tach and tracks total hours when continuous', () => {
    const s = summarizeKind([book(1200, 2400), book(0, 1200)])
    expect(s.sorted[0].start_tach).toBe(0)
    expect(s.firstStart).toBe(0)
    expect(s.lastEnd).toBe(2400)
    expect(s.tracked).toBe(2400)
    expect(s.gaps).toHaveLength(0)
    expect(s.overlaps).toHaveLength(0)
  })

  it('detects a gap (possible missing logbook)', () => {
    const s = summarizeKind([book(0, 1000), book(1250, 1800)])
    expect(s.gaps).toHaveLength(1)
    expect(s.gaps[0].hours).toBe(250)
    expect(s.overlaps).toHaveLength(0)
  })

  it('detects an overlap (possible duplicate time)', () => {
    const s = summarizeKind([book(0, 1200), book(1100, 2000)])
    expect(s.overlaps).toHaveLength(1)
    expect(s.overlaps[0].hours).toBe(100)
  })

  it('treats sub-tolerance differences as continuous', () => {
    const s = summarizeKind([book(0, 1000), book(1000.05, 1500)])
    expect(s.gaps).toHaveLength(0)
    expect(s.overlaps).toHaveLength(0)
  })
})

describe('reconcileLogbooks', () => {
  it('groups by kind and reports issues across types', () => {
    const { byKind, issues } = reconcileLogbooks([
      book(0, 1000),
      book(1300, 1800), // airframe gap
      { kind: 'engine', start_tach: 0, end_tach: 800 },
    ])
    expect(byKind.airframe.count).toBe(2)
    expect(byKind.engine.count).toBe(1)
    expect(issues.some((i) => i.kind === 'airframe' && i.type === 'gap')).toBe(true)
  })

  it('returns no issues for a clean set', () => {
    const { issues } = reconcileLogbooks([book(0, 1000), book(1000, 2000)])
    expect(issues).toHaveLength(0)
  })
})
