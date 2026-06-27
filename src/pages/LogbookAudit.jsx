// Logbook audit / research tool. Track an aircraft's records across multiple
// logbooks per type, reconcile time continuity (gaps/overlaps), and capture
// notable events (ADs, 337s, overhauls, prop strikes, damage).
//
// Photo→OCR import is a planned follow-up (see docs/backlog.md); for now entry is
// structured/manual.

import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, BookOpen, AlertTriangle, Plus, Trash2 } from 'lucide-react'
import { getInspection } from '../lib/checklist.js'
import {
  listLogbooks, addLogbook, deleteLogbook,
  listEvents, addEvent, deleteEvent,
  reconcileLogbooks, kindLabel, categoryLabel,
  LOGBOOK_KINDS, EVENT_CATEGORIES,
} from '../lib/logbooks.js'
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

  const recon = useMemo(() => reconcileLogbooks(logbooks), [logbooks])

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

  const kindsPresent = LOGBOOK_KINDS.filter((k) => recon.byKind[k])

  return (
    <main className="insp">
      <Link to={`/app/inspections/${id}`} className="auth__toggle">
        <ChevronLeft size={15} aria-hidden="true" /> Inspection
      </Link>

      <div className="auth__heading">
        <h1><BookOpen size={20} aria-hidden="true" /> Logbook audit</h1>
        <p>Track records across logbooks, reconcile the times, and note key events.</p>
      </div>

      {/* Reconciliation */}
      <section className="insp__section">
        <h2>Reconciliation</h2>
        {kindsPresent.length === 0 ? (
          <p className="auth__hint">Add logbooks below to reconcile times.</p>
        ) : (
          <div className="lb__recon">
            {kindsPresent.map((k) => {
              const s = recon.byKind[k]
              return (
                <div key={k} className="lb__reconrow">
                  <span className="lb__reconkind">{kindLabel(k)}</span>
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
                    <span className="insp__sub">{kindLabel(b.kind)} · {fmtRange(b)}</span>
                  </span>
                  <button type="button" className="insp__flag" onClick={() => onDeleteBook(b)} aria-label="Delete logbook">
                    <Trash2 size={15} aria-hidden="true" />
                  </button>
                </li>
              ))}
          </ul>
        )}
        <AddLogbook onAdd={onAddBook} />
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
                    {[e.event_date, e.tach != null ? `tach ${fmtTach(e.tach)}` : null, e.description]
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
        <AddEvent onAdd={onAddEvent} />
      </section>
    </main>
  )
}

function AddLogbook({ onAdd }) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ kind: 'airframe', label: '', start_date: '', start_tach: '', end_date: '', end_tach: '', notes: '' })
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
    setF({ kind: 'airframe', label: '', start_date: '', start_tach: '', end_date: '', end_tach: '', notes: '' })
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

function AddEvent({ onAdd }) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ category: 'ad', title: '', event_date: '', tach: '', description: '' })
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
    setF({ category: 'ad', title: '', event_date: '', tach: '', description: '' })
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
