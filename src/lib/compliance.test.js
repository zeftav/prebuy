import { describe, it, expect } from 'vitest'
import {
  defaultComplianceItems, normalizeCompliance, addMonths, daysBetween, dueStatus,
  complianceStats, complianceRows, isComplianceEmpty, slugKey,
  mergeScanCompliance, limitsToComplianceItems, mergeScanParts,
} from './compliance.js'

describe('mergeScanParts', () => {
  const items = [
    { key: 'annual', source: 'standard', label: 'Annual inspection', last_date: null, last_tach: null },
    { key: 'custom_fuel_bladders', source: 'mm-scan', label: 'Fuel bladders', basis: 'P/N ABC-123 · 120 mo', last_date: null, last_tach: null },
    { key: 'custom_seat_rails', source: 'mm-scan', label: 'Seat rails', basis: 'MM life limit', last_date: '2024-01-01', last_tach: null },
  ]
  it('fills a life-limited item from a matching part (by label)', () => {
    const { items: out, filled } = mergeScanParts(items, [{ description: 'Left fuel bladder replaced', event_date: '2021-06-01', tach: 2100 }])
    expect(filled).toBe(1)
    const fb = out.find((i) => i.key === 'custom_fuel_bladders')
    expect(fb.last_date).toBe('2021-06-01')
    expect(fb.last_tach).toBe(2100)
  })
  it('matches by part number in the basis', () => {
    const { items: out } = mergeScanParts(items, [{ part_number: 'ABC-123', description: 'bladder', event_date: '2022-02-02' }])
    expect(out.find((i) => i.key === 'custom_fuel_bladders').last_date).toBe('2022-02-02')
  })
  it('does not match standard items or fill with older data', () => {
    const older = mergeScanParts(items, [{ description: 'Seat rails inspected', event_date: '2020-01-01' }])
    expect(older.filled).toBe(0) // 2020 < recorded 2024
    const annual = mergeScanParts(items, [{ description: 'annual', event_date: '2025-01-01' }])
    expect(annual.filled).toBe(0) // standard item skipped
  })
  it('does not mutate input', () => {
    mergeScanParts(items, [{ description: 'Fuel bladders', event_date: '2021-06-01' }])
    expect(items[1].last_date).toBeNull()
  })
})

describe('defaultComplianceItems', () => {
  it('includes the standard IFR + airworthiness set for aviation', () => {
    const keys = defaultComplianceItems({ vertical: 'aviation' }).map((i) => i.key)
    expect(keys).toContain('annual')
    expect(keys).toContain('pitot_static')
    expect(keys).toContain('transponder')
    expect(keys).toContain('elt')
  })
  it('adds the wing-bolt item for Beech aircraft only', () => {
    expect(defaultComplianceItems({ make: 'Beechcraft' }).map((i) => i.key)).toContain('wing_bolts')
    expect(defaultComplianceItems({ make: 'Cessna' }).map((i) => i.key)).not.toContain('wing_bolts')
  })
  it('is empty for non-aviation verticals', () => {
    expect(defaultComplianceItems({ vertical: 'marine' })).toEqual([])
  })
})

describe('addMonths / daysBetween', () => {
  it('adds calendar months', () => {
    expect(addMonths('2024-01-15', 24)).toBe('2026-01-15')
    expect(addMonths('2024-01-31', 1)).toBe('2024-03-02') // JS rolls Feb overflow
  })
  it('returns null on junk', () => {
    expect(addMonths('', 12)).toBeNull()
    expect(addMonths('2024-01-15', 'x')).toBeNull()
  })
  it('counts whole days', () => {
    expect(daysBetween('2024-01-01', '2024-01-31')).toBe(30)
    expect(daysBetween('2024-02-01', '2024-01-01')).toBe(-31)
  })
})

describe('dueStatus', () => {
  const asOfDate = '2026-01-01'
  it('overdue when the calendar due date has passed', () => {
    const s = dueStatus({ interval_months: 24, last_date: '2023-06-01' }, { asOfDate })
    expect(s.dueDate).toBe('2025-06-01')
    expect(s.status).toBe('overdue')
  })
  it('due-soon within the window', () => {
    const s = dueStatus({ interval_months: 12, last_date: '2025-02-01' }, { asOfDate })
    expect(s.status).toBe('due-soon') // due 2026-02-01, ~31 days out
  })
  it('ok when comfortably in the future', () => {
    const s = dueStatus({ interval_months: 24, last_date: '2025-06-01' }, { asOfDate })
    expect(s.status).toBe('ok') // due 2027-06-01
  })
  it('unknown when there is no last-complied data', () => {
    expect(dueStatus({ interval_months: 24 }, { asOfDate }).status).toBe('unknown')
  })
  it('uses the hours track and flags overdue past the tach', () => {
    const s = dueStatus({ interval_hours: 500, last_tach: 1000 }, { currentTach: 1600 })
    expect(s.dueTach).toBe(1500)
    expect(s.status).toBe('overdue')
    expect(s.hoursRemaining).toBe(-100)
  })
  it('worst-of governs when both months and hours apply', () => {
    // Calendar OK (far future) but hours overdue → overdue.
    const item = { interval_months: 24, last_date: '2025-06-01', interval_hours: 500, last_tach: 1000 }
    expect(dueStatus(item, { asOfDate, currentTach: 1600 }).status).toBe('overdue')
  })
  it('treats a bare last_date (no interval) as the due date itself', () => {
    expect(dueStatus({ last_date: '2025-01-01' }, { asOfDate }).status).toBe('overdue')
  })
  it('disabled items are unknown', () => {
    expect(dueStatus({ interval_months: 12, last_date: '2025-12-01', disabled: true }, { asOfDate }).status).toBe('unknown')
  })
})

