// Guided overview photo capture — a prompted, per-vertical shot list taken early
// to document the whole asset for the report (big-picture, not discrepancy). Each
// shot maps to one media row (purpose='overview', caption=the shot label).

import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Camera, Check, ChevronLeft, Plane, Ship } from 'lucide-react'
import { getInspection } from '../lib/checklist.js'
import { getVertical } from '../lib/verticals.js'
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

  async function onRetake(row, shot) {
    // Replace: delete the old shot then let them pick again.
    await deleteMedia(row)
    refresh()
    setBusyShot(null)
    void shot
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
  const byShot = new Map(media.map((m) => [m.caption, m]))
  const done = shots.filter((s) => byShot.has(s)).length

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
        <p>Work through the shot list — these document the {cfg.noun} for the report.</p>
      </div>

      <div className="insp__progress">
        <span>{done} of {shots.length} shots</span>
        <span className="auth__hint">Big-picture photos, not discrepancies.</span>
      </div>

      {error && <div className="auth__error" role="alert">{error}</div>}

      <ol className="insp__shotlist">
        {shots.map((shot) => {
          const row = byShot.get(shot)
          const captured = Boolean(row)
          return (
            <li key={shot} className={`insp__shot ${captured ? 'is-done' : ''}`}>
              <div className="insp__shotmain">
                <span className="insp__shotcheck" aria-hidden="true">
                  {captured ? <Check size={16} /> : <Camera size={16} />}
                </span>
                <span className="insp__shotlabel">{shot}</span>
              </div>

              {captured ? (
                <div className="insp__shotcaptured">
                  {row.url && <img className="insp__thumb" src={row.url} alt={shot} loading="lazy" />}
                  <button type="button" className="auth__toggle" onClick={() => onRetake(row, shot)}>
                    Retake
                  </button>
                </div>
              ) : (
                <label className="insp__capturebtn">
                  <Camera size={15} aria-hidden="true" />
                  {busyShot === shot ? 'Uploading…' : 'Take photo'}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    hidden
                    disabled={busyShot === shot}
                    onChange={(e) => onPick(shot, e.target.files?.[0])}
                  />
                </label>
              )}
            </li>
          )
        })}
      </ol>
    </main>
  )
}
