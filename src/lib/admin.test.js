import { describe, it, expect } from 'vitest'
import { formatUsd, formatCount, daysSince, relativeTime, engagementFlag } from './admin.js'

const NOW = Date.parse('2026-06-28T12:00:00Z')
const daysAgo = (n) => new Date(NOW - n * 86400000).toISOString()

describe('formatUsd', () => {
  it('shows cents under $100, whole dollars above', () => {
    expect(formatUsd(4.2)).toBe('$4.20')
    expect(formatUsd(1234)).toBe('$1,234')
  })
  it('handles zero, negatives and invalid', () => {
    expect(formatUsd(0)).toBe('$0')
    expect(formatUsd(-12.5)).toBe('-$12.50')
    expect(formatUsd(null)).toBe('—')
    expect(formatUsd('x')).toBe('—')
  })
})

describe('formatCount', () => {
  it('adds thousands separators, null-safe', () => {
    expect(formatCount(12345)).toBe('12,345')
    expect(formatCount(0)).toBe('0')
    expect(formatCount(null)).toBe('—')
  })
})

describe('daysSince', () => {
  it('counts whole days, floors, null for missing/invalid', () => {
    expect(daysSince(daysAgo(3), NOW)).toBe(3)
    expect(daysSince(daysAgo(0), NOW)).toBe(0)
    expect(daysSince(null, NOW)).toBe(null)
    expect(daysSince('nope', NOW)).toBe(null)
  })
})

describe('relativeTime', () => {
  it('phrases recent and older times', () => {
    expect(relativeTime(null, NOW)).toBe('Never')
    expect(relativeTime(daysAgo(0), NOW)).toBe('Today')
    expect(relativeTime(daysAgo(1), NOW)).toBe('Yesterday')
    expect(relativeTime(daysAgo(5), NOW)).toBe('5 days ago')
    expect(relativeTime(daysAgo(75), NOW)).toBe('2 months ago')
  })
})

describe('engagementFlag', () => {
  it('flags a brand-new shop with no inspections as warn', () => {
    expect(engagementFlag({ inspection_count: 0, created_at: daysAgo(2) }, NOW)).toEqual({
      level: 'warn',
      reason: 'New — no inspections yet',
    })
  })
  it('flags an old empty shop as risk', () => {
    expect(engagementFlag({ inspection_count: 0, created_at: daysAgo(40) }, NOW)).toEqual({
      level: 'risk',
      reason: 'Never active',
    })
  })
  it('flags long-idle as risk and medium-idle as warn', () => {
    expect(engagementFlag({ inspection_count: 5, last_active: daysAgo(45) }, NOW)).toEqual({
      level: 'risk',
      reason: 'Inactive 45d',
    })
    expect(engagementFlag({ inspection_count: 5, last_active: daysAgo(20) }, NOW)).toEqual({
      level: 'warn',
      reason: 'Quiet 20d',
    })
  })
  it('treats recently-active shops as ok', () => {
    expect(engagementFlag({ inspection_count: 5, last_active: daysAgo(2) }, NOW)).toEqual({
      level: 'ok',
      reason: 'Active',
    })
  })
})
