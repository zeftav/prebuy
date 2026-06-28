import { describe, it, expect } from 'vitest'
import { sanitizeFilename, mediaStoragePath, mediaKind } from './media.js'

describe('sanitizeFilename', () => {
  it('strips path and unsafe characters', () => {
    expect(sanitizeFilename('/var/tmp/My Photo (1).JPG')).toBe('My_Photo__1_.JPG')
  })
  it('falls back for empty input', () => {
    expect(sanitizeFilename('')).toBe('photo')
    expect(sanitizeFilename(null)).toBe('photo')
  })
  it('keeps the tail of a very long name', () => {
    const out = sanitizeFilename('a'.repeat(200) + '.jpg')
    expect(out.length).toBeLessThanOrEqual(64)
    expect(out.endsWith('.jpg')).toBe(true)
  })
})

describe('mediaStoragePath', () => {
  it('paths by org then inspection', () => {
    expect(mediaStoragePath('org1', 'insp1', 'x.jpg')).toBe('org1/insp1/x.jpg')
  })
})

describe('mediaKind', () => {
  it('detects video, photo, and document', () => {
    expect(mediaKind('video/mp4')).toBe('video')
    expect(mediaKind('image/jpeg')).toBe('photo')
    expect(mediaKind('application/pdf')).toBe('document')
    expect(mediaKind(undefined)).toBe('document') // unknown → treat as a document, not a photo
  })
})
