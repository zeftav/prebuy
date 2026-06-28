// Logbook audit / research tool. Track an aircraft's records across multiple
// logbooks per type, reconcile time continuity (gaps/overlaps), and capture
// notable events (ADs, 337s, overhauls, prop strikes, damage).
//
// Photo→OCR import is a planned follow-up (see docs/backlog.md); for now entry is
// structured/manual.

import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, BookOpen, AlertTriangle, Plus, Trash2, ScanLine, Check } from 'lucide-react'
import { getInspection } from '../lib/checklist.js'
import {
  listLogbooks, addLogbook, deleteLogbook,
  listEvents, addEvent, deleteEvent,
  reconcileLogbooks, kindLabel, categoryLabel, cleanDraftValue, extractLogbooks,
  LOGBOOK_KINDS, EVENT_CATEGORIES, POSITIONAL_KINDS,
} from '../lib/logbooks.js'
import { normalizeProfile, engineLabel, propLabel } from '../lib/profile.js'
import { uploadMedia, signedUrlsFor } from '../lib/media.js'
import PhotoPicker from '../components/PhotoPicker.jsx'
import './auth.css'
import './inspections.css'

const fmtTach = (v) => (v == null ? '—' : Number(v).toFixed(1))
const fmtRange = (b) =>
  `${b.start_date || '?'} → ${b.end_date || '?'}  ·  tach ${fmtTach(b.start_tach)}–${fmtTach(b.end_tach)}`

