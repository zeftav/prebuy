import { describe, it, expect } from 'vitest'
import { summarizeKind, reconcileLogbooks, groupLabel, cleanDraftValue, chunk, mergeExtractDrafts, spanFromDrafts, mergeSpan, searchRecords, orderLogbooks, duplicateEvents, offsetDraftPages } from './logbooks.js'

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

describe('orderLogbooks', () => {
  it('orders airframe books chronologically regardless of scan order', () => {
    const books = [
      { id: 'd', kind: 'airframe', start_tach: 3000 },
      { id: 'a', kind: 'airframe', start_tach: 5 },
      { id: 'c', kind: 'airframe', start_tach: 2000 },
      { id: 'b', kind: 'airframe', start_tach: 1000 },
    ]
    expect(orderLogbooks(books).map((b) => b.id)).toEqual(['a', 'b', 'c', 'd'])
  })
  it('groups by kind first (airframe before engine before AD)', () => {
    const books = [
      { id: 'ad', kind: 'ad', start_tach: null },
      { id: 'eng', kind: 'engine', start_tach: 10 },
      { id: 'af', kind: 'airframe', start_tach: 500 },
    ]
    expect(orderLogbooks(books).map((b) => b.id)).toEqual(['af', 'eng', 'ad'])
  })
  it('sinks untimed books to the end of their group', () => {
    const books = [
      { id: 'untimed', kind: 'airframe', start_tach: null },
      { id: 'first', kind: 'airframe', start_tach: 100 },
    ]
    expect(orderLogbooks(books).map((b) => b.id)).toEqual(['first', 'untimed'])
  })
  it('is a pure copy (does not mutate input)', () => {
    const books = [{ id: 'b', kind: 'airframe', start_tach: 2 }, { id: 'a', kind: 'airframe', start_tach: 1 }]
    orderLogbooks(books)
    expect(books.map((b) => b.id)).toEqual(['b', 'a'])
  })
})

describe('offsetDraftPages', () => {
  it('shifts positive page numbers on events and parts', () => {
    const draft = {
      events: [{ title: 'A', page: 1 }, { title: 'B', page: 3 }],
      parts: [{ part_number: 'X', page: 2 }],
    }
    const out = offsetDraftPages(draft, 12)
    expect(out.events.map((e) => e.page)).toEqual([13, 15])
    expect(out.parts[0].page).toBe(14)
  })
  it('leaves 0 / missing page as 0', () => {
    const out = offsetDraftPages({ events: [{ title: 'A', page: 0 }, { title: 'B' }], parts: [] }, 12)
    expect(out.events.map((e) => e.page)).toEqual([0, 0])
  })
  it('tolerates nullish drafts', () => {
    expect(offsetDraftPages(null, 5)).toEqual({ events: [], parts: [] })
  })
})

describe('duplicateEvents', () => {
  it('groups identical entries (same category/title/date/tach) as duplicates', () => {
    const events = [
      { id: '1', category: 'ad', title: 'AD 2015-19-07', event_date: '2020-01-01', tach: 1000 },
      { id: '2', category: 'ad', title: 'ad 2015-19-07', event_date: '2020-01-01', tach: 1000 }, // dup (case-insensitive)
      { id: '3', category: 'overhaul', title: 'Engine OH', event_date: '2019-01-01', tach: 800 },
    ]
    const dups = duplicateEvents(events)
    expect(dups).toHaveLength(1)
    expect(dups[0].map((e) => e.id).sort()).toEqual(['1', '2'])
  })
  it('returns nothing when all events are distinct', () => {
    const events = [
      { id: '1', category: 'ad', title: 'A', event_date: '2020-01-01', tach: 1 },
      { id: '2', category: 'ad', title: 'B', event_date: '2020-01-01', tach: 2 },
    ]
    expect(duplicateEvents(events)).toEqual([])
  })
  it('tolerates empty/null', () => {
    expect(duplicateEvents(null)).toEqual([])
  })
})

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

  it('flags a book with no readable times (can\'t place in sequence)', () => {
    const { issues } = reconcileLogbooks([
      book(0, 1000),
      { kind: 'airframe', label: 'Book 2', start_tach: null, end_tach: null },
    ])
    const untimed = issues.filter((i) => i.type === 'untimed')
    expect(untimed).toHaveLength(1)
    expect(untimed[0].message).toContain('Book 2')
  })

  it('flags airframe coverage when the earliest entry is well above zero', () => {
    const { issues } = reconcileLogbooks([book(1200, 2400)])
    expect(issues.some((i) => i.type === 'coverage')).toBe(true)
  })

  it('does NOT flag coverage when airframe starts near zero', () => {
    const { issues } = reconcileLogbooks([book(2, 1500)])
    expect(issues.some((i) => i.type === 'coverage')).toBe(false)
  })

  it('does NOT flag coverage for an engine/prop that starts later (replacement)', () => {
    const { issues } = reconcileLogbooks([{ kind: 'engine', start_tach: 1500, end_tach: 2400 }], { engineCount: 1 })
    expect(issues.some((i) => i.type === 'coverage')).toBe(false)
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
  it('also concatenates the unclear notes', () => {
    const merged = mergeExtractDrafts([
      { logbooks: [], events: [], unclear: ['SMOH smudged'] },
      { logbooks: [], events: [], unclear: ['last date unreadable'] },
    ])
    expect(merged.unclear).toEqual(['SMOH smudged', 'last date unreadable'])
  })
  it('tolerates missing/null arrays and nullish input', () => {
    expect(mergeExtractDrafts([{ logbooks: null }, {}, null])).toEqual({ logbooks: [], events: [], unclear: [], parts: [], compliance: [], limits: [] })
    expect(mergeExtractDrafts(null)).toEqual({ logbooks: [], events: [], unclear: [], parts: [], compliance: [], limits: [] })
  })
})

