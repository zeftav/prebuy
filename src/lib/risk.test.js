import { describe, it, expect } from 'vitest'
import { riskScore, orderByFinancialRisk } from './risk.js'

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
