import { describe, it, expect } from 'vitest'
import { fanOutTemplateItems } from './checklist.js'

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