describe('spanFromDrafts', () => {
  it('takes earliest start and latest end across batch drafts', () => {
    const span = spanFromDrafts([
      { start_date: '2015-03-01', start_tach: 1200, end_date: '2018-01-01', end_tach: 1900 },
      { start_date: '2012-06-01', start_tach: 800, end_date: '2016-09-01', end_tach: 1600 },
    ])
    expect(span).toEqual({ start_date: '2012-06-01', start_tach: 800, end_date: '2018-01-01', end_tach: 1900 })
  })
  it('treats 0 tach and blanks as missing (via cleanDraftValue)', () => {
    const span = spanFromDrafts([{ start_date: '', start_tach: 0, end_date: '2020-01-01', end_tach: 2400 }])
    expect(span).toEqual({ start_date: null, start_tach: null, end_date: '2020-01-01', end_tach: 2400 })
  })
  it('handles nullish', () => {
    expect(spanFromDrafts(null)).toEqual({ start_date: null, start_tach: null, end_date: null, end_tach: null })
  })
})

describe('mergeSpan', () => {
  it('widens to the earliest start / latest end', () => {
    const merged = mergeSpan(
      { start_date: '2015-01-01', start_tach: 1000, end_date: '2019-01-01', end_tach: 2000 },
      { start_date: '2013-01-01', start_tach: 1200, end_date: '2020-06-01', end_tach: 1800 },
    )
    expect(merged).toEqual({ start_date: '2013-01-01', start_tach: 1000, end_date: '2020-06-01', end_tach: 2000 })
  })
  it('fills from whichever side has a value', () => {
    expect(mergeSpan({ start_tach: 500 }, { end_tach: 900 })).toEqual({ start_date: null, start_tach: 500, end_date: null, end_tach: 900 })
  })
})

describe('searchRecords', () => {
  const data = {
    events: [
      { id: 'e1', title: 'Left magneto replaced', description: 'Slick 4371', category: 'other' },
      { id: 'e2', title: 'Annual inspection', description: '', category: 'other' },
    ],
    parts: [
      { id: 'p1', part_number: 'SL4371', description: 'Left magneto' },
      { id: 'p2', part_number: '', description: 'Nose tire' },
    ],
  }
  it('returns all when query is blank', () => {
    const r = searchRecords(data, '')
    expect(r.events).toHaveLength(2)
    expect(r.parts).toHaveLength(2)
  })
  it('matches events + parts by text (case-insensitive)', () => {
    const r = searchRecords(data, 'magneto')
    expect(r.events.map((e) => e.id)).toEqual(['e1'])
    expect(r.parts.map((p) => p.id)).toEqual(['p1'])
  })
  it('matches a part number', () => {
    expect(searchRecords(data, 'sl4371').parts.map((p) => p.id)).toEqual(['p1'])
  })
  it('no matches → empty arrays', () => {
    const r = searchRecords(data, 'zzz')
    expect(r.events).toEqual([])
    expect(r.parts).toEqual([])
  })
})

describe('mergeExtractDrafts parts', () => {
  it('concatenates parts across batches', () => {
    const m = mergeExtractDrafts([{ parts: [{ part_number: 'A' }] }, { parts: [{ part_number: 'B' }] }])
    expect(m.parts.map((p) => p.part_number)).toEqual(['A', 'B'])
  })
})
