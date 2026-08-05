import { describe, it, expect } from 'vitest'
import {
  isCompressionItem, normalizeCompression, cylinderStatus, compressionStats, isCompressionEmpty, cylinderOrder,
  cylCaption, cylTag,
} from './compression.js'

describe('cylCaption / cylTag', () => {
  it('round-trips a cylinder number through the caption tag', () => {
    expect(cylCaption(3)).toBe('cyl:3')
    expect(cylTag('cyl:3')).toBe(3)
  })
  it('returns null for untagged / plain captions', () => {
    expect(cylTag(null)).toBeNull()
    expect(cylTag('Left magneto photo')).toBeNull()
    expect(cylTag('cylinder 3')).toBeNull()
  })
})

describe('cylinderOrder', () => {
  it('orders odds then evens (1-3-5-2-4-6 on a six)', () => {
    expect(cylinderOrder(6).map((i) => i + 1)).toEqual([1, 3, 5, 2, 4, 6])
  })
  it('handles a four (1-3-2-4)', () => {
    expect(cylinderOrder(4).map((i) => i + 1)).toEqual([1, 3, 2, 4])
  })
  it('handles odd counts and edge cases', () => {
    expect(cylinderOrder(1)).toEqual([0])
    expect(cylinderOrder(0)).toEqual([])
  })
})

describe('isCompressionItem', () => {
  it('matches compression-test items (incl. plural / combined wording)', () => {
    expect(isCompressionItem({ title: 'Differential compression check' })).toBe(true)
    expect(isCompressionItem({ title: 'Cylinder compression & borescope' })).toBe(true)
    expect(isCompressionItem({ title: 'Compression check — Engine #1 (Left)' })).toBe(true)
    expect(isCompressionItem({ title: 'Cylinder compressions' })).toBe(true)
    expect(isCompressionItem({ title: 'Compression/leakdown test' })).toBe(true)
    expect(isCompressionItem({ title: 'Oil filter cut open' })).toBe(false)
  })
  it('does NOT match "compressor" (turbo / A-C compressor)', () => {
    expect(isCompressionItem({ title: 'Check turbo and compressor rotation' })).toBe(false)
    expect(isCompressionItem({ title: 'A/C compressor belt tension' })).toBe(false)
  })
})

describe('normalizeCompression', () => {
  it('defaults to six blank cylinders', () => {
    const n = normalizeCompression(null)
    expect(n.cylinders).toHaveLength(6)
    expect(n.master_orifice).toBe('')
    expect(n.cylinders.every((c) => c.value === '')).toBe(true)
  })
  it('preserves stored values and count', () => {
    const n = normalizeCompression({ master_orifice: '42', cylinders: [{ value: '78' }, { value: '76' }], notes: 'ok' })
    expect(n.cylinders).toHaveLength(2)
    expect(n.cylinders[0].value).toBe('78')
    expect(n.master_orifice).toBe('42')
    expect(n.notes).toBe('ok')
  })
  it('honors a fallback count override', () => {
    expect(normalizeCompression(null, 4).cylinders).toHaveLength(4)
  })
})

describe('cylinderStatus', () => {
  it('flags a cylinder below the master orifice', () => {
    expect(cylinderStatus('40', '42')).toBe('low')
    expect(cylinderStatus('78', '42')).toBe('ok')
  })
  it('is ok when no master orifice is set', () => {
    expect(cylinderStatus('50', '')).toBe('ok')
  })
  it('is unknown with no value', () => {
    expect(cylinderStatus('', '42')).toBe('unknown')
  })
})

describe('compressionStats', () => {
  it('summarizes entered, lowest and low counts', () => {
    const s = compressionStats({ master_orifice: '42', cylinders: [{ value: '78' }, { value: '40' }, { value: '' }, { value: '76' }] })
    expect(s.entered).toBe(3)
    expect(s.total).toBe(4)
    expect(s.lowest).toBe(40)
    expect(s.low).toBe(1)
  })
})

describe('isCompressionEmpty', () => {
  it('true when nothing entered', () => {
    expect(isCompressionEmpty(null)).toBe(true)
    expect(isCompressionEmpty({ cylinders: [{ value: '' }] })).toBe(true)
  })
  it('false once a value exists', () => {
    expect(isCompressionEmpty({ cylinders: [{ value: '78' }] })).toBe(false)
    expect(isCompressionEmpty({ master_orifice: '42' })).toBe(false)
  })
})
