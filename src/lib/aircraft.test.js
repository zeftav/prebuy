import { describe, it, expect } from 'vitest'
import { normalizeNNumber, shapeAircraft } from './aircraft.js'

describe('normalizeNNumber', () => {
  it('uppercases and strips spaces', () => {
    expect(normalizeNNumber('  n3704a ')).toBe('N3704A')
    expect(normalizeNNumber('n 172 sp')).toBe('N172SP')
  })
  it('handles empty/null', () => {
    expect(normalizeNNumber('')).toBe('')
    expect(normalizeNNumber(null)).toBe('')
  })
})

describe('shapeAircraft', () => {
  it('returns null for a missing row', () => {
    expect(shapeAircraft(null)).toBeNull()
  })

  it('shapes a joined row, title-casing the manufacturer', () => {
    const row = {
      n_number: 'N3704A',
      serial: 'E-212',
      year_mfr: 1970,
      faa_aircraft_ref: { mfr: 'BEECH', model: 'A36' },
    }
    expect(shapeAircraft(row)).toEqual({
      identifier: 'N3704A',
      year: 1970,
      make: 'Beech',
      model: 'A36', // model left verbatim, not title-cased
      serial: 'E-212',
    })
  })

  it('tolerates a row with no ref join', () => {
    const row = { n_number: 'N12345', serial: null, year_mfr: null }
    expect(shapeAircraft(row)).toEqual({
      identifier: 'N12345',
      year: null,
      make: null,
      model: null,
      serial: null,
    })
  })
})
