// Guided inspection detail. Loads the inspection, instantiates its checklist from
// the matching global template on first open, and walks the items in financial-
// risk order (risk.js). Each item: mark ok/monitor/discrepancy/na, dictate a note
// (Web Speech), and "Clean up with AI" → the structure-finding edge fn (Claude)
// turns the raw dictation into a customer-facing finding + suggested severity/status.

import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Plane, Ship, ChevronLeft, Mic, Sparkles, Images, X, Flag, Plus, Trash2, Share2, Copy, ExternalLink, BookOpen, FileText } from 'lucide-react'
import PhotoPicker from '../components/PhotoPicker.jsx'
import {
  getInspection,
  ensureInspectionItems,
  updateInspectionItem,
  addCustomItem,
  deleteInspectionItem,
} from '../lib/checklist.js'
import { orderByFinancialRisk, riskBand } from '../lib/risk.js'
import { getVertical } from '../lib/verticals.js'
import { useDictation } from '../lib/dictation.js'
import { structureFinding } from '../lib/findings.js'
import { uploadMedia, listMedia, deleteMedia } from '../lib/media.js'
import { updateInspectionMeta } from '../lib/inspections.js'
import { publishInspection, unpublishInspection, reportUrl } from '../lib/report.js'
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

  async function addItem(draft) {
    const { data, error } = await addCustomItem(inspection, draft)
    if (!error && data) setItems((prev) => [...prev, data])
    return error
  }

  async function removeItem(item) {
    setItems((prev) => prev.filter((i) => i.id !== item.id))
    const { error } = await deleteInspectionItem(item.id)
    if (error) setItems((prev) => [...prev, item])
  }

  async function publish() {
    const { data, error } = await publishInspection(inspection.id)
    if (!error && data) {
      setInspection((p) => ({ ...p, status: 'published', published_at: data.published_at, share_token: data.share_token ?? p.share_token }))
    }
  }

  async function unpublish() {
    const { error } = await unpublishInspection(inspection.id)
    if (!error) setInspection((p) => ({ ...p, status: 'in_progress', published_at: null }))
  }

  async function saveMeta(patch) {
    const { data, error } = await updateInspectionMeta(inspection.id, patch)
    if (!error && data) setInspection((p) => ({ ...p, ...data }))
    return error
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

      <InspectionMeta inspection={inspection} onSave={saveMeta} />

      <div className="insp__tools">
        <Link to={`/app/inspections/${inspection.id}/profile`} className="auth__btn auth__btn--ghost insp__walkthrough">
          <FileText size={15} aria-hidden="true" /> {cfg.key === 'marine' ? 'Vessel' : 'Aircraft'} profile
        </Link>
        <Link to={`/app/inspections/${inspection.id}/overview`} className="auth__btn auth__btn--ghost insp__walkthrough">
          <Images size={15} aria-hidden="true" /> Photo walkthrough
        </Link>
        <Link to={`/app/inspections/${inspection.id}/logbooks`} className="auth__btn auth__btn--ghost insp__walkthrough">
          <BookOpen size={15} aria-hidden="true" /> Logbook audit
        </Link>
      </div>

      <PublishBar inspection={inspection} onPublish={publish} onUnpublish={unpublish} />

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
            onRemove={removeItem}
            onMediaChange={refreshMedia}
          />
        ))}
      </ol>

      <AddItem onAdd={addItem} />
    </main>
  )
}

function ItemRow({ item, media, inspection, onStatus, onPatch, onRemove, onMediaChange }) {
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
          <span className="insp__itemcat">
            {item.category}
            {item.owner_priority && <span className="insp__ownertag">★ owner priority</span>}
          </span>
          <span>{item.title}</span>
        </button>
        <button
          type="button"
          className={`insp__flag ${item.owner_priority ? 'is-on' : ''}`}
          onClick={() => onPatch(item, { owner_priority: !item.owner_priority })}
          aria-pressed={item.owner_priority}
          title="Owner priority — float this item to the top"
        >
          <Flag size={15} aria-hidden="true" />
        </button>
        {!item.template_item_id && (
          <button type="button" className="insp__flag" onClick={() => onRemove(item)} aria-label="Remove item" title="Remove custom item">
            <Trash2 size={15} aria-hidden="true" />
          </button>
        )}
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
            <PhotoPicker onPick={(files) => addPhoto(files?.[0])} busy={photoBusy} />
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

function InspectionMeta({ inspection, onSave }) {
  const [editing, setEditing] = useState(false)
  const [f, setF] = useState({
    inspector_name: inspection.inspector_name ?? '',
    location: inspection.location ?? '',
    inspection_date: inspection.inspection_date ?? '',
  })
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }))

  const summary = [
    inspection.inspector_name,
    inspection.location,
    inspection.inspection_date,
  ].filter(Boolean).join(' · ')

  async function save() {
    setBusy(true)
    await onSave(f)
    setBusy(false)
    setEditing(false)
  }

  if (!editing) {
    return (
      <div className="insp__meta">
        <span className="insp__metasummary">
          {summary || 'Add inspector, location & date'}
        </span>
        <button type="button" className="auth__toggle" onClick={() => setEditing(true)}>Edit</button>
      </div>
    )
  }
  return (
    <div className="insp__metaedit">
      <div className="insp__row2">
        <div className="auth__field">
          <label htmlFor="m-inspector">Inspector</label>
          <input id="m-inspector" type="text" placeholder="Name / A&P #" value={f.inspector_name} onChange={set('inspector_name')} />
        </div>
        <div className="auth__field insp__year">
          <label htmlFor="m-date">Date</label>
          <input id="m-date" type="date" value={f.inspection_date} onChange={set('inspection_date')} />
        </div>
      </div>
      <div className="auth__field">
        <label htmlFor="m-loc">Location</label>
        <input id="m-loc" type="text" placeholder="e.g. KPKV, Port Lavaca TX" value={f.location} onChange={set('location')} />
      </div>
      <div className="insp__capture">
        <button type="button" className="auth__btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" className="auth__btn auth__btn--ghost" onClick={() => setEditing(false)}>Cancel</button>
      </div>
    </div>
  )
}

