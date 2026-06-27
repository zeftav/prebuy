// Guided inspection detail. Loads the inspection, instantiates its checklist from
// the matching global template on first open, and walks the items in financial-
// risk order (risk.js). Each item: mark ok/monitor/discrepancy/na, dictate a note
// (Web Speech), and "Clean up with AI" → the structure-finding edge fn (Claude)
// turns the raw dictation into a customer-facing finding + suggested severity/status.

import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Plane, Ship, ChevronLeft, Mic, Sparkles, Camera, Images, X } from 'lucide-react'
import { getInspection, ensureInspectionItems, updateInspectionItem } from '../lib/checklist.js'
import { orderByFinancialRisk, riskBand } from '../lib/risk.js'
import { getVertical } from '../lib/verticals.js'
import { useDictation } from '../lib/dictation.js'
import { structureFinding } from '../lib/findings.js'
import { uploadMedia, listMedia, deleteMedia } from '../lib/media.js'
import './auth.css'
import './inspections.css'

const STATUSES = [
  { key: 'ok', label: 'OK' },
  { key: 'monitor', label: 'Monitor' },
  { key: 'discrepancy', label: 'Discrepancy' },
  { key: 'na', label: 'N/A' },
]

export default function InspectionDetail() {
  const { id } = useParams()
  const [inspection, setInspection] = useState(null)
  const [items, setItems] = useState([])
  const [media, setMedia] = useState([])
  const [state, setState] = useState('loading') // loading | ready | error | notfound
  const [note, setNote] = useState(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data: insp, error } = await getInspection(id)
      if (!active) return
      if (error) return setState('error')
      if (!insp) return setState('notfound')
      setInspection(insp)
      const res = await ensureInspectionItems(insp)
      if (!active) return
      if (res.error) return setState('error')
      setItems(res.data)
      if (res.templateMatched === false) setNote('no-template')
      setState('ready')
      const { data: m } = await listMedia(insp.id)
      if (active) setMedia(m)
    })()
    return () => {
      active = false
    }
  }, [id])

  async function refreshMedia() {
    const { data } = await listMedia(id)
    setMedia(data)
  }

  const ordered = useMemo(() => orderByFinancialRisk(items), [items])
  const reviewed = items.filter((i) => i.status && i.status !== 'pending').length

  // Optimistic patch with revert-on-failure.
  async function patchItem(item, patch) {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, ...patch } : i)))
    const { error } = await updateInspectionItem(item.id, patch)
    if (error) setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)))
  }

  function setItemStatus(item, status) {
    const next = status === item.status ? 'pending' : status // tap again to clear
    patchItem(item, { status: next })
  }

  if (state === 'loading') {
    return (
      <main className="auth-pending" aria-busy="true">
        <p>Loading inspection…</p>
      </main>
    )
  }
  if (state === 'notfound') {
    return (
      <main className="auth">
        <div className="auth__error">Inspection not found.</div>
        <Link to="/app" className="auth__toggle">← Back to inspections</Link>
      </main>
    )
  }
  if (state === 'error') {
    return (
      <main className="auth">
        <div className="auth__error" role="alert">Couldn’t load this inspection.</div>
        <button className="auth__btn auth__btn--ghost" onClick={() => window.location.reload()}>Retry</button>
      </main>
    )
  }

  const cfg = getVertical(inspection.vertical) ?? getVertical('aviation')
  const subtitle = [inspection.year, inspection.make, inspection.model].filter(Boolean).join(' ')

  return (
    <main className="insp">
      <Link to="/app" className="auth__toggle">
        <ChevronLeft size={15} aria-hidden="true" /> Inspections
      </Link>

      <div className="insp__detailhead">
        <span className="insp__icon" aria-hidden="true">
          {cfg.key === 'marine' ? <Ship size={22} /> : <Plane size={22} />}
        </span>
        <div>
          <h1 className="insp__detailid">{inspection.identifier}</h1>
          <p className="insp__detailsub">
            {[subtitle, inspection.attributes?.serial ? `S/N ${inspection.attributes.serial}` : null, inspection.customer_name]
              .filter(Boolean)
              .join(' · ') || 'Draft inspection'}
          </p>
        </div>
        <span className={`insp__status insp__status--${inspection.status}`}>{inspection.status}</span>
      </div>

      <div className="insp__progress">
        <span>{reviewed} of {items.length} items reviewed</span>
        <span className="auth__hint">Worked highest financial risk first.</span>
      </div>

      <Link to={`/app/inspections/${inspection.id}/overview`} className="auth__btn auth__btn--ghost insp__walkthrough">
        <Images size={15} aria-hidden="true" /> Photo walkthrough
      </Link>

      {note === 'no-template' && (
        <div className="auth__notice">
          No checklist template matched {subtitle || 'this aircraft'} yet, so this inspection has no items.
          A matching template needs seeding for its make/model.
        </div>
      )}

      <ol className="insp__items">
        {ordered.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            media={media.filter((m) => m.inspection_item_id === item.id)}
            inspection={inspection}
            onStatus={setItemStatus}
            onPatch={patchItem}
            onMediaChange={refreshMedia}
          />
        ))}
      </ol>
    </main>
  )
}

