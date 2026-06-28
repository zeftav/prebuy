import { describe, it, expect } from 'vitest'
import {
  emptyProfile,
  normalizeProfile,
  isProfileEmpty,
  formatSpecValue,
  profileRows,
  currencyStatus,
  draftFromExtraction,
  mergeProfileDraft,
  buildSummaryContext,
  engineLabel,
  propLabel,
  MAX_ENGINES,
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
    const rows = profileRows({ specs: { total_time: '4200', mgtow: '3650' } }, SPEC_FIELDS)
    expect(rows).toEqual([
      { key: 'total_time', label: 'Total time', value: '4200 hrs' },
      { key: 'mgtow', label: 'Max gross weight', value: '3650 lbs' },
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

describe('draftFromExtraction', () => {
  it('stringifies numeric specs/engine, dropping 0 to empty', () => {
    const d = draftFromExtraction({ specs: { total_time: 4200, mgtow: 0, engine_smoh: 850, engine_notes: ' new cams ' } })
    expect(d.specs.total_time).toBe('4200')
    expect(d.specs.mgtow).toBe('')
    expect(d.engine.smoh).toBe('850')
    expect(d.engine.notes).toBe('new cams')
  })
  it('keeps currency strings and filters nameless equipment', () => {
    const d = draftFromExtraction({
      currency: { annual_due: '2026-04' },
      equipment: { avionics: [{ name: 'GTN 750', notes: '' }, { name: '', notes: 'x' }], additional: [] },
    })
    expect(d.currency.annual_due).toBe('2026-04')
    expect(d.equipment.avionics).toHaveLength(1)
  })
  it('is safe on junk', () => {
    expect(draftFromExtraction(null).equipment.additional).toEqual([])
  })
})

describe('mergeProfileDraft', () => {
  it('fills blank specs/currency/engine but never clobbers existing values', () => {
    const profile = { specs: { total_time: '4200' }, currency: { annual_due: '2026-04' }, engines: [{ smoh: '', notes: '' }] }
    const draft = {
      specs: { total_time: '9999', empty_weight: '2350' },
      currency: { annual_due: '2030-01', elt_battery_due: '2027-02' },
      engine: { smoh: '850', notes: '' },
    }
    const merged = mergeProfileDraft(profile, draft)
    expect(merged.specs.total_time).toBe('4200') // kept
    expect(merged.specs.empty_weight).toBe('2350') // filled
    expect(merged.currency.annual_due).toBe('2026-04') // kept
    expect(merged.currency.elt_battery_due).toBe('2027-02') // filled
    expect(merged.engines[0].smoh).toBe('850') // filled engine #1
  })
  it('appends new equipment but dedupes by name (case-insensitive)', () => {
    const profile = { equipment: { avionics: [{ name: 'GTN 750', notes: '' }], additional: [] } }
    const draft = { equipment: { avionics: [{ name: 'gtn 750', notes: 'dup' }, { name: 'GFC 500', notes: 'AP' }], additional: [] } }
    const merged = mergeProfileDraft(profile, draft)
    expect(merged.equipment.avionics).toHaveLength(2)
    expect(merged.equipment.avionics.map((r) => r.name)).toEqual(['GTN 750', 'GFC 500'])
  })
})

describe('multi-engine', () => {
  it('migrates a legacy single-engine profile into engines[0]/props[0]', () => {
    const n = normalizeProfile({ specs: { engine_smoh: '850', engine_notes: 'RAM', prop_since: '320' } })
    expect(n.engine_count).toBe(1)
    expect(n.engines[0]).toEqual({ smoh: '850', notes: 'RAM' })
    expect(n.props[0].since).toBe('320')
    expect('engine_smoh' in n.specs).toBe(false)
  })
  it('sizes engines/props to engine_count (pad + truncate)', () => {
    const n = normalizeProfile({ engine_count: 2, engines: [{ smoh: '100', notes: '' }] })
    expect(n.engines).toHaveLength(2)
    expect(n.props).toHaveLength(2)
    expect(n.engines[1]).toEqual({ smoh: '', notes: '' })
    const m = normalizeProfile({ engine_count: 1, engines: [{ smoh: 'a' }, { smoh: 'b' }] })
    expect(m.engines).toHaveLength(1)
  })
  it('clamps engine_count to 1..MAX', () => {
    expect(normalizeProfile({ engine_count: 99 }).engine_count).toBe(MAX_ENGINES)
    expect(normalizeProfile({ engine_count: 0 }).engine_count).toBe(1)
  })
  it('labels engines/props by layout', () => {
    expect(engineLabel(0, 1)).toBe('Engine')
    expect(engineLabel(0, 2, 'conventional')).toBe('Engine #1 (Left)')
    expect(engineLabel(1, 2, 'conventional')).toBe('Engine #2 (Right)')
    expect(engineLabel(0, 2, 'centerline')).toBe('Engine #1 (Front)')
    expect(engineLabel(1, 2, 'centerline')).toBe('Engine #2 (Rear)')
    expect(propLabel(1, 2, 'centerline')).toBe('Prop #2 (Rear)')
  })
  it('isProfileEmpty accounts for engine data', () => {
    expect(isProfileEmpty({ engine_count: 2 })).toBe(true)
    expect(isProfileEmpty({ engines: [{ smoh: '850' }] })).toBe(false)
  })
})

describe('buildSummaryContext', () => {
  const inspection = {
    vertical: 'aviation',
    identifier: 'N3704A',
    year: 1970,
    make: 'Beechcraft',
    model: 'A36',
    attributes: { serial: 'E-212' },
  }
  it('assembles asset + only non-empty blocks + finding counts', () => {
    const profile = { specs: { total_time: '4200', engine_smoh: '' }, currency: { annual_due: '2026-04' } }
    const events = [{ event_date: '2019-05', category: 'overhaul', title: 'Engine OH', description: 'RAM' }]
    const items = [
      { status: 'discrepancy', category: 'Engine', title: 'Low compression #4', findings: '60/80' },
      { status: 'ok', category: 'Avionics', title: 'GPS', findings: '' },
    ]
    const ctx = buildSummaryContext(inspection, profile, events, items)
    expect(ctx.asset.kind).toBe('aircraft')
    expect(ctx.asset.serial).toBe('E-212')
    expect(ctx.specs).toEqual({ total_time: '4200 hrs' })
    expect('engine_smoh' in ctx.specs).toBe(false)
    expect(ctx.currency.annual_due).toBe('2026-04')
    expect(ctx.notable_maintenance).toHaveLength(1)
    expect(ctx.findings).toHaveLength(1) // only discrepancy/monitor
    expect(ctx.findings_summary).toEqual({ discrepancy: 1, monitor: 0, ok: 1, na: 0 })
  })
  it('omits absent blocks entirely', () => {
    const ctx = buildSummaryContext(inspection, null, [], [])
    expect('specs' in ctx).toBe(false)
    expect('damage' in ctx).toBe(false)
    expect('findings' in ctx).toBe(false)
    expect(ctx.asset.model).toBe('A36')
  })
  it('treats marine as a vessel', () => {
    expect(buildSummaryContext({ vertical: 'marine' }, null, [], []).asset.kind).toBe('vessel')
  })
})

describe('per-vertical profile schema', () => {
  it('marine profile uses vessel specs + engines, not aircraft fields', () => {
    const p = emptyProfile('marine')
    expect(Object.keys(p.specs)).toContain('loa')
    expect(Object.keys(p.specs)).not.toContain('total_time')
    expect(p.engines.length).toBe(1) // boats have engines
    expect(Object.keys(p.currency)).toContain('documentation_due')
    expect(Object.keys(p.currency)).not.toContain('transponder_due')
  })

  it('home profile has no engines and property specs', () => {
    const p = emptyProfile('home')
    expect(p.engines).toEqual([])
    expect(p.props).toEqual([])
    expect(Object.keys(p.specs)).toContain('square_footage')
  })

  it('normalizeProfile keeps only the vertical’s keys', () => {
    // A marine profile that somehow carries an aircraft key drops it.
    const n = normalizeProfile({ specs: { loa: '35', total_time: '4200' } }, 'marine')
    expect(n.specs.loa).toBe('35')
    expect(n.specs.total_time).toBeUndefined()
  })

  it('home isProfileEmpty ignores engines', () => {
    expect(isProfileEmpty({ specs: {} }, 'home')).toBe(true)
    expect(isProfileEmpty({ specs: { square_footage: '2200' } }, 'home')).toBe(false)
  })

  it('buildSummaryContext maps home to property and marine engines generically', () => {
    expect(buildSummaryContext({ vertical: 'home' }, null, [], []).asset.kind).toBe('property')
    const ctx = buildSummaryContext(
      { vertical: 'marine' },
      { engine_count: 1, engines: [{ hours: '1200', notes: 'Yanmar' }] },
      [],
      [],
    )
    expect(ctx.engines[0].hours).toBe('1200')
  })
})
