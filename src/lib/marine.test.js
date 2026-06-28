import { describe, it, expect } from 'vitest'
import { normalizeHIN, inferModelYear, parseHIN, shapeFromHIN } from './marine.js'

describe('normalizeHIN', () => {
  it('uppercases and strips spaces', () => {
    expect(normalizeHIN(' abc 12345 d404 ')).toBe('ABC12345D404')
  })
})

describe('inferModelYear', () => {
  it('reads a 2-digit model year, inferring century', () => {
    expect(inferModelYear('21', 2026)).toBe(2021)
    expect(inferModelYear('98', 2026)).toBe(1998) // 2098 > 2027 → 1998
    expect(inferModelYear('27', 2026)).toBe(2027) // next model year allowed
    expect(inferModelYear('xx', 2026)).toBe(null)
  })
})

describe('parseHIN', () => {
  it('parses a modern 12-char HIN', () => {
    const p = parseHIN('ABC12345D404', 2026) // ...D=Apr build, model year 04
    expect(p.valid).toBe(true)
    expect(p.mic).toBe('ABC')
    expect(p.serial).toBe('12345')
    expect(p.buildMonth).toBe(4) // 'D' → April
    expect(p.modelYear).toBe(2004)
  })
  it('rejects a non-12-char HIN', () => {
    expect(parseHIN('ABC123').valid).toBe(false)
  })
})

describe('shapeFromHIN', () => {
  it('fills builder from MIC, year/serial from the HIN; model stays null', () => {
    const p = parseHIN('ABC12345D404', 2026)
    const shaped = shapeFromHIN(p, { manufacturer: 'Example Boat Works' })
    expect(shaped).toEqual({ identifier: null, make: 'Example Boat Works', model: null, year: 2004, serial: '12345' })
  })
  it('leaves make null when the MIC is unknown', () => {
    const shaped = shapeFromHIN(parseHIN('ABC12345D404', 2026), null)
    expect(shaped.make).toBe(null)
    expect(shaped.year).toBe(2004)
    expect(shaped.serial).toBe('12345')
  })
  it('returns null for an invalid HIN', () => {
    expect(shapeFromHIN({ valid: false }, null)).toBe(null)
  })
})
