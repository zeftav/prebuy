import { describe, it, expect } from 'vitest'
import { isBeech, emptyGearRig, normalizeGearRig, gearRigStats, isGearRigEmpty, gearRigRowKeys } from './gearrig.js'

describe('isBeech', () => {
  it('matches Beech variants', () => {
    expect(isBeech('Beechcraft')).toBe(true)
    expect(isBeech('BEECH')).toBe(true)
    expect(isBeech('Beechcraft Bonanza')).toBe(true)
    expect(isBeech('Cessna')).toBe(false)
    expect(isBeech('')).toBe(false)
    expect(isBeech(null)).toBe(false)
  })
})

describe('emptyGearRig / gearRigRowKeys', () => {
  it('has a slot for every parameter', () => {
    const e = emptyGearRig()
    const keys = gearRigRowKeys()
    expect(keys.length).toBe(15)
    expect(Object.keys(e.rows).sort()).toEqual([...keys].sort())
  })
})

describe('normalizeGearRig', () => {
  it('fills missing + sanitizes status', () => {
    const n = normalizeGearRig({ rows: { up_uplock_cable: { measured: '57', status: 'X', remarks: 'ok' } } })
    expect(n.rows.up_uplock_cable).toEqual({ measured: '57', status: '', remarks: 'ok' })
    expect(n.rows.dn_nose_knee).toEqual({ measured: '', status: '', remarks: '' })
  })
  it('handles nullish', () => {
    expect(normalizeGearRig(null).rows.up_vbrace).toEqual({ measured: '', status: '', remarks: '' })
  })
})

describe('gearRigStats', () => {
  it('counts pass/fail/done', () => {
    const s = gearRigStats({ rows: { up_vbrace: { status: 'P' }, dn_main_knee: { status: 'F' }, cl_inner_door: { measured: '0.55' } } })
    expect(s).toMatchObject({ pass: 1, fail: 1, done: 3, total: 15 })
  })
})

describe('isGearRigEmpty', () => {
  it('true when nothing entered', () => {
    expect(isGearRigEmpty(null)).toBe(true)
    expect(isGearRigEmpty(emptyGearRig())).toBe(true)
  })
  it('false when a row or header has data', () => {
    expect(isGearRigEmpty({ rows: { up_vbrace: { status: 'P' } } })).toBe(false)
    expect(isGearRigEmpty({ header: { serial: 'E-212' } })).toBe(false)
  })
})
