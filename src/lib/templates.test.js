import { describe, it, expect } from 'vitest'
import { groupByPhase, hasPhases, phaseLabel } from './templates.js'

describe('phaseLabel', () => {
  it('labels 1/2, blank otherwise', () => {
    expect(phaseLabel(1)).toBe('Phase 1')
    expect(phaseLabel(2)).toBe('Phase 2')
    expect(phaseLabel(0)).toBe('')
    expect(phaseLabel(null)).toBe('')
  })
})

describe('hasPhases', () => {
  it('true when any item is phase 1 or 2', () => {
    expect(hasPhases([{ phase: 0 }, { phase: 2 }])).toBe(true)
    expect(hasPhases([{ phase: 0 }, { phase: null }])).toBe(false)
    expect(hasPhases([])).toBe(false)
    expect(hasPhases(null)).toBe(false)
  })
})

describe('groupByPhase', () => {
  it('groups in order 1, 2, then unphased', () => {
    const g = groupByPhase([
      { id: 'a', phase: 2 },
      { id: 'b', phase: 1 },
      { id: 'c', phase: 0 },
      { id: 'd', phase: 1 },
    ])
    expect(g.map((x) => x.phase)).toEqual([1, 2, 0])
    expect(g[0].items.map((i) => i.id)).toEqual(['b', 'd'])
    expect(g[1].items.map((i) => i.id)).toEqual(['a'])
    expect(g[2].items.map((i) => i.id)).toEqual(['c'])
  })
  it('handles nullish', () => {
    expect(groupByPhase(null)).toEqual([])
  })
})
