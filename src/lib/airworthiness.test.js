import { describe, it, expect } from 'vitest'
import { normalizeAirworthiness, isAirworthinessItem, airworthinessCount } from './airworthiness.js'

describe('normalizeAirworthiness', () => {
  it('keeps only truthy ids', () => {
    expect(normalizeAirworthiness({ airworthiness: { a: true, b: false, c: true } })).toEqual({ a: true, c: true })
  })
  it('is empty-safe', () => {
    expect(normalizeAirworthiness(null)).toEqual({})
    expect(normalizeAirworthiness({})).toEqual({})
  })
})

describe('isAirworthinessItem', () => {
  it('reports the flag', () => {
    const attrs = { airworthiness: { a: true } }
    expect(isAirworthinessItem(attrs, 'a')).toBe(true)
    expect(isAirworthinessItem(attrs, 'b')).toBe(false)
  })
})

describe('airworthinessCount', () => {
  it('counts flagged discrepancies only', () => {
    const items = [
      { id: 'a', status: 'discrepancy' },
      { id: 'b', status: 'discrepancy' },
      { id: 'c', status: 'monitor' }, // flagged but not a discrepancy → not counted
    ]
    expect(airworthinessCount(items, { a: true, c: true })).toBe(1)
  })
})
