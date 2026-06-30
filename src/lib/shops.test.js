import { describe, it, expect } from 'vitest'
import { validateShopName, slugifyShopName, pickActiveOrg, normalizeOrgType, accountTypeLabel, isBrokerOnly, showsModePicker, defaultMode } from './shops.js'

describe('account type helpers', () => {
  it('normalizeOrgType keeps valid, defaults the rest to inspector', () => {
    expect(normalizeOrgType('broker')).toBe('broker')
    expect(normalizeOrgType('both')).toBe('both')
    expect(normalizeOrgType('inspector')).toBe('inspector')
    expect(normalizeOrgType('nonsense')).toBe('inspector')
    expect(normalizeOrgType(undefined)).toBe('inspector')
  })
  it('accountTypeLabel maps known + falls back', () => {
    expect(accountTypeLabel('broker')).toBe('Broker / seller')
    expect(accountTypeLabel('bogus')).toBe('Inspection shop')
  })
  it('isBrokerOnly only for broker', () => {
    expect(isBrokerOnly('broker')).toBe(true)
    expect(isBrokerOnly('both')).toBe(false)
    expect(isBrokerOnly('inspector')).toBe(false)
  })
  it('showsModePicker only for both', () => {
    expect(showsModePicker('both')).toBe(true)
    expect(showsModePicker('broker')).toBe(false)
    expect(showsModePicker('inspector')).toBe(false)
  })
  it('defaultMode: broker → listing, else inspection', () => {
    expect(defaultMode('broker')).toBe('listing')
    expect(defaultMode('both')).toBe('inspection')
    expect(defaultMode('inspector')).toBe('inspection')
  })
})

describe('validateShopName', () => {
  it('trims and collapses internal whitespace', () => {
    const r = validateShopName('  Zefting   Aviation  ')
    expect(r.valid).toBe(true)
    expect(r.value).toBe('Zefting Aviation')
    expect(r.error).toBeNull()
  })

  it('rejects too-short names', () => {
    const r = validateShopName(' a ')
    expect(r.valid).toBe(false)
    expect(r.error).toMatch(/at least/i)
  })

  it('rejects too-long names', () => {
    const r = validateShopName('x'.repeat(61))
    expect(r.valid).toBe(false)
    expect(r.error).toMatch(/under/i)
  })

  it('handles null/undefined without throwing', () => {
    expect(validateShopName(null).valid).toBe(false)
    expect(validateShopName(undefined).valid).toBe(false)
  })

  it('accepts a name exactly at the minimum length', () => {
    expect(validateShopName('Hi').valid).toBe(true)
  })
})

describe('slugifyShopName', () => {
  it('lowercases and hyphenates', () => {
    expect(slugifyShopName('Zefting Aviation')).toBe('zefting-aviation')
  })

  it('strips punctuation and collapses separators', () => {
    expect(slugifyShopName("Bob's A&P  Shop!!")).toBe('bob-s-a-p-shop')
  })

  it('trims leading/trailing hyphens', () => {
    expect(slugifyShopName('  --Hangar 9--  ')).toBe('hangar-9')
  })

  it('returns empty string for empty-ish input', () => {
    expect(slugifyShopName('')).toBe('')
    expect(slugifyShopName(null)).toBe('')
  })
})

describe('pickActiveOrg', () => {
  it('returns null with no memberships', () => {
    expect(pickActiveOrg([])).toBeNull()
    expect(pickActiveOrg(null)).toBeNull()
  })

  it('prefers owner over admin over mechanic', () => {
    const m = [
      { id: '1', role: 'mechanic', created_at: '2026-01-03' },
      { id: '2', role: 'owner', created_at: '2026-01-01' },
      { id: '3', role: 'admin', created_at: '2026-01-02' },
    ]
    expect(pickActiveOrg(m).id).toBe('2')
  })

  it('breaks role ties by most-recent created_at', () => {
    const m = [
      { id: 'old', role: 'owner', created_at: '2026-01-01' },
      { id: 'new', role: 'owner', created_at: '2026-02-01' },
    ]
    expect(pickActiveOrg(m).id).toBe('new')
  })
})
