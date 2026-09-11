import { describe, it, expect } from 'vitest'
import { isHeic, jpegName } from './heic.js'

describe('isHeic', () => {
  it('detects by MIME type', () => {
    expect(isHeic({ type: 'image/heic', name: 'x' })).toBe(true)
    expect(isHeic({ type: 'image/heif', name: 'x' })).toBe(true)
    expect(isHeic({ type: 'image/jpeg', name: 'x.jpg' })).toBe(false)
  })
  it('detects by extension when the MIME is missing (iOS often omits it)', () => {
    expect(isHeic({ type: '', name: 'IMG_1234.HEIC' })).toBe(true)
    expect(isHeic({ type: '', name: 'photo.heif' })).toBe(true)
    expect(isHeic({ type: '', name: 'photo.png' })).toBe(false)
  })
  it('is null-safe', () => {
    expect(isHeic(null)).toBe(false)
    expect(isHeic({})).toBe(false)
  })
})

describe('jpegName', () => {
  it('swaps the heic/heif extension for .jpg', () => {
    expect(jpegName('IMG_1234.HEIC')).toBe('IMG_1234.jpg')
    expect(jpegName('a.heif')).toBe('a.jpg')
  })
  it('handles a name without an extension', () => {
    expect(jpegName('photo')).toBe('photo.jpg')
    expect(jpegName('')).toBe('photo.jpg')
  })
})
