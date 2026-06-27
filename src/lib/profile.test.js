import { describe, it, expect } from 'vitest'
import {
  emptyProfile,
  normalizeProfile,
  isProfileEmpty,
  formatSpecValue,
  profileRows,
  currencyStatus,
  SPEC_FIELDS,
  CURRENCY_FIELDS,
} from './profile.js'

describe('normalizeProfile', () => {
  it('returns the canonical empty shape for junk input', () => {
    expect(normalizeProfile(null)).toEqual(emptyProfile())
    expect(normalizeProfile('nope')).toEqual(emptyProfile())
    expect(normalizeProfile(42)).toEqual(emptyProfile())
  })

  it('coerces values to trimmed strings and keeps only known spec keys', () => {
    const n = normalizeProfile({ specs: { total_time: 4200, junk: 'x' } })
    expect(n.specs.total_time).toBe('4200')
    expect('junk' in n.specs).toBe(false)
  })

  it('drops blank damage and equipment rows but keeps partial ones', () => {
    const n = normalizeProfile({
      damage: [{ date: '', summary: '', affected: '' }, { date: '2018', summary: 'bird strike' }],
      equipment: { avionics: [{ name: 'GTN 750', notes: '' }, { name: '', notes: '' }], additional: [] },
    })
    expect(n.damage).toHaveLength(1)
    expect(n.damage[0].summary).toBe('bird strike')
    expect(n.equipment.avionics).toHaveLength(1)
    expect(n.equipment.avionics[0].name).toBe('GTN 750')
  })
})

describe('isProfileEmpty', () => {
  it('is true for empty / junk, false once any field is set', () => {
    expect(isProfileEmpty(null)).toBe(true)
    expect(isProfileEmpty(emptyProfile())).toBe(true)
    expect(isProfileEmpty({ specs: { total_time: '4200' } })).toBe(false)
    expect(isProfileEmpty({ summary: 'Clean airplane' })).toBe(false)
    expect(isProfileEmpty({ equipment: { avionics: [{ name: 'GTN 750' }] } })).toBe(false)
  })
})

describe('formatSpecValue', () => {
  it('adds a suffix only for purely numeric values', () => {
    expect(formatSpecValue('4200', ' hrs')).toBe('4200 hrs')
    expect(formatSpecValue('850.5', ' hrs')).toBe('850.5 hrs')
    expect(formatSpecValue('RAM to new limits', ' hrs')).toBe('RAM to new limits')
    expect(formatSpecValue('', ' hrs')).toBe('')
  })
})

describe('profileRows', () => {
  it('returns only fields with values, labeled and suffixed', () => {
    const rows = profileRows({ specs: { total_time: '4200', engine_notes: 'new cams' } }, SPEC_FIELDS)
    expect(rows).toEqual([
      { key: 'total_time', label: 'Total time', value: '4200 hrs' },
      { key: 'engine_notes', label: 'Engine notes', value: 'new cams' },
    ])
  })

  it('reads from the currency bag for CURRENCY_FIELDS', () => {
    const rows = profileRows({ currency: { annual_due: '2026-04' } }, CURRENCY_FIELDS)
    expect(rows).toHaveLength(1)
    expect(rows[0].label).toBe('Annual due')
  })
})

describe('currencyStatus', () => {
  const today = new Date('2026-06-27T00:00:00')
  it('returns null for empty/unparseable', () => {
    expect(currencyStatus('', today)).toBe(null)
    expect(currencyStatus('soon-ish', today)).toBe(null)
  })
  it('flags past dates overdue', () => {
    expect(currencyStatus('2026-01', today)).toBe('overdue')
    expect(currencyStatus('2026-06-01', today)).toBe('overdue')
  })
  it('flags within 60 days as due-soon', () => {
    expect(currencyStatus('2026-07-15', today)).toBe('due-soon')
  })
  it('treats YYYY-MM as end of that month', () => {
    // June 2026 ends 06-30, which is after the 27th → due-soon, not overdue.
    expect(currencyStatus('2026-06', today)).toBe('due-soon')
  })
  it('flags far-out dates ok', () => {
    expect(currencyStatus('2027-01', today)).toBe('ok')
  })
})
