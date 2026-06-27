import { describe, it, expect } from 'vitest'
import { extractTranscript } from './dictation.js'

// Mimic the SpeechRecognition results list: array-like of { isFinal, 0:{transcript} }.
const mk = (parts) => parts.map((p) => ({ isFinal: p.final, 0: { transcript: p.text } }))

describe('extractTranscript', () => {
  it('joins finalized parts and trims', () => {
    const r = extractTranscript(mk([
      { final: true, text: 'left brake ' },
      { final: true, text: 'is worn' },
    ]))
    expect(r.final).toBe('left brake is worn')
    expect(r.interim).toBe('')
  })

  it('separates interim (in-progress) text', () => {
    const r = extractTranscript(mk([
      { final: true, text: 'engine compression ' },
      { final: false, text: 'looks a little' },
    ]))
    expect(r.final).toBe('engine compression')
    expect(r.interim).toBe('looks a little')
  })

  it('handles empty/missing input', () => {
    expect(extractTranscript([])).toEqual({ final: '', interim: '' })
    expect(extractTranscript(null)).toEqual({ final: '', interim: '' })
  })
})
