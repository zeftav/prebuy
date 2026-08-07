import { describe, it, expect } from 'vitest'
import {
  normalizeItemEstimate, normalizeEstimate, hasEstimate, lineTotal, estimateStats, formatUsd,
} from './estimate.js'

describe('normalizeItemEstimate', () => {
  it('coerces numbers and trims the note; blanks → null', () => {
    expect(normalizeItemEstimate({ labor_hours: '2.5', parts_cost: '400', note: '  seal kit ' }))
      .toEqual({ labor_hours: 2.5, parts_cost: 400, note: 'seal kit' })
    expect(normalizeItemEstimate({})).toEqual({ labor_hours: null, parts_cost: null, note: '' })
    expect(normalizeItemEstimate({ labor_hours: 'x' }).labor_hours).toBeNull()
  })
})

describe('normalizeEstimate', () => {
  it('defaults show_on_report OFF and reads the items map', () => {
    const n = normalizeEstimate({ estimate: { labor_rate: '95', items: { a: { labor_hours: 1 } } } })
    expect(n.labor_rate).toBe(95)
    expect(n.show_on_report).toBe(false)
    expect(n.items.a.labor_hours).toBe(1)
  })
  it('is empty-safe', () => {
    expect(normalizeEstimate(null)).toEqual({ enabled: false, labor_rate: null, show_on_report: false, items: {} })
  })
  it('enabled defaults ON when there is existing data, OFF for a fresh inspection', () => {
    expect(normalizeEstimate({ estimate: { items: { a: { labor_hours: 2 } } } }).enabled).toBe(true)
    expect(normalizeEstimate({ estimate: { labor_rate: 95 } }).enabled).toBe(true)
    expect(normalizeEstimate({ estimate: { items: { a: { note: 'x' } } } }).enabled).toBe(false)
    expect(normalizeEstimate({}).enabled).toBe(false)
  })
  it('respects an explicit enabled flag either way', () => {
    expect(normalizeEstimate({ estimate: { enabled: false, items: { a: { labor_hours: 2 } } } }).enabled).toBe(false)
    expect(normalizeEstimate({ estimate: { enabled: true } }).enabled).toBe(true)
  })
})

describe('hasEstimate', () => {
  it('true only when labor or parts is set', () => {
    expect(hasEstimate({ labor_hours: 1 })).toBe(true)
    expect(hasEstimate({ parts_cost: 50 })).toBe(true)
    expect(hasEstimate({ note: 'x' })).toBe(false)
    expect(hasEstimate({})).toBe(false)
  })
})

describe('lineTotal', () => {
  it('labor_hours × rate + parts', () => {
    expect(lineTotal({ labor_hours: 2, parts_cost: 100 }, 95)).toBe(290)
    expect(lineTotal({ labor_hours: 1.5 }, 100)).toBe(150)
    expect(lineTotal({ parts_cost: 250 }, 95)).toBe(250) // no labor
    expect(lineTotal({}, 95)).toBe(0)
  })
})

describe('estimateStats', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  const estItems = {
    a: { labor_hours: 2, parts_cost: 100 },
    b: { labor_hours: 1, parts_cost: 0 },
    c: { note: 'no numbers' }, // not counted
  }
  it('sums labor hours, labor cost, parts and grand total over estimated items only', () => {
    const s = estimateStats(items, estItems, 95)
    expect(s.count).toBe(2)
    expect(s.laborHours).toBe(3)
    expect(s.laborCost).toBe(285) // 3 hrs × 95
    expect(s.partsCost).toBe(100)
    expect(s.total).toBe(385)
  })
  it('with no rate, labor cost is 0 but parts still count', () => {
    const s = estimateStats(items, estItems, null)
    expect(s.laborCost).toBe(0)
    expect(s.total).toBe(100)
  })
})

describe('formatUsd', () => {
  it('formats dollars and handles blanks', () => {
    expect(formatUsd(1234.5)).toBe('$1,234.50')
    expect(formatUsd(0)).toBe('$0')
    expect(formatUsd(null)).toBe('—')
  })
})
