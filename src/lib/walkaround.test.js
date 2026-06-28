import { describe, it, expect } from 'vitest'
import { itemsContext, buildReviewRows, planApply, acceptedCount } from './walkaround.js'

const ITEMS = [
  { id: 'a1', category: 'Tires & brakes', title: 'Left main tire', risk_weight: 80 },
  { id: 'a2', category: 'Engine', title: 'Oil leaks', risk_weight: 60 },
  { id: 'a3', category: 'Landing gear', title: 'Nose strut', risk_weight: 50 },
]

describe('itemsContext', () => {
  it('compacts items to id/category/title/risk band', () => {
    const ctx = itemsContext(ITEMS)
    expect(ctx[0]).toEqual({ id: 'a1', category: 'Tires & brakes', title: 'Left main tire', risk: 'high' })
    expect(ctx[2].risk).toBe('medium')
  })
  it('handles empty/nullish', () => {
    expect(itemsContext(null)).toEqual([])
    expect(itemsContext([])).toEqual([])
  })
})

describe('buildReviewRows', () => {
  it('resolves a matched finding against an existing item', () => {
    const rows = buildReviewRows(
      [{ item_id: 'a1', status: 'discrepancy', severity: 85, finding: 'Left main tire worn to the cords.', confidence: 'high' }],
      ITEMS,
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      itemId: 'a1',
      category: 'Tires & brakes',
      title: 'Left main tire',
      status: 'discrepancy',
      severity: 85,
      isNew: false,
      accept: true,
    })
  })

  it('treats an unknown item_id as a new item using the suggestions', () => {
    const rows = buildReviewRows(
      [{ item_id: 'nope', suggested_category: 'Brakes', suggested_title: 'Right brake disc', status: 'monitor', severity: 40, finding: 'Right brake disc has a lip.', confidence: 'medium' }],
      ITEMS,
    )
    expect(rows[0].isNew).toBe(true)
    expect(rows[0].itemId).toBeNull()
    expect(rows[0].category).toBe('Brakes')
    expect(rows[0].title).toBe('Right brake disc')
  })

  it('falls back to a derived title/category when suggestions are blank', () => {
    const rows = buildReviewRows(
      [{ item_id: '', status: 'monitor', severity: 30, finding: 'Small oil weep at the left valve cover, worth a look.', confidence: 'low' }],
      ITEMS,
    )
    expect(rows[0].category).toBe('Walk-around')
    expect(rows[0].title.length).toBeGreaterThan(0)
    expect(rows[0].title.length).toBeLessThanOrEqual(61)
  })

  it('clamps severity, defaults bad enums, and rejects empty findings', () => {
    const rows = buildReviewRows(
      [{ item_id: 'a2', status: 'bogus', severity: 999, finding: '', confidence: 'huh' }],
      ITEMS,
    )
    expect(rows[0].severity).toBe(100)
    expect(rows[0].status).toBe('monitor')
    expect(rows[0].confidence).toBe('medium')
    expect(rows[0].accept).toBe(false) // empty finding → off by default
  })

  it('handles nullish input', () => {
    expect(buildReviewRows(null, ITEMS)).toEqual([])
  })
})

describe('planApply', () => {
  it('routes matched rows to patches and new rows to newItems', () => {
    const rows = [
      { key: 'w0', itemId: 'a1', status: 'discrepancy', severity: 85, finding: 'Tire worn.', accept: true },
      { key: 'w1', itemId: null, category: 'Brakes', title: 'Right brake disc', status: 'monitor', severity: 40, finding: 'Disc has a lip.', accept: true },
    ]
    const plan = planApply(rows)
    expect(plan.patches).toEqual([
      { id: 'a1', patch: { status: 'discrepancy', severity: 85, findings: 'Tire worn.', transcript: 'Tire worn.' } },
    ])
    expect(plan.newItems).toHaveLength(1)
    expect(plan.newItems[0].draft).toMatchObject({ category: 'Brakes', title: 'Right brake disc', risk_weight: 40 })
    expect(plan.newItems[0].patch).toMatchObject({ status: 'monitor', severity: 40, findings: 'Disc has a lip.' })
  })

  it('skips unaccepted rows and empty findings', () => {
    const rows = [
      { itemId: 'a1', status: 'ok', severity: 0, finding: 'Fine.', accept: false },
      { itemId: 'a2', status: 'monitor', severity: 20, finding: '   ', accept: true },
    ]
    const plan = planApply(rows)
    expect(plan.patches).toEqual([])
    expect(plan.newItems).toEqual([])
  })

  it('new-item risk_weight floors at 25', () => {
    const plan = planApply([{ itemId: null, category: 'X', title: 'Y', status: 'ok', severity: 5, finding: 'noted', accept: true }])
    expect(plan.newItems[0].draft.risk_weight).toBe(25)
  })

  it('handles nullish input', () => {
    expect(planApply(null)).toEqual({ patches: [], newItems: [] })
  })
})

describe('acceptedCount', () => {
  it('counts accepted rows with a non-empty finding', () => {
    expect(
      acceptedCount([
        { accept: true, finding: 'a' },
        { accept: false, finding: 'b' },
        { accept: true, finding: '  ' },
        { accept: true, finding: 'c' },
      ]),
    ).toBe(2)
  })
  it('handles nullish', () => {
    expect(acceptedCount(null)).toBe(0)
  })
})
