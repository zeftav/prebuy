import { describe, it, expect } from 'vitest'
import { riskScore, orderByFinancialRisk, orderByChecklist, riskBand } from './risk.js'

describe('orderByFinancialRisk — owner priority', () => {
  it('floats an owner-priority item above higher-risk items in the same status band', () => {
    const items = [
      { id: 'big', status: 'pending', risk_weight: 95, sort_order: 1 },
      { id: 'owner', status: 'pending', risk_weight: 30, sort_order: 2, owner_priority: true },
    ]
    expect(orderByFinancialRisk(items)[0].id).toBe('owner')
  })

  it('still keeps unresolved ahead of resolved, even for owner priorities', () => {
    const items = [
      { id: 'pending-normal', status: 'pending', risk_weight: 40 },
      { id: 'ok-owner', status: 'ok', risk_weight: 90, owner_priority: true },
    ]
    expect(orderByFinancialRisk(items)[0].id).toBe('pending-normal')
  })
})

describe('orderByChecklist', () => {
  it('orders by the checklist sort_order, not by risk', () => {
    const items = [
      { id: 'c', risk_weight: 95, sort_order: 30 },
      { id: 'a', risk_weight: 10, sort_order: 10 },
      { id: 'b', risk_weight: 50, sort_order: 20 },
    ]
    expect(orderByChecklist(items).map((i) => i.id)).toEqual(['a', 'b', 'c'])
  })
  it('does not float unresolved/owner items (keeps sequence)', () => {
    const items = [
      { id: 'first', status: 'ok', sort_order: 1 },
      { id: 'second', status: 'pending', owner_priority: true, sort_order: 2 },
    ]
    expect(orderByChecklist(items).map((i) => i.id)).toEqual(['first', 'second'])
  })
  it('sinks custom items (no sort_order) to the end, heaviest-risk first', () => {
    const items = [
      { id: 'custom-lo', risk_weight: 20 },
      { id: 'tmpl', risk_weight: 5, sort_order: 5 },
      { id: 'custom-hi', risk_weight: 80 },
    ]
    expect(orderByChecklist(items).map((i) => i.id)).toEqual(['tmpl', 'custom-hi', 'custom-lo'])
  })
  it('does not mutate and tolerates junk', () => {
    const input = [{ id: 'x', sort_order: 1 }]
    const copy = [...input]
    orderByChecklist(input)
    expect(input).toEqual(copy)
    expect(orderByChecklist(null)).toEqual([])
  })
})

describe('riskBand', () => {
  it('bands by weight', () => {
    expect(riskBand({ risk_weight: 90 })).toBe('high')
    expect(riskBand({ risk_weight: 75 })).toBe('high')
    expect(riskBand({ risk_weight: 60 })).toBe('medium')
    expect(riskBand({ risk_weight: 45 })).toBe('medium')
    expect(riskBand({ risk_weight: 20 })).toBe('low')
    expect(riskBand({})).toBe('low')
  })
})

describe('riskScore', () => {
  it('is driven mainly by risk_weight', () => {
    expect(riskScore({ risk_weight: 90 })).toBeGreaterThan(riskScore({ risk_weight: 10 }))
  })

  it('boosts a confirmed discrepancy via severity', () => {
    const base = { risk_weight: 50 }
    expect(riskScore({ ...base, severity: 80 })).toBeGreaterThan(riskScore(base))
  })

  it('clamps out-of-range and non-numeric input', () => {
    expect(riskScore({ risk_weight: 999 })).toBe(100)
    expect(riskScore({ risk_weight: -5 })).toBe(0)
    expect(riskScore({ risk_weight: 'oops' })).toBe(0)
    expect(riskScore(null)).toBe(0)
  })
})

describe('orderByFinancialRisk', () => {
  it('puts highest financial risk first', () => {
    const items = [
      { id: 'tire', risk_weight: 10 },
      { id: 'engine', risk_weight: 95 },
      { id: 'avionics', risk_weight: 40 },
    ]
    expect(orderByFinancialRisk(items).map((i) => i.id)).toEqual(['engine', 'avionics', 'tire'])
  })

  it('floats unresolved items above resolved ones regardless of weight', () => {
    const items = [
      { id: 'engine-ok', risk_weight: 95, status: 'ok' },
      { id: 'cabin-pending', risk_weight: 20, status: 'pending' },
    ]
    expect(orderByFinancialRisk(items).map((i) => i.id)).toEqual(['cabin-pending', 'engine-ok'])
  })

  it('uses sort_order as a stable tiebreak', () => {
    const items = [
      { id: 'b', risk_weight: 50, sort_order: 2 },
      { id: 'a', risk_weight: 50, sort_order: 1 },
    ]
    expect(orderByFinancialRisk(items).map((i) => i.id)).toEqual(['a', 'b'])
  })

  it('does not mutate the input and tolerates junk', () => {
    const input = [{ id: 'x', risk_weight: 1 }]
    const copy = [...input]
    orderByFinancialRisk(input)
    expect(input).toEqual(copy)
    expect(orderByFinancialRisk(null)).toEqual([])
  })
})
