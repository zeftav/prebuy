// Guided overview photo capture — a prompted, per-vertical shot list taken early
// to document the whole asset for the report (big-picture, not discrepancy). Each
// photo is a media row (purpose='overview', caption=the shot label); a shot can
// hold MORE THAN ONE photo (e.g. several angles of the same area).
//
// Two ways to capture, side by side:
//   • Guided walkthrough (one button) — steps through the required shots one at a
//     time; take one or several per shot, accept/retake as you go, auto-advancing.
//     Best for discrete assets (aircraft/boat/car/RV); homes run the exteriors only.
//   • The per-shot list below — add or remove photos for any single shot directly.

import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Camera, Check, ChevronLeft, Plane, Ship, Play, X, RotateCcw } from 'lucide-react'
import PhotoPicker from '../components/PhotoPicker.jsx'
import { getInspection } from '../lib/checklist.js'
import { getVertical, guidedShots } from '../lib/verticals.js'
import { uploadMedia, listMedia, deleteMedia } from '../lib/media.js'
import './auth.css'
import './inspections.css'

export default function OverviewCapture() {
  const { id } = useParams()
  const [inspection, setInspection] = useState(null)
  const [media, setMedia] = useState([])
  const [state, setState] = useState('loading')
  const [busyShot, setBusyShot] = useState(null)
  const [error, setError] = useState(null)

  // Guided run state.
  const [running, setRunning] = useState(false)
  const [runIdx, setRunIdx] = useState(0)
  const [pending, setPending] = useState(null) // { file, url } awaiting accept
  const [runBusy, setRunBusy] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data: insp, error } = await getInspection(id)
      if (!active) return
      if (error || !insp) return setState('error')
      setInspection(insp)
      const { data } = await listMedia(insp.id)
      if (!active) return
      setMedia(data.filter((m) => m.purpose === 'overview'))
      setState('ready')
    })()
    return () => {
      active = false
    }
  }, [id])

  async function refresh() {
    const { data } = await listMedia(id)
    setMedia(data.filter((m) => m.purpose === 'overview'))
  }

  async function onPick(shot, file) {
    if (!file) return
    setError(null)
    setBusyShot(shot)
    const { error } = await uploadMedia({
      orgId: inspection.org_id,
      inspectionId: inspection.id,
      purpose: 'overview',
      caption: shot,
      file,
    })
    setBusyShot(null)
    if (error) return setError(error.message)
    refresh()
  }

  async function deletePhoto(row) {
    await deleteMedia(row)
    refresh()
  }

  if (state === 'loading') {
    return (
      <main className="auth-pending" aria-busy="true">
        <p>Loading…</p>
      </main>
    )
  }
  if (state === 'error') {
    return (
      <main className="auth">
        <div className="auth__error">Couldn’t load this inspection.</div>
        <Link to="/app" className="auth__toggle">← Back</Link>
      </main>
    )
  }

  const cfg = getVertical(inspection.vertical) ?? getVertical('aviation')
  const shots = cfg.overviewShots ?? []
  // caption → all photos for that shot (a shot can hold several).
  const byShot = new Map()
  for (const m of media) {
    const arr = byShot.get(m.caption) ?? []
    arr.push(m)
    byShot.set(m.caption, arr)
  }
  const photosFor = (shot) => byShot.get(shot) ?? []
  const done = shots.filter((s) => photosFor(s).length > 0).length

  const runShots = guidedShots(cfg.key)
  const currentShot = runShots[runIdx]
  const currentPhotos = currentShot ? photosFor(currentShot) : []

  function clearPending() {
    setPending((p) => {
      if (p?.url) URL.revokeObjectURL(p.url)
      return null
    })
  }
  function startRun() {
    setError(null)
    const firstMissing = runShots.findIndex((s) => photosFor(s).length === 0)
    setRunIdx(firstMissing === -1 ? 0 : firstMissing)
    clearPending()
    setRunning(true)
  }
  function endRun() {
    clearPending()
    setRunning(false)
    setRunIdx(0)
  }
  function advance() {
    clearPending()
    if (runIdx + 1 < runShots.length) setRunIdx(runIdx + 1)
    else endRun()
  }
  function stagePending(file) {
    if (!file) return
    clearPending()
    setPending({ file, url: URL.createObjectURL(file) })
  }
  // Upload the staged photo to the current shot. `andAdvance` moves to the next.
  async function keep(andAdvance) {
    if (!pending) return
    setRunBusy(true)
    setError(null)
    const { error } = await uploadMedia({
      orgId: inspection.org_id,
      inspectionId: inspection.id,
      purpose: 'overview',
      caption: currentShot,
      file: pending.file,
    })
    setRunBusy(false)
    if (error) return setError(error.message)
    clearPending()
    await refresh()
    if (andAdvance) advance()
  }

  return (
    <main className="insp">
      <Link to={`/app/inspections/${id}`} className="auth__toggle">
        <ChevronLeft size={15} aria-hidden="true" /> Inspection
      </Link>

      <div className="auth__heading">
        <h1>
          {cfg.key === 'marine' ? <Ship size={20} aria-hidden="true" /> : <Plane size={20} aria-hidden="true" />}{' '}
          Photo walkthrough
        </h1>
        <p>Work through the shot list — these document the {cfg.noun} for the report. Take more than one per spot if it helps.</p>
      </div>

      <div className="insp__progress">
        <span>{done} of {shots.length} shots</span>
        <span className="auth__hint">Big-picture photos, not discrepancies.</span>
      </div>

      {error && <div className="auth__error" role="alert">{error}</div>}

      {/* ── Guided walkthrough (one button) ──────────────────────────────── */}
      {running ? (
        <section className="insp__run">
          <div className="insp__runhead">
            <span className="insp__runprogress">Shot {runIdx + 1} of {runShots.length}</span>
            <button type="button" className="auth__toggle" onClick={endRun}>
              <X size={14} aria-hidden="true" /> Exit
            </button>
          </div>
          <h2 className="insp__runprompt">{currentShot}</h2>

          {pending ? (
            <>
              <img className="insp__runpreview" src={pending.url} alt={currentShot} />
              <div className="insp__capture">
                <button type="button" className="auth__btn" onClick={() => keep(true)} disabled={runBusy}>
                  <Check size={15} aria-hidden="true" /> {runBusy ? 'Saving…' : 'Keep & continue'}
                </button>
                <button type="button" className="auth__btn auth__btn--ghost" onClick={() => keep(false)} disabled={runBusy}>
                  Keep &amp; add another
                </button>
                <button type="button" className="auth__btn auth__btn--ghost" onClick={clearPending} disabled={runBusy}>
                  <RotateCcw size={15} aria-hidden="true" /> Retake
                </button>
              </div>
            </>
          ) : (
            <>
              {currentPhotos.length > 0 && (
                <>
                  <div className="insp__thumbs">
                    {currentPhotos.map((m) => (
                      <span key={m.id} className="insp__thumbwrap">
                        {m.url && <img className="insp__thumb" src={m.url} alt={currentShot} loading="lazy" />}
                        <button type="button" className="insp__thumbdel" onClick={() => deletePhoto(m)} aria-label="Remove photo">
                          <X size={12} aria-hidden="true" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <p className="auth__hint">{currentPhotos.length} photo{currentPhotos.length > 1 ? 's' : ''} for this shot.</p>
                </>
              )}
              <PhotoPicker
                onPick={(files) => stagePending(files?.[0])}
                takeLabel={currentPhotos.length ? 'Take another' : 'Take photo'}
                uploadLabel="Upload"
              />
              <div className="insp__capture">
                <button type="button" className={`auth__btn ${currentPhotos.length ? '' : 'auth__btn--ghost'}`} onClick={advance}>
                  {currentPhotos.length ? 'Next shot →' : 'Skip this shot'}
                </button>
              </div>
            </>
          )}
        </section>
      ) : (
        runShots.length > 0 && (
          <button type="button" className="auth__btn insp__runstart" onClick={startRun}>
            <Play size={15} aria-hidden="true" /> Start guided walkthrough
          </button>
        )
      )}

      {cfg.guidedCapture === 'exterior' && !running && (
        <p className="auth__hint">
          The walkthrough covers the exterior shots; add interior and system photos from the list below
          (or on each checklist item) as you go.
        </p>
      )}

      <ol className="insp__shotlist">
        {shots.map((shot) => {
          const photos = photosFor(shot)
          const captured = photos.length > 0
          return (
            <li key={shot} className={`insp__shot ${captured ? 'is-done' : ''}`}>
              <div className="insp__shotmain">
                <span className="insp__shotcheck" aria-hidden="true">
                  {captured ? <Check size={16} /> : <Camera size={16} />}
                </span>
                <span className="insp__shotlabel">
                  {shot}
                  {photos.length > 1 && <span className="insp__shotcount"> · {photos.length}</span>}
                </span>
              </div>

              <div className="insp__shotcaptured">
                {photos.map((m) => (
                  <span key={m.id} className="insp__thumbwrap">
                    {m.url && <img className="insp__thumb" src={m.url} alt={shot} loading="lazy" />}
                    <button type="button" className="insp__thumbdel" onClick={() => deletePhoto(m)} aria-label="Remove photo">
                      <X size={12} aria-hidden="true" />
                    </button>
                  </span>
                ))}
                <PhotoPicker
                  onPick={(files) => onPick(shot, files?.[0])}
                  busy={busyShot === shot}
                  takeLabel={captured ? 'Add another' : 'Take photo'}
                  uploadLabel="Upload"
                />
              </div>
            </li>
          )
        })}
      </ol>
    </main>
  )
}
