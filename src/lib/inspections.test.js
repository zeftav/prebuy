import { describe, it, expect } from 'vitest'
import { validateInspectionDraft } from './inspections.js'

describe('validateInspectionDraft', () => {
  it('requires a vertical', () => {
    const r = validateInspectionDraft({ identifier: 'N12345' })
    expect(r.valid).toBe(false)
    expect(r.error).toMatch(/inspecting/i)
  })

  it('rejects a bad identifier for the chosen vertical', () => {
    const r = validateInspectionDraft({ vertical: 'aviation', identifier: 'bogus' })
    expect(r.valid).toBe(false)
  })

  it('normalizes a valid aviation draft', () => {
    const r = validateInspectionDraft({
      vertical: 'aviation',
      identifier: ' n172sp ',
      make: '  Cessna ',
      model: '172S',
      customerName: '  Jane Doe ',
      customerEmail: '',
    })
    expect(r.valid).toBe(true)
    expect(r.value.identifier).toBe('N172SP')
    expect(r.value.make).toBe('Cessna')
    expect(r.value.customer_name).toBe('Jane Doe')
    expect(r.value.customer_email).toBeNull() // empty → null, not ''
  })

  it('coerces year to a number or null', () => {
    expect(validateInspectionDraft({ vertical: 'marine', identifier: 'ABC12345D404', year: '1998' }).value.year).toBe(1998)
    expect(validateInspectionDraft({ vertical: 'marine', identifier: 'ABC12345D404', year: '' }).value.year).toBeNull()
  })

  it('accepts a valid marine draft', () => {
    const r = validateInspectionDraft({ vertical: 'marine', identifier: 'abc12345d404' })
    expect(r.valid).toBe(true)
    expect(r.value.identifier).toBe('ABC12345D404')
  })
})
