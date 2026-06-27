// Web Speech API dictation hook for the inspection capture flow.
//
// iOS Safari support is the known risk (see docs/backlog.md native decision) —
// the hook degrades gracefully: `supported` is false where SpeechRecognition
// isn't available, and callers hide the mic and fall back to typing.
//
// Live transcript only; no audio is stored (locked decision). The raw transcript
// is later sent to the `structure-finding` edge fn → Claude → a clean finding.

import { useCallback, useEffect, useRef, useState } from 'react'

/** Is browser speech recognition available? */
export function isDictationSupported() {
  return (
    typeof window !== 'undefined' &&
    (typeof window.SpeechRecognition !== 'undefined' ||
      typeof window.webkitSpeechRecognition !== 'undefined')
  )
}

/**
 * Fold a SpeechRecognition results list into final + interim text. Pure, so it's
 * unit tested. `results` is array-like of { isFinal, 0: { transcript } }.
 */
export function extractTranscript(results) {
  let final = ''
  let interim = ''
  for (const r of Array.from(results ?? [])) {
    const text = r?.[0]?.transcript ?? ''
    if (r?.isFinal) final += text
    else interim += text
  }
  return { final: final.trim(), interim: interim.trim() }
}

/**
 * Dictation hook. Returns:
 *   { supported, listening, transcript, interim, start, stop, reset, error }
 * `transcript` accumulates finalized speech; `interim` is the in-progress phrase.
 */
export function useDictation() {
  const supported = isDictationSupported()
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [interim, setInterim] = useState('')
  const [error, setError] = useState(null)
  const recRef = useRef(null)
  const baseRef = useRef('') // transcript captured before the current session

  useEffect(() => {
    return () => {
      // Tear down on unmount.
      try {
        recRef.current?.stop()
      } catch {
        /* ignore */
      }
    }
  }, [])

  const start = useCallback(() => {
    if (!supported || listening) return
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    const rec = new SR()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = 'en-US'
    baseRef.current = transcript ? transcript + ' ' : ''

    rec.onresult = (e) => {
      const { final, interim: inProgress } = extractTranscript(e.results)
      setTranscript((baseRef.current + final).trim())
      setInterim(inProgress)
    }
    rec.onerror = (e) => {
      setError(e?.error || 'dictation-error')
      setListening(false)
    }
    rec.onend = () => {
      setListening(false)
      setInterim('')
    }

    recRef.current = rec
    setError(null)
    try {
      rec.start()
      setListening(true)
    } catch {
      setError('start-failed')
    }
  }, [supported, listening, transcript])

  const stop = useCallback(() => {
    try {
      recRef.current?.stop()
    } catch {
      /* ignore */
    }
    setListening(false)
  }, [])

  const reset = useCallback(() => {
    setTranscript('')
    setInterim('')
    setError(null)
  }, [])

  return { supported, listening, transcript, interim, error, start, stop, reset, setTranscript }
}
