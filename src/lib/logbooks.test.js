import { describe, it, expect } from 'vitest'
import { summarizeKind, reconcileLogbooks, groupLabel, cleanDraftValue, chunk, mergeExtractDrafts } from './logbooks.js'

const groupBy = (groups, key) => groups.find((g) => g.key === key)

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
    const { groups, issues } = reconcileLogbooks([
      book(0, 1000),
      book(1300, 1800), // airframe gap
      { kind: 'engine', start_tach: 0, end_tach: 800 },
    ])
    expect(groupBy(groups, 'airframe').summary.count).toBe(2)
    expect(groupBy(groups, 'engine').summary.count).toBe(1)
    expect(issues.some((i) => i.kind === 'airframe' && i.type === 'gap')).toBe(true)
  })

  it('returns no issues for a clean set', () => {
    const { issues } = reconcileLogbooks([book(0, 1000), book(1000, 2000)])
    expect(issues).toHaveLength(0)
  })

  it('splits engine/prop books by position on a twin and reconciles each separately', () => {
    const { groups, issues } = reconcileLogbooks(
      [
        { kind: 'engine', position: 1, start_tach: 0, end_tach: 1000 },
        { kind: 'engine', position: 2, start_tach: 0, end_tach: 1000 },
        { kind: 'engine', position: 2, start_tach: 1300, end_tach: 1800 }, // gap on #2 only
      ],
      { engineCount: 2, layout: 'conventional' },
    )
    expect(groupBy(groups, 'engine:1').summary.gaps).toHaveLength(0)
    expect(groupBy(groups, 'engine:2').summary.gaps).toHaveLength(1)
    expect(groupBy(groups, 'engine:1').label).toBe('Engine #1 (Left)')
    expect(issues).toHaveLength(1)
    expect(issues[0].message).toContain('Engine #2 (Right)')
  })

  it('keeps engine books in one group when single-engine', () => {
    const { groups } = reconcileLogbooks(
      [{ kind: 'engine', position: 1, start_tach: 0, end_tach: 800 }],
      { engineCount: 1 },
    )
    expect(groupBy(groups, 'engine').summary.count).toBe(1)
  })
})

describe('groupLabel', () => {
  it('labels positional kinds on a twin, plain otherwise', () => {
    expect(groupLabel('engine', 1, 2, 'conventional')).toBe('Engine #1 (Left)')
    expect(groupLabel('propeller', 2, 2, 'centerline')).toBe('Prop #2 (Rear)')
    expect(groupLabel('engine', null, 2)).toBe('Engine (unassigned)')
    expect(groupLabel('engine', 1, 1)).toBe('Engine') // single-engine
    expect(groupLabel('airframe', null, 2)).toBe('Airframe')
  })
})

describe('chunk', () => {
  it('splits into chunks of size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })
  it('exact multiple', () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]])
  })
  it('size >= length → single chunk', () => {
    expect(chunk([1, 2], 10)).toEqual([[1, 2]])
  })
  it('coerces bad size to 1 and handles nullish', () => {
    expect(chunk([1, 2], 0)).toEqual([[1], [2]])
    expect(chunk(null, 3)).toEqual([])
  })
})

describe('mergeExtractDrafts', () => {
  it('concatenates logbooks and events across batches', () => {
    const merged = mergeExtractDrafts([
      { logbooks: [{ kind: 'airframe' }], events: [{ title: 'A' }] },
      { logbooks: [{ kind: 'engine' }], events: [{ title: 'B' }, { title: 'C' }] },
    ])
    expect(merged.logbooks).toHaveLength(2)
    expect(merged.events.map((e) => e.title)).toEqual(['A', 'B', 'C'])
  })
  it('tolerates missing/null arrays and nullish input', () => {
    expect(mergeExtractDrafts([{ logbooks: null }, {}, null])).toEqual({ logbooks: [], events: [] })
    expect(mergeExtractDrafts(null)).toEqual({ logbooks: [], events: [] })
  })
})