function ItemRow({ item, media, inspection, onStatus, onPatch, onMediaChange }) {
  const [open, setOpen] = useState(false)
  const [findings, setFindings] = useState(item.findings ?? '')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const dict = useDictation()
  const band = riskBand(item)
  const isDiscrepancy = item.status === 'discrepancy'

  async function addPhoto(file) {
    if (!file) return
    setPhotoBusy(true)
    const { error } = await uploadMedia({
      orgId: inspection.org_id,
      inspectionId: inspection.id,
      inspectionItemId: item.id,
      purpose: 'discrepancy',
      file,
    })
    setPhotoBusy(false)
    if (!error) onMediaChange()
  }

  async function removePhoto(row) {
    await deleteMedia(row)
    onMediaChange()
  }

  // While dictating, mirror the live transcript into the findings field.
  useEffect(() => {
    if (dict.listening) {
      setFindings([dict.transcript, dict.interim].filter(Boolean).join(' ').trim())
    }
  }, [dict.transcript, dict.interim, dict.listening])

  function toggleMic() {
    if (dict.listening) {
      dict.stop()
      const text = dict.transcript.trim()
      if (text) onPatch(item, { findings: text, transcript: text })
    } else {
      setOpen(true)
      dict.setTranscript(findings)
      dict.start()
    }
  }

  async function cleanUp() {
    setAiError(null)
    setAiBusy(true)
    const { data, error } = await structureFinding(findings, item.title)
    setAiBusy(false)
    if (error) return setAiError(error.message)
    setFindings(data.finding)
    onPatch(item, {
      findings: data.finding,
      transcript: item.transcript || findings || null,
      severity: data.severity,
      status: data.suggested_status,
    })
  }

  function saveFindings() {
    const v = findings.trim()
    if (v === (item.findings ?? '')) return
    onPatch(item, { findings: v || null })
  }

  return (
    <li className={`insp__item insp__item--${item.status || 'pending'}`}>
      <div className="insp__itemhead">
        <span className={`insp__riskdot insp__riskdot--${band}`} title={`Risk: ${band}`} aria-label={`Risk ${band}`} />
        <button type="button" className="insp__itemtitle" onClick={() => setOpen((o) => !o)}>
          <span className="insp__itemcat">{item.category}</span>
          <span>{item.title}</span>
        </button>
      </div>

      <div className="insp__statusrow" role="group" aria-label={`Status for ${item.title}`}>
        {STATUSES.map((s) => (
          <button
            key={s.key}
            type="button"
            className={`insp__statusbtn ${item.status === s.key ? `is-${s.key}` : ''}`}
            aria-pressed={item.status === s.key}
            onClick={() => onStatus(item, s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {(open || isDiscrepancy || item.findings) && (
        <div className="insp__itembody">
          {item.description && <p className="insp__itemdesc">{item.description}</p>}

          <div className="insp__capture">
            {dict.supported && (
              <button
                type="button"
                className={`insp__capturebtn ${dict.listening ? 'is-live' : ''}`}
                onClick={toggleMic}
              >
                <Mic size={15} aria-hidden="true" />
                {dict.listening ? 'Stop' : 'Dictate'}
              </button>
            )}
            <button
              type="button"
              className="insp__capturebtn"
              onClick={cleanUp}
              disabled={aiBusy || !findings.trim()}
            >
              <Sparkles size={15} aria-hidden="true" />
              {aiBusy ? 'Cleaning…' : 'Clean up with AI'}
            </button>
            <label className="insp__capturebtn">
              <Camera size={15} aria-hidden="true" />
              {photoBusy ? 'Uploading…' : 'Add photo'}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                disabled={photoBusy}
                onChange={(e) => addPhoto(e.target.files?.[0])}
              />
            </label>
          </div>

          {media.length > 0 && (
            <div className="insp__thumbs">
              {media.map((m) => (
                <span key={m.id} className="insp__thumbwrap">
                  {m.url && <img className="insp__thumb" src={m.url} alt="finding" loading="lazy" />}
                  <button type="button" className="insp__thumbdel" onClick={() => removePhoto(m)} aria-label="Remove photo">
                    <X size={12} aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {dict.listening && <span className="auth__hint">Listening… speak your note.</span>}
          {!dict.supported && <span className="auth__hint">Dictation isn’t supported on this browser — type your note.</span>}
          {aiError && <span className="auth__hint">{aiError}</span>}

          <textarea
            className="insp__findings"
            placeholder={isDiscrepancy ? 'Describe the discrepancy…' : 'Notes / findings (optional)'}
            value={findings}
            onChange={(e) => setFindings(e.target.value)}
            onBlur={saveFindings}
            rows={isDiscrepancy ? 3 : 2}
          />

          {isDiscrepancy && typeof item.severity === 'number' && (
            <span className="auth__hint">AI severity estimate: {item.severity}/100</span>
          )}
        </div>
      )}
    </li>
  )
}
