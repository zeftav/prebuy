// CameraCapture — an in-app continuous camera (getUserMedia) for fast multi-page
// scanning. Unlike a file input with capture="environment" (which drops you out to
// the native camera and back for EVERY shot), this keeps a live preview open so
// you tap the shutter once per page and stay put — the right tool for a 100-page
// logbook. Each capture grabs a high-res frame → JPEG File → onCapture(file).
//
// Falls back gracefully: if getUserMedia is unavailable or permission is denied,
// it surfaces a message and the caller still offers the camera-roll upload path.

import { useEffect, useRef, useState } from 'react'
import { Camera, Check } from 'lucide-react'

export default function CameraCapture({ onCapture, onClose, count = 0 }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1920 } },
          audio: false,
        })
        if (!active) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play().catch(() => {})
        }
        setReady(true)
      } catch (e) {
        setError(
          e?.name === 'NotAllowedError'
            ? 'Camera access was blocked. Allow the camera for this site, or use “Add from camera roll”.'
            : 'Couldn’t open the camera on this device — use “Add from camera roll”.',
        )
      }
    })()
    return () => {
      active = false
      streamRef.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  async function snap() {
    const video = videoRef.current
    if (!video || busy || !ready) return
    setBusy(true)
    const w = video.videoWidth || 1280
    const h = video.videoHeight || 960
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d').drawImage(video, 0, 0, w, h)
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.9))
    setBusy(false)
    if (blob) onCapture(new File([blob], `page-${count + 1}.jpg`, { type: 'image/jpeg' }))
  }

  if (error) {
    return (
      <div className="cam cam--error">
        <div className="auth__error" role="alert">{error}</div>
        <button type="button" className="auth__btn auth__btn--ghost" onClick={onClose}>Close camera</button>
      </div>
    )
  }

  return (
    <div className="cam">
      <div className="cam__viewport">
        {/* No audio track + decorative preview → no captions track needed. */}
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video ref={videoRef} playsInline muted className="cam__video" aria-label="Camera preview" />
        {count > 0 && <span className="cam__count" aria-live="polite">{count} captured</span>}
      </div>
      <div className="cam__controls">
        <button type="button" className="auth__btn auth__btn--ghost cam__done" onClick={onClose}>
          <Check size={15} aria-hidden="true" /> Done
        </button>
        <button type="button" className="cam__shutter" onClick={snap} disabled={!ready || busy} aria-label="Capture page">
          <Camera size={26} aria-hidden="true" />
        </button>
        <span className="cam__hint">{ready ? 'Tap to capture each page' : 'Starting camera…'}</span>
      </div>
    </div>
  )
}
