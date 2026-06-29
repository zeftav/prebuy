import { describe, it, expect } from 'vitest'
import { normalizeRotation, rotateStep, reorderUpdates } from './logbookpdf.js'

describe('normalizeRotation', () => {
  it('snaps to 0/90/180/270', () => {
    expect(normalizeRotation(0)).toBe(0)
    expect(normalizeRotation(90)).toBe(90)
    expect(normalizeRotation(270)).toBe(270)
    expect(normalizeRotation(360)).toBe(0)
    expect(normalizeRotation(450)).toBe(90)
    expect(normalizeRotation(-90)).toBe(270)
  })
  it('rounds odd values to the nearest quarter turn', () => {
    expect(normalizeRotation(100)).toBe(90)
    expect(normalizeRotation(46)).toBe(90)
  })
  it('handles bad input', () => {
    expect(normalizeRotation('x')).toBe(0)
    expect(normalizeRotation(null)).toBe(0)
  })
})

describe('rotateStep', () => {
  it('advances 90° clockwise and wraps', () => {
    expect(rotateStep(0)).toBe(90)
    expect(rotateStep(90)).toBe(180)
    expect(rotateStep(270)).toBe(0)
  })
})

describe('reorderUpdates', () => {
  it('returns only rows whose sort_order differs from its index', () => {
    const rows = [
      { id: 'a', sort_order: 0 },
      { id: 'b', sort_order: 5 }, // → 1
      { id: 'c', sort_order: 2 },
    ]
    expect(reorderUpdates(rows)).toEqual([{ id: 'b', sort_order: 1 }])
  })
  it('a neighbor swap on a numbered list writes just the two moved', () => {
    // Started [0,1,2,3], swapped indices 1 and 2 → array order is now b? no:
    // after swapping rows at positions 1 and 2, the row formerly at 2 sits at idx 1.
    const rows = [
      { id: 'a', sort_order: 0 },
      { id: 'c', sort_order: 2 },
      { id: 'b', sort_order: 1 },
      { id: 'd', sort_order: 3 },
    ]
    expect(reorderUpdates(rows)).toEqual([
      { id: 'c', sort_order: 1 },
      { id: 'b', sort_order: 2 },
    ])
  })
  it('handles nullish', () => {
    expect(reorderUpdates(null)).toEqual([])
  })
})
