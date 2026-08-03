import { describe, it, expect } from 'vitest'
import { fanOutTemplateItems, pickTemplate } from './checklist.js'

describe('pickTemplate', () => {
  const T = [
    { id: 'exact', make: 'Beechcraft', model: 'A36TC' },
    { id: 'makewide', make: 'Beechcraft', model: null },
    { id: 'catchall', make: null, model: null },
  ]
  it('prefers an exact model match', () => {
    expect(pickTemplate(T, { make: 'Beechcraft', model: 'A36TC' })?.id).toBe('exact')
  })
  it('falls back to a fuzzy model match', () => {
    expect(pickTemplate([{ id: 'a', model: 'A36' }], { model: 'A36TC' })?.id).toBe('a')
  })
  it('falls back to a make-wide template (no model)', () => {
    expect(pickTemplate(T, { make: 'Beechcraft', model: 'V35B' })?.id).toBe('makewide')
  })
  it('falls back to a catch-all (no make/model)', () => {
    expect(pickTemplate([{ id: 'catchall', make: null, model: null }], { make: 'Cessna', model: '172' })?.id).toBe('catchall')
  })
  it('returns null when nothing matches', () => {
    expect(pickTemplate([{ id: 'x', make: 'Cessna', model: '172' }], { make: 'Piper', model: 'PA28' })).toBeNull()
    expect(pickTemplate([], { make: 'Beech', model: 'A36' })).toBeNull()
  })
  it('carries phase through fanOutTemplateItems', () => {
    const rows = fanOutTemplateItems([{ id: 't1', category: 'Records', title: 'Logs', phase: 1 }], { vertical: 'aviation' })
    expect(rows[0].phase).toBe(1)
  })
})

const T = [
  { id: 'e1', category: 'Engine', title: 'Compression check', sort_order: 70, risk_weight: 90 },
  { id: 'p1', category: 'Propeller', title: 'Blade condition', sort_order: 130, risk_weight: 68 },
  { id: 'r1', category: 'Records', title: 'Logbook continuity', sort_order: 10, risk_weight: 78 },
]

describe('fanOutTemplateItems', () => {
  it('passes through unchanged for single-engine', () => {
    const rows = fanOutTemplateItems(T, { vertical: 'aviation', engineCount: 1 })
    expect(rows).toHaveLength(3)
    expect(rows.map((r) => r.title)).toEqual(['Compression check', 'Blade condition', 'Logbook continuity'])
  })

  it('duplicates Engine/Propeller items per engine on a twin, labeled', () => {
    const rows = fanOutTemplateItems(T, { vertical: 'aviation', engineCount: 2, layout: 'conventional' })
    // 2 engine + 2 prop + 1 records = 5
    expect(rows).toHaveLength(5)
    const titles = rows.map((r) => r.title)
    expect(titles).toContain('Compression check — Engine #1 (Left)')
    expect(titles).toContain('Compression check — Engine #2 (Right)')
    expect(titles).toContain('Blade condition — Prop #1 (Left)')
    expect(titles).toContain('Logbook continuity') // non-positional unchanged
  })

  it('uses front/rear labels for a centerline twin', () => {
    const rows = fanOutTemplateItems([T[0]], { vertical: 'aviation', engineCount: 2, layout: 'centerline' })
    expect(rows.map((r) => r.title)).toEqual(['Compression check — Engine #1 (Front)', 'Compression check — Engine #2 (Rear)'])
  })

  it('keeps copies adjacent via sort_order', () => {
    const rows = fanOutTemplateItems([T[0]], { vertical: 'aviation', engineCount: 2 })
    expect(rows.map((r) => r.sort_order)).toEqual([700, 701])
  })

  it('does NOT fan out for non-aviation verticals', () => {
    const marine = [{ id: 'm1', category: 'Engine', title: 'X', sort_order: 10, risk_weight: 50 }]
    expect(fanOutTemplateItems(marine, { vertical: 'marine', engineCount: 2 })).toHaveLength(1)
  })
})