describe('normalizeCompliance', () => {
  it('merges stored last-complied onto the defaults', () => {
    const attrs = { compliance: { items: [{ key: 'annual', last_date: '2025-05-01' }], current_tach: 2200 } }
    const { items, current_tach } = normalizeCompliance(attrs, { make: 'Beechcraft' })
    const annual = items.find((i) => i.key === 'annual')
    expect(annual.last_date).toBe('2025-05-01')
    expect(annual.source).toBe('standard')
    expect(current_tach).toBe(2200)
    expect(items.find((i) => i.key === 'wing_bolts')).toBeTruthy()
  })
  it('keeps custom / mm-scan items and marks their source', () => {
    const attrs = { compliance: { items: [{ key: 'custom_seat_rails', label: 'Seat rails', source: 'mm-scan', last_tach: 500, interval_hours: 5000 }] } }
    const { items } = normalizeCompliance(attrs)
    const custom = items.find((i) => i.key === 'custom_seat_rails')
    expect(custom.source).toBe('mm-scan')
    expect(custom.interval_hours).toBe(5000)
  })
  it('handles empty attributes', () => {
    const { items } = normalizeCompliance(null)
    expect(items.length).toBeGreaterThan(0) // defaults still present
  })
})

describe('complianceStats / complianceRows / isComplianceEmpty', () => {
  const items = [
    { key: 'a', label: 'A', interval_months: 24, last_date: '2023-01-01' }, // overdue
    { key: 'b', label: 'B', interval_months: 24, last_date: '2025-06-01' }, // ok
    { key: 'c', label: 'C', interval_months: 12 }, // unknown
    { key: 'd', label: 'D', disabled: true, last_date: '2020-01-01' },
  ]
  const ctx = { asOfDate: '2026-01-01' }
  it('tallies by status and skips disabled', () => {
    const s = complianceStats(items, ctx)
    expect(s.overdue).toBe(1)
    expect(s.ok).toBe(1)
    expect(s.unknown).toBe(1)
  })
  it('sorts rows worst-first and drops disabled', () => {
    const rows = complianceRows(items, ctx)
    expect(rows.map((r) => r.key)).toEqual(['a', 'c', 'b']) // overdue, unknown, ok; d dropped
  })
  it('detects an empty (nothing-filled) set', () => {
    expect(isComplianceEmpty([{ key: 'x', interval_months: 12 }])).toBe(true)
    expect(isComplianceEmpty([{ key: 'x', last_date: '2025-01-01' }])).toBe(false)
  })
})

describe('mergeScanCompliance', () => {
  const items = [
    { key: 'annual', label: 'Annual inspection', last_date: null, last_tach: null },
    { key: 'transponder', label: 'Transponder', last_date: '2024-01-01', last_tach: null },
  ]
  it('fills a blank item from the scan (by key)', () => {
    const { items: out, filled } = mergeScanCompliance(items, [{ key: 'annual', label: 'Annual', date: '2025-05-01', tach: 2200 }])
    expect(filled).toBe(1)
    const annual = out.find((i) => i.key === 'annual')
    expect(annual.last_date).toBe('2025-05-01')
    expect(annual.last_tach).toBe(2200)
  })
  it('only updates when the scan is newer', () => {
    const older = mergeScanCompliance(items, [{ key: 'transponder', date: '2023-06-01', tach: 0 }])
    expect(older.filled).toBe(0) // 2023 < recorded 2024
    const newer = mergeScanCompliance(items, [{ key: 'transponder', date: '2025-02-01' }])
    expect(newer.filled).toBe(1)
    expect(newer.items.find((i) => i.key === 'transponder').last_date).toBe('2025-02-01')
  })
  it('matches by fuzzy label when no key', () => {
    const { filled, items: out } = mergeScanCompliance(items, [{ key: '', label: 'annual', date: '2025-03-01' }])
    expect(filled).toBe(1)
    expect(out.find((i) => i.key === 'annual').last_date).toBe('2025-03-01')
  })
  it('does not mutate the input', () => {
    mergeScanCompliance(items, [{ key: 'annual', date: '2025-05-01' }])
    expect(items[0].last_date).toBeNull()
  })
})

describe('limitsToComplianceItems', () => {
  it('maps MM limits to mm-scan compliance items', () => {
    const out = limitsToComplianceItems([
      { label: 'Fuel bladder', part_number: 'ABC-123', limit_hours: 0, limit_cycles: 0, limit_months: 120, note: '' },
      { label: 'Seat rails', part_number: '', limit_hours: 5000, limit_cycles: 300, limit_months: 0, note: 'inspect' },
    ])
    expect(out).toHaveLength(2)
    expect(out[0].source).toBe('mm-scan')
    expect(out[0].interval_months).toBe(120)
    expect(out[0].basis).toContain('ABC-123')
    expect(out[1].interval_hours).toBe(5000)
    expect(out[1].basis).toContain('300 cycles')
  })
  it('skips entries without a label', () => {
    expect(limitsToComplianceItems([{ label: '', limit_hours: 100 }])).toEqual([])
  })
})

describe('slugKey', () => {
  it('slugs a label into a custom key', () => {
    expect(slugKey('Seat Rails')).toBe('custom_seat_rails')
    expect(slugKey('')).toBe('custom_item')
  })
})
