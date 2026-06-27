import { describe, it, expect } from 'vitest'
import { validatePassword, passwordsMatch, PASSWORD_MIN } from './password.js'

describe('validatePassword', () => {
  it('rejects passwords shorter than the minimum', () => {
    const r = validatePassword('a'.repeat(PASSWORD_MIN - 1))
    expect(r.valid).toBe(false)
    expect(r.error).toMatch(/at least/i)
  })

  it('accepts a password at exactly the minimum', () => {
    expect(validatePassword('a'.repeat(PASSWORD_MIN)).valid).toBe(true)
  })

  it('handles null/undefined without throwing', () => {
    expect(validatePassword(null).valid).toBe(false)
    expect(validatePassword(undefined).valid).toBe(false)
  })
})

describe('passwordsMatch', () => {
  it('is true for identical non-empty strings', () => {
    expect(passwordsMatch('hunter2!', 'hunter2!')).toBe(true)
  })

  it('is false when they differ', () => {
    expect(passwordsMatch('hunter2!', 'hunter3!')).toBe(false)
  })

  it('is false when empty (never matches blanks)', () => {
    expect(passwordsMatch('', '')).toBe(false)
    expect(passwordsMatch(null, null)).toBe(false)
  })
})
