import { describe, it, expect } from 'vitest'
import { compareVersions, hasUnseenRelease } from './version.js'

describe('compareVersions', () => {
  it('orders by major, minor, patch', () => {
    expect(compareVersions('1.0.0', '0.9.9')).toBe(1)
    expect(compareVersions('0.1.0', '0.2.0')).toBe(-1)
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0)
    expect(compareVersions('1.2.10', '1.2.9')).toBe(1)
  })

  it('tolerates missing segments and junk', () => {
    expect(compareVersions('1.2', '1.2.0')).toBe(0)
    expect(compareVersions('1', '1.0.1')).toBe(-1)
    expect(compareVersions('1.x.3', '1.0.3')).toBe(0) // non-numeric segment -> 0
    expect(compareVersions(undefined, '0.0.0')).toBe(0)
  })
})

describe('hasUnseenRelease', () => {
  it('is true when nothing has been seen yet', () => {
    expect(hasUnseenRelease('0.1.0', null)).toBe(true)
    expect(hasUnseenRelease('0.1.0', undefined)).toBe(true)
  })

  it('is true only when the latest is newer than last seen', () => {
    expect(hasUnseenRelease('0.2.0', '0.1.0')).toBe(true)
    expect(hasUnseenRelease('0.1.0', '0.1.0')).toBe(false)
    expect(hasUnseenRelease('0.1.0', '0.2.0')).toBe(false) // downgrade shouldn't nag
  })
})
