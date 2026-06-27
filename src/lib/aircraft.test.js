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
      faa_aircraft_ref: { mfr: 'BEECH', model: 'A36', num_eng: 1 },
    }
    expect(shapeAircraft(row)).toEqual({
      identifier: 'N3704A',
      year: 1970,
      make: 'Beech',
      model: 'A36', // model left verbatim, not title-cased
      serial: 'E-212',
      engine_count: 1,
    })
  })

  it('reads engine count from num_eng (twin)', () => {
    const row = { n_number: 'N831JB', serial: 'TH-1', year_mfr: 1980, faa_aircraft_ref: { mfr: 'BEECH', model: '58P', num_eng: 2 } }
    expect(shapeAircraft(row).engine_count).toBe(2)
  })

  it('tolerates a row with no ref join', () => {
    const row = { n_number: 'N12345', serial: null, year_mfr: null }
    expect(shapeAircraft(row)).toEqual({
      identifier: 'N12345',
      year: null,
      make: null,
      model: null,
      serial: null,
      engine_count: null,
    })
  })
})
