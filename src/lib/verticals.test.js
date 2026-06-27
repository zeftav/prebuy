import { describe, it, expect } from 'vitest'
import { validateIdentifier, getVertical, VERTICAL_OPTIONS } from './verticals.js'

describe('VERTICAL_OPTIONS', () => {
  it('offers aviation, marine and home, aviation first', () => {
    expect(VERTICAL_OPTIONS.map((v) => v.key)).toEqual(['aviation', 'marine', 'home'])
  })
})

describe('getVertical', () => {
  it('returns config for a known vertical', () => {
    expect(getVertical('aviation').identifierLabel).toBe('N-number')
  })
  it('returns null for unknown', () => {
    expect(getVertical('spaceship')).toBeNull()
  })
})

describe('validateIdentifier — aviation (N-number)', () => {
  it('uppercases and strips spaces', () => {
    const r = validateIdentifier('aviation', '  n123ab ')
    expect(r.valid).toBe(true)
    expect(r.value).toBe('N123AB')
  })
  it('rejects values not starting with N', () => {
    expect(validateIdentifier('aviation', '12345').valid).toBe(false)
  })
  it('rejects too-long tail numbers', () => {
    expect(validateIdentifier('aviation', 'N1234567').valid).toBe(false)
  })
  it('rejects empty', () => {
    expect(validateIdentifier('aviation', '   ').valid).toBe(false)
  })
})

describe('validateIdentifier — marine (HIN)', () => {
  it('accepts a 12-char HIN, normalized', () => {
    const r = validateIdentifier('marine', 'abc12345d404')
    expect(r.valid).toBe(true)
    expect(r.value).toBe('ABC12345D404')
  })
  it('rejects wrong length', () => {
    expect(validateIdentifier('marine', 'ABC123').valid).toBe(false)
  })
  it('rejects punctuation', () => {
    expect(validateIdentifier('marine', 'ABC-1234-5D40').valid).toBe(false)
  })
})

describe('validateIdentifier — home / relaxed vertical', () => {
  it('accepts any non-empty value and keeps spaces + case (address)', () => {
    const r = validateIdentifier('home', '  123 Main St, Springfield IL ')
    expect(r.valid).toBe(true)
    expect(r.value).toBe('123 Main St, Springfield IL') // trimmed, not upper-cased / despaced
  })
  it('rejects empty', () => {
    expect(validateIdentifier('home', '   ').valid).toBe(false)
  })
})