export default function LogbookAudit() {
  const { id } = useParams()
  const [inspection, setInspection] = useState(null)
  const [logbooks, setLogbooks] = useState([])
  const [events, setEvents] = useState([])
  const [state, setState] = useState('loading')

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data: insp, error } = await getInspection(id)
      if (!active) return
      if (error || !insp) return setState('error')
      setInspection(insp)
      const [{ data: lb }, { data: ev }] = await Promise.all([listLogbooks(insp.id), listEvents(insp.id)])
      if (!active) return
      setLogbooks(lb)
      setEvents(ev)
      setState('ready')
    })()
    return () => {
      active = false
    }
  }, [id])

  // Engine count/layout drive per-engine reconcile + position pickers. Seed from
  // the FAA-derived attributes when the profile hasn't set a count yet.
  const { engineCount, layout } = useMemo(() => {
    const prof = normalizeProfile(inspection?.attributes?.profile)
    const seeded = Number(inspection?.attributes?.engine_count) || 1
    return { engineCount: Math.max(prof.engine_count, seeded), layout: prof.layout }
  }, [inspection])

  const recon = useMemo(
    () => reconcileLogbooks(logbooks, { engineCount, layout }),
    [logbooks, engineCount, layout],
  )

  async function onAddBook(draft) {
    const { data, error } = await addLogbook(inspection, draft)
    if (!error && data) setLogbooks((p) => [...p, data])
    return error
  }
  async function onDeleteBook(book) {
    setLogbooks((p) => p.filter((b) => b.id !== book.id))
    const { error } = await deleteLogbook(book.id)
    if (error) setLogbooks((p) => [...p, book])
  }
  async function onAddEvent(draft) {
    const { data, error } = await addEvent(inspection, draft)
    if (!error && data) setEvents((p) => [...p, data])
    return error
  }
  async function onDeleteEvent(ev) {
    setEvents((p) => p.filter((e) => e.id !== ev.id))
    const { error } = await deleteEvent(ev.id)
    if (error) setEvents((p) => [...p, ev])
  }

  if (state === 'loading') {
    return (
      <main className="auth-pending" aria-busy="true"><p>Loading…</p></main>
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

  const posLabel = (kind, position) =>
    POSITIONAL_KINDS.includes(kind) && engineCount > 1 && position
      ? (kind === 'propeller' ? propLabel(position - 1, engineCount, layout) : engineLabel(position - 1, engineCount, layout))
      : null

  return (
    <main className="insp">
      <Link to={`/app/inspections/${id}`} className="auth__toggle">
        <ChevronLeft size={15} aria-hidden="true" /> Inspection
      </Link>

      <div className="auth__heading">
        <h1><BookOpen size={20} aria-hidden="true" /> Logbook audit</h1>
        <p>Track records across logbooks, reconcile the times, and note key events.</p>
      </div>

      <ScanImport inspection={inspection} onAddBook={onAddBook} onAddEvent={onAddEvent} />

      {/* Reconciliation */}
      <section className="insp__section">
        <h2>Reconciliation</h2>
        {recon.groups.length === 0 ? (
          <p className="auth__hint">Add logbooks below to reconcile times.</p>
        ) : (
          <div className="lb__recon">
            {recon.groups.map((g) => {
              const s = g.summary
              return (
                <div key={g.key} className="lb__reconrow">
                  <span className="lb__reconkind">{g.label}</span>
                  <span className="lb__recontotal">
                    {s.tracked != null ? `${s.tracked.toFixed(1)} hrs tracked` : '— hrs'}
                    {s.firstStart != null && ` (tach ${fmtTach(s.firstStart)}–${fmtTach(s.lastEnd)})`}
                  </span>
                </div>
              )
            })}
          </div>
        )}
        {recon.issues.length > 0 && (
          <ul className="lb__issues">
            {recon.issues.map((iss, i) => (
              <li key={i} className={`lb__issue lb__issue--${iss.type}`}>
                <AlertTriangle size={14} aria-hidden="true" /> {iss.message}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Logbooks */}
      <section className="insp__section">
        <div className="insp__sectionhead">
          <h2>Logbooks</h2>
        </div>
        {logbooks.length > 0 && (
          <ul className="insp__list">
            {[...logbooks]
              .sort((a, b) => LOGBOOK_KINDS.indexOf(a.kind) - LOGBOOK_KINDS.indexOf(b.kind))
              .map((b) => (
                <li key={b.id} className="insp__row">
                  <span className="insp__main">
                    <span className="insp__id">{b.label || kindLabel(b.kind)}</span>
                    <span className="insp__sub">{posLabel(b.kind, b.position) || kindLabel(b.kind)} · {fmtRange(b)}</span>
                  </span>
                  <button type="button" className="insp__flag" onClick={() => onDeleteBook(b)} aria-label="Delete logbook">
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </li>
              ))}
          </ul>
        )}
        <AddLogbook onAdd={onAddBook} engineCount={engineCount} layout={layout} />
      </section>

      {/* Notable events */}
      <section className="insp__section">
        <div className="insp__sectionhead">
          <h2>Notable events</h2>
        </div>
        {events.length > 0 && (
          <ul className="insp__list">
            {events.map((e) => (
              <li key={e.id} className="insp__row">
                <span className="insp__main">
                  <span className="insp__id">
                    <span className={`lb__cat lb__cat--${e.category}`}>{categoryLabel(e.category)}</span> {e.title}
                  </span>
                  <span className="insp__sub">
                    {[posLabel('engine', e.position), e.event_date, e.tach != null ? `tach ${fmtTach(e.tach)}` : null, e.description]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <button type="button" className="insp__flag" onClick={() => onDeleteEvent(e)} aria-label="Delete event">
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <AddEvent onAdd={onAddEvent} engineCount={engineCount} layout={layout} />
      </section>
    </main>
  )
}

function ScanImport({ inspection, onAddBook, onAddEvent }) {
  const [phase, setPhase] = useState('idle') // idle | working | review
  const [error, setError] = useState(null)
  const [draft, setDraft] = useState({ logbooks: [], events: [] })
  const [pickLb, setPickLb] = useState(new Set())
  const [pickEv, setPickEv] = useState(new Set())
  const [importing, setImporting] = useState(false)

  async function onPick(files) {
    const list = Array.from(files ?? [])
    if (!list.length) return
    setError(null)
    setPhase('working')
    // Upload pages to private storage, then sign for the vision model.
    const paths = []
    for (const f of list) {
      const { data, error } = await uploadMedia({
        orgId: inspection.org_id,
        inspectionId: inspection.id,
        purpose: 'logbook',
        file: f,
      })
      if (!error && data) paths.push(data.storage_path)
    }
    const urls = await signedUrlsFor(paths)
    if (!urls.length) {
      setError('Couldn’t upload the photos. Try again.')
      setPhase('idle')
      return
    }
    const { data, error } = await extractLogbooks(urls, inspection.org_id)
    if (error) {
      setError(error.message)
      setPhase('idle')
      return
    }
    setDraft(data)
    setPickLb(new Set(data.logbooks.map((_, i) => i)))
    setPickEv(new Set(data.events.map((_, i) => i)))
    setPhase('review')
  }

  function toggle(set, setSet, i) {
    const next = new Set(set)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    setSet(next)
  }

  async function doImport() {
    setImporting(true)
    for (const i of pickLb) {
      const d = draft.logbooks[i]
      await onAddBook({
        kind: d.kind,
        label: cleanDraftValue(d.label) || '',
        start_date: cleanDraftValue(d.start_date) || '',
        start_tach: cleanDraftValue(d.start_tach) ?? '',
        end_date: cleanDraftValue(d.end_date) || '',
        end_tach: cleanDraftValue(d.end_tach) ?? '',
      })
    }
    for (const i of pickEv) {
      const d = draft.events[i]
      await onAddEvent({
        category: d.category,
        title: cleanDraftValue(d.title) || 'Event',
        event_date: cleanDraftValue(d.event_date) || '',
        tach: cleanDraftValue(d.tach) ?? '',
        description: cleanDraftValue(d.description) || '',
      })
    }
    setImporting(false)
    setPhase('idle')
    setDraft({ logbooks: [], events: [] })
  }

  return (
    <section className="insp__section lb__scan">
      <div className="insp__sectionhead">
        <h2><ScanLine size={18} aria-hidden="true" /> Scan &amp; import <span className="lb__beta">beta</span></h2>
      </div>

      {phase === 'idle' && (
        <>
          <p className="auth__hint">
            Photograph the logbook pages — we’ll read them and propose logbooks + notable events for you
            to review. Handwriting varies, so always confirm before importing.
          </p>
          <PhotoPicker
            onPick={onPick}
            multiple
            takeLabel="Scan logbook pages"
            uploadLabel="Upload files"
            takeIcon={ScanLine}
            className="auth__btn auth__btn--ghost insp__walkthrough"
          />
          {error && <div className="auth__error" role="alert">{error}</div>}
        </>
      )}

      {phase === 'working' && <p className="auth__hint">Reading the pages…</p>}

      {phase === 'review' && (
        <div className="lb__review">
          {draft.logbooks.length === 0 && draft.events.length === 0 && (
            <p className="auth__hint">Nothing legible found. Try clearer, well-lit photos.</p>
          )}

          {draft.logbooks.length > 0 && (
            <>
              <h3 className="lb__reviewh">Proposed logbooks</h3>
              <ul className="insp__list">
                {draft.logbooks.map((d, i) => (
                  <li key={i} className="lb__pick" onClick={() => toggle(pickLb, setPickLb, i)}>
                    <span className={`lb__check ${pickLb.has(i) ? 'is-on' : ''}`}>{pickLb.has(i) && <Check size={13} />}</span>
                    <span className="insp__main">
                      <span className="insp__id">{cleanDraftValue(d.label) || kindLabel(d.kind)}</span>
                      <span className="insp__sub">
                        {kindLabel(d.kind)} · {cleanDraftValue(d.start_date) || '?'}→{cleanDraftValue(d.end_date) || '?'} ·
                        {' '}tach {cleanDraftValue(d.start_tach) ?? '?'}–{cleanDraftValue(d.end_tach) ?? '?'}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {draft.events.length > 0 && (
            <>
              <h3 className="lb__reviewh">Proposed events</h3>
              <ul className="insp__list">
                {draft.events.map((d, i) => (
                  <li key={i} className="lb__pick" onClick={() => toggle(pickEv, setPickEv, i)}>
                    <span className={`lb__check ${pickEv.has(i) ? 'is-on' : ''}`}>{pickEv.has(i) && <Check size={13} />}</span>
                    <span className="insp__main">
                      <span className="insp__id">
                        <span className={`lb__cat lb__cat--${d.category}`}>{categoryLabel(d.category)}</span> {d.title}
                      </span>
                      <span className="insp__sub">
                        {[cleanDraftValue(d.event_date), cleanDraftValue(d.tach) != null ? `tach ${cleanDraftValue(d.tach)}` : null, cleanDraftValue(d.description)]
                          .filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="insp__capture">
            <button type="button" className="auth__btn" disabled={importing} onClick={doImport}>
              {importing ? 'Importing…' : `Import ${pickLb.size + pickEv.size} selected`}
            </button>
            <button type="button" className="auth__btn auth__btn--ghost" onClick={() => setPhase('idle')}>Discard</button>
          </div>
        </div>
      )}
    </section>
  )
}

function PositionField({ kind, value, onChange, engineCount, layout }) {
  if (!POSITIONAL_KINDS.includes(kind) || engineCount <= 1) return null
  const labelFor = (i) => (kind === 'propeller' ? propLabel(i, engineCount, layout) : engineLabel(i, engineCount, layout))
  return (
    <div className="auth__field">
      <label>Position</label>
      <select value={value} onChange={onChange}>
        <option value="">Unassigned</option>
        {Array.from({ length: engineCount }, (_, i) => (
          <option key={i} value={i + 1}>{labelFor(i)}</option>
        ))}
      </select>
    </div>
  )
}

function AddLogbook({ onAdd, engineCount, layout }) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ kind: 'airframe', position: '', label: '', start_date: '', start_tach: '', end_date: '', end_tach: '', notes: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }))

  if (!open) {
    return (
      <button type="button" className="auth__btn auth__btn--ghost insp__walkthrough" onClick={() => setOpen(true)}>
        <Plus size={15} aria-hidden="true" /> Add logbook
      </button>
    )
  }
  async function submit(e) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const err = await onAdd(f)
    setBusy(false)
    if (err) return setError(err.message)
    setF({ kind: 'airframe', position: '', label: '', start_date: '', start_tach: '', end_date: '', end_tach: '', notes: '' })
    setOpen(false)
  }
  return (
    <form className="auth__form insp__additem" onSubmit={submit}>
      <div className="insp__row2">
        <div className="auth__field">
          <label>Type</label>
          <select value={f.kind} onChange={set('kind')}>
            {LOGBOOK_KINDS.map((k) => <option key={k} value={k}>{kindLabel(k)}</option>)}
          </select>
        </div>
        <PositionField kind={f.kind} value={f.position} onChange={set('position')} engineCount={engineCount} layout={layout} />
        <div className="auth__field">
          <label>Label</label>
          <input type="text" placeholder="Airframe Book 2" value={f.label} onChange={set('label')} />
        </div>
      </div>
      <div className="insp__row2">
        <div className="auth__field"><label>Start date</label><input type="date" value={f.start_date} onChange={set('start_date')} /></div>
        <div className="auth__field"><label>Start tach</label><input type="number" inputMode="decimal" step="0.1" placeholder="0.0" value={f.start_tach} onChange={set('start_tach')} /></div>
      </div>
      <div className="insp__row2">
        <div className="auth__field"><label>End date</label><input type="date" value={f.end_date} onChange={set('end_date')} /></div>
        <div className="auth__field"><label>End tach</label><input type="number" inputMode="decimal" step="0.1" placeholder="1200.0" value={f.end_tach} onChange={set('end_tach')} /></div>
      </div>
      {error && <div className="auth__error" role="alert">{error}</div>}
      <div className="insp__capture">
        <button type="submit" className="auth__btn" disabled={busy}>{busy ? 'Adding…' : 'Add logbook'}</button>
        <button type="button" className="auth__btn auth__btn--ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  )
}

function AddEvent({ onAdd, engineCount, layout }) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ category: 'ad', title: '', position: '', event_date: '', tach: '', description: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }))

  if (!open) {
    return (
      <button type="button" className="auth__btn auth__btn--ghost insp__walkthrough" onClick={() => setOpen(true)}>
        <Plus size={15} aria-hidden="true" /> Add event
      </button>
    )
  }
  async function submit(e) {
    e.preventDefault()
    setError(null)
    if (!f.title.trim()) return setError('Give the event a title.')
    setBusy(true)
    const err = await onAdd(f)
    setBusy(false)
    if (err) return setError(err.message)
    setF({ category: 'ad', title: '', position: '', event_date: '', tach: '', description: '' })
    setOpen(false)
  }
  return (
    <form className="auth__form insp__additem" onSubmit={submit}>
      <div className="insp__row2">
        <div className="auth__field">
          <label>Category</label>
          <select value={f.category} onChange={set('category')}>
            {EVENT_CATEGORIES.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
          </select>
        </div>
        <div className="auth__field"><label>Tach</label><input type="number" inputMode="decimal" step="0.1" placeholder="850.0" value={f.tach} onChange={set('tach')} /></div>
      </div>
      {engineCount > 1 && (
        <div className="insp__row2">
          <div className="auth__field">
            <label>Engine (if engine-specific)</label>
            <select value={f.position} onChange={set('position')}>
              <option value="">Not engine-specific</option>
              {Array.from({ length: engineCount }, (_, i) => (
                <option key={i} value={i + 1}>{engineLabel(i, engineCount, layout)}</option>
              ))}
            </select>
          </div>
        </div>
      )}
      <div className="auth__field">
        <label>Title</label>
        <input type="text" placeholder="AD 2015-19-07 complied with" value={f.title} onChange={set('title')} />
      </div>
      <div className="auth__field"><label>Date</label><input type="date" value={f.event_date} onChange={set('event_date')} /></div>
      <div className="auth__field">
        <label>Details</label>
        <textarea className="insp__findings" rows={2} value={f.description} onChange={set('description')} />
      </div>
      {error && <div className="auth__error" role="alert">{error}</div>}
      <div className="insp__capture">
        <button type="submit" className="auth__btn" disabled={busy}>{busy ? 'Adding…' : 'Add event'}</button>
        <button type="button" className="auth__btn auth__btn--ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  )
}