function PublishBar({ inspection, onPublish, onUnpublish }) {
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const published = inspection.status === 'published'
  const link = reportUrl(inspection.share_token)

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked — the field is selectable as a fallback */
    }
  }

  async function act(fn) {
    setBusy(true)
    await fn()
    setBusy(false)
  }

  if (!published) {
    return (
      <div className="insp__publish">
        <div>
          <strong>Share with your customer</strong>
          <p className="auth__hint">Publish to create a read-only report link (and PDF).</p>
        </div>
        <button type="button" className="auth__btn" disabled={busy} onClick={() => act(onPublish)}>
          <Share2 size={15} aria-hidden="true" /> {busy ? 'Publishing…' : 'Publish report'}
        </button>
      </div>
    )
  }

  return (
    <div className="insp__publish is-published">
      <div className="insp__publishtop">
        <span className="insp__status insp__status--published">published</span>
        <a href={link} target="_blank" rel="noreferrer" className="auth__toggle">
          View report <ExternalLink size={13} aria-hidden="true" />
        </a>
      </div>
      <div className="insp__sharebar">
        <input readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Share link" />
        <button type="button" className="insp__capturebtn" onClick={copy}>
          <Copy size={14} aria-hidden="true" /> {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <button type="button" className="auth__toggle" disabled={busy} onClick={() => act(onUnpublish)}>
        Unpublish
      </button>
    </div>
  )
}

// Priority bands map to a risk weight so custom items slot into the risk order.
const PRIORITY_BANDS = [
  { key: 'high', label: 'High', weight: 85 },
  { key: 'medium', label: 'Medium', weight: 55 },
  { key: 'low', label: 'Low', weight: 25 },
]

function AddItem({ onAdd }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('')
  const [band, setBand] = useState('medium')
  const [owner, setOwner] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  if (!open) {
    return (
      <button type="button" className="auth__btn auth__btn--ghost insp__walkthrough" onClick={() => setOpen(true)}>
        <Plus size={15} aria-hidden="true" /> Add item
      </button>
    )
  }

  async function submit(e) {
    e.preventDefault()
    setError(null)
    if (!title.trim()) return setError('Give the item a title.')
    setBusy(true)
    const weight = PRIORITY_BANDS.find((b) => b.key === band)?.weight ?? 55
    const err = await onAdd({ title, category, risk_weight: weight, owner_priority: owner })
    setBusy(false)
    if (err) return setError(err.message)
    setTitle('')
    setCategory('')
    setBand('medium')
    setOwner(false)
    setOpen(false)
  }

  return (
    <form className="auth__form insp__additem" onSubmit={submit}>
      <div className="auth__field">
        <label htmlFor="add-title">New item</label>
        <input id="add-title" type="text" placeholder="e.g. Owner asked: check the de-ice boots" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="insp__row2">
        <div className="auth__field">
          <label htmlFor="add-cat">Category</label>
          <input id="add-cat" type="text" placeholder="Custom" value={category} onChange={(e) => setCategory(e.target.value)} />
        </div>
        <div className="auth__field">
          <label htmlFor="add-band">Priority</label>
          <select id="add-band" value={band} onChange={(e) => setBand(e.target.value)}>
            {PRIORITY_BANDS.map((b) => (
              <option key={b.key} value={b.key}>{b.label}</option>
            ))}
          </select>
        </div>
      </div>
      <label className="insp__ownercheck">
        <input type="checkbox" checked={owner} onChange={(e) => setOwner(e.target.checked)} />
        Owner-requested priority (float to top)
      </label>
      {error && <div className="auth__error" role="alert">{error}</div>}
      <div className="insp__capture">
        <button type="submit" className="auth__btn" disabled={busy}>{busy ? 'Adding…' : 'Add item'}</button>
        <button type="button" className="auth__btn auth__btn--ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  )
}
