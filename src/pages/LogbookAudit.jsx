// Logbook audit / research tool — scan-driven.
//
// You build each logbook by SCANNING it: tap "Scan a logbook", pick its
// type/position (airframe, engine #1, prop #2, …), snap the pages, and we compile
// them into a per-logbook PDF and read the dates/times/events off the pages
// (auto). Later you can re-open a logbook and add more pages (amend) — it
// re-compiles and reads the new pages. Manual "add a logbook by hand" is gone (the
// data comes from the scan); times and events stay editable, and you can still add
// an event by hand. Reconciliation (gaps/overlaps) runs on the scanned data.

import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, BookOpen, AlertTriangle, Plus, Trash2, ScanLine, RotateCw, ArrowUp, ArrowDown, FileText, Download, X, Check } from 'lucide-react'
import { getInspection } from '../lib/checklist.js'
import {
  listLogbooks, addLogbook, deleteLogbook, updateLogbook,
  listEvents, addEvent, deleteEvent,
  reconcileLogbooks, kindLabel, categoryLabel, groupLabel, cleanDraftValue,
  extractLogbooksBatched, spanFromDrafts, mergeSpan, reassignLogbookEvents,
  LOGBOOK_KINDS, EVENT_CATEGORIES,
} from '../lib/logbooks.js'
import { normalizeProfile, engineLabel } from '../lib/profile.js'
import { uploadMedia, listMediaByLogbook, updateMedia, deleteMedia } from '../lib/media.js'
import { compileLogbookPdf, rotateStep, reorderUpdates } from '../lib/logbookpdf.js'
import PhotoPicker from '../components/PhotoPicker.jsx'
import CameraCapture from '../components/CameraCapture.jsx'
import './auth.css'
import './inspections.css'

const fmtTach = (v) => (v == null ? '—' : Number(v).toFixed(1))
const fmtRange = (b) => {
  const hasSpan = b.start_date || b.end_date || b.start_tach != null || b.end_tach != null
  if (!hasSpan) return 'No times read yet'
  return `${b.start_date || '?'} → ${b.end_date || '?'} · tach ${fmtTach(b.start_tach)}–${fmtTach(b.end_tach)}`
}

// Scan target options for the picker, from the aircraft's engine count + layout.
function kindOptions(engineCount, layout) {
  const opts = [{ kind: 'airframe', position: 0, label: 'Airframe' }]
  if (engineCount > 1) {
    for (let i = 1; i <= engineCount; i++) opts.push({ kind: 'engine', position: i, label: groupLabel('engine', i, engineCount, layout) })
    for (let i = 1; i <= engineCount; i++) opts.push({ kind: 'propeller', position: i, label: groupLabel('propeller', i, engineCount, layout) })
  } else {
    opts.push({ kind: 'engine', position: 0, label: 'Engine' })
    opts.push({ kind: 'propeller', position: 0, label: 'Propeller' })
  }
  opts.push({ kind: 'other', position: 0, label: 'Other' })
  return opts
}

export default function LogbookAudit() {
  const { id } = useParams()
  const [inspection, setInspection] = useState(null)
  const [logbooks, setLogbooks] = useState([])
  const [events, setEvents] = useState([])
  const [state, setState] = useState('loading')
  const [scan, setScan] = useState(null) // { mode:'new'|'amend', book? } | null

  async function reload(inspId) {
    const [{ data: lb }, { data: ev }] = await Promise.all([listLogbooks(inspId), listEvents(inspId)])
    setLogbooks(lb)
    setEvents(ev)
  }

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data: insp, error } = await getInspection(id)
      if (!active) return
      if (error || !insp) return setState('error')
      setInspection(insp)
      await reload(insp.id)
      if (active) setState('ready')
    })()
    return () => {
      active = false
    }
  }, [id])

  const { engineCount, layout } = useMemo(() => {
    const prof = normalizeProfile(inspection?.attributes?.profile)
    const seeded = Number(inspection?.attributes?.engine_count) || 1
    return { engineCount: Math.max(prof.engine_count, seeded), layout: prof.layout }
  }, [inspection])

  const recon = useMemo(() => reconcileLogbooks(logbooks, { engineCount, layout }), [logbooks, engineCount, layout])

  async function onScanDone() {
    setScan(null)
    await reload(inspection.id)
  }
  async function onDeleteBook(book) {
    // Clean up the book's Storage objects (pages + PDF) first; the media rows
    // cascade-delete with the logbook.
    const { data: media } = await listMediaByLogbook(book.id)
    for (const m of media) await deleteMedia(m)
    setLogbooks((p) => p.filter((b) => b.id !== book.id))
    setEvents((p) => p.filter((e) => e.logbook_id !== book.id))
    await deleteLogbook(book.id)
  }
  async function onUpdateBook(book, patch) {
    const { data } = await updateLogbook(book.id, patch)
    if (!data) return
    setLogbooks((p) => p.map((b) => (b.id === book.id ? data : b)))
    // If the type/position was corrected, realign this book's events too.
    if ('kind' in patch || 'position' in patch) {
      await reassignLogbookEvents(book.id, data.position)
      setEvents((p) => p.map((e) => (e.logbook_id === book.id ? { ...e, position: data.position } : e)))
    }
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
    return <main className="auth-pending" aria-busy="true"><p>Loading…</p></main>
  }
  if (state === 'error') {
    return (
      <main className="auth">
        <div className="auth__error">Couldn’t load this inspection.</div>
        <Link to="/app" className="auth__toggle">← Back</Link>
      </main>
    )
  }

  const posLabel = (kind, position) => groupLabel(kind, position, engineCount, layout)

  return (
    <main className="insp">
      <Link to={`/app/inspections/${id}`} className="auth__toggle">
        <ChevronLeft size={15} aria-hidden="true" /> Inspection
      </Link>

      <div className="auth__heading">
        <h1><BookOpen size={20} aria-hidden="true" /> Logbook audit</h1>
        <p>Scan each logbook, and we’ll build a PDF copy and read the times and notable events off the pages.</p>
      </div>

      {/* Scan flow (modal-ish section) or the start button. */}
      {scan ? (
        <ScanFlow
          inspection={inspection}
          engineCount={engineCount}
          layout={layout}
          mode={scan.mode}
          book={scan.book}
          onCancel={() => setScan(null)}
          onDone={onScanDone}
        />
      ) : (
        <button type="button" className="auth__btn lb__scanbtn" onClick={() => setScan({ mode: 'new' })}>
          <ScanLine size={16} aria-hidden="true" /> Scan a logbook
        </button>
      )}

      {/* Logbooks (scanned) */}
      {logbooks.length > 0 && (
        <section className="insp__section">
          <div className="insp__sectionhead"><h2>Logbooks</h2></div>
          <div className="lb__cards">
            {[...logbooks]
              .sort((a, b) => LOGBOOK_KINDS.indexOf(a.kind) - LOGBOOK_KINDS.indexOf(b.kind) || (a.position || 0) - (b.position || 0))
              .map((b) => (
                <LogbookCard
                  key={b.id}
                  inspection={inspection}
                  book={b}
                  label={posLabel(b.kind, b.position)}
                  engineCount={engineCount}
                  layout={layout}
                  onAmend={() => setScan({ mode: 'amend', book: b })}
                  onDelete={() => onDeleteBook(b)}
                  onUpdate={(patch) => onUpdateBook(b, patch)}
                />
              ))}
          </div>
        </section>
      )}

      {/* Reconciliation */}
      <section className="insp__section">
        <h2>Reconciliation</h2>
        {recon.groups.length === 0 ? (
          <p className="auth__hint">Scan a logbook to reconcile times.</p>
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

      {/* Notable events */}
      <section className="insp__section">
        <div className="insp__sectionhead"><h2>Notable events</h2></div>
        {events.length > 0 && (
          <ul className="insp__list">
            {events.map((e) => (
              <li key={e.id} className="insp__row">
                <span className="insp__main">
                  <span className="insp__id">
                    <span className={`lb__cat lb__cat--${e.category}`}>{categoryLabel(e.category)}</span> {e.title}
                  </span>
                  <span className="insp__sub">
                    {[e.position ? posLabel('engine', e.position) : null, e.event_date, e.tach != null ? `tach ${fmtTach(e.tach)}` : null, e.description]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <ConfirmButton title="Delete event" onConfirm={() => onDeleteEvent(e)}>
                  <Trash2 size={15} aria-hidden="true" />
                </ConfirmButton>
              </li>
            ))}
          </ul>
        )}
        <AddEvent onAdd={onAddEvent} engineCount={engineCount} layout={layout} />
      </section>
    </main>
  )
}

// Two-step delete confirm — guards accidental taps on the phone.
function ConfirmButton({ onConfirm, title = 'Delete', label = 'Delete', className = 'insp__flag', children }) {
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)
  if (!armed) {
    return (
      <button type="button" className={className} title={title} aria-label={title} onClick={() => setArmed(true)}>
        {children}
      </button>
    )
  }
  return (
    <span className="insp__rowconfirm">
      <span>{label}?</span>
      <button type="button" className="insp__rowyes" disabled={busy} onClick={async () => { setBusy(true); await onConfirm() }}>{busy ? '…' : 'Yes'}</button>
      <button type="button" className="insp__rowno" disabled={busy} onClick={() => setArmed(false)}>No</button>
    </span>
  )
}

// Scan a logbook: pick type/position (new) → snap pages sequentially → save +
// compile a PDF + read the pages (auto). Amend mode skips the picker and appends
// pages to an existing logbook, then re-compiles + reads the new pages.
function ScanFlow({ inspection, engineCount, layout, mode, book: amendBook, onCancel, onDone }) {
  const [step, setStep] = useState(mode === 'amend' ? 'capture' : 'pick')
  const [book, setBook] = useState(amendBook ?? null)
  const [captured, setCaptured] = useState([]) // page rows added THIS session
  const [existingCount, setExistingCount] = useState(0)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const opts = useMemo(() => kindOptions(engineCount, layout), [engineCount, layout])

  // Amend: find out how many pages the book already has (sort offset + later compile).
  useEffect(() => {
    if (mode !== 'amend' || !amendBook) return
    listMediaByLogbook(amendBook.id).then(({ data }) => {
      setExistingCount(data.filter((m) => m.purpose === 'logbook').length)
    })
  }, [mode, amendBook])

  async function choose(opt) {
    setError(null)
    setBusy(true)
    const { data, error } = await addLogbook(inspection, { kind: opt.kind, position: opt.position, label: opt.label })
    setBusy(false)
    if (error) return setError(error.message)
    setBook(data)
    setStep('capture')
  }

  async function addPages(files) {
    const list = Array.from(files ?? [])
    if (!list.length || !book) return
    setBusy(true)
    setError(null)
    let order = existingCount + captured.length
    for (const f of list) {
      const { data, error } = await uploadMedia({
        orgId: inspection.org_id,
        inspectionId: inspection.id,
        logbookId: book.id,
        purpose: 'logbook',
        file: f,
        sortOrder: order++,
      })
      if (!error && data) setCaptured((p) => [...p, data])
    }
    setBusy(false)
  }

  // Abandoning a brand-new logbook with no pages → delete the empty row.
  async function cancel() {
    if (mode === 'new' && book && captured.length === 0) {
      const { data: media } = await listMediaByLogbook(book.id)
      for (const m of media) await deleteMedia(m)
      await deleteLogbook(book.id)
    }
    onCancel()
  }

  async function finish() {
    if (!book) return onDone()
    if (captured.length === 0 && mode === 'amend') return onDone() // nothing added
    setStep('process')
    setError(null)

    // Gather ALL pages (existing + just-added) for the compile.
    const { data: media } = await listMediaByLogbook(book.id)
    const pages = media.filter((m) => m.purpose === 'logbook')
    const existingPdf = media.find((m) => m.purpose === 'logbook_pdf')

    // 1. Compile the PDF from every page, in order.
    setProgress({ label: 'Building PDF', done: 0, total: pages.length })
    const { blob, error: cErr } = await compileLogbookPdf(
      pages.map((p) => ({ url: p.url, rotation: p.rotation })),
      { onProgress: (pr) => setProgress({ label: 'Building PDF', ...pr }) },
    )
    if (cErr) {
      setError(`${cErr.message} Pages are saved — try “Save & read” again.`)
      setStep('capture')
      setProgress(null)
      return
    }
    const keepOnReport = existingPdf?.show_on_report ?? false
    if (existingPdf) await deleteMedia(existingPdf)
    const pdfFile = new File([blob], 'logbook.pdf', { type: 'application/pdf' })
    const { data: pdfRow } = await uploadMedia({
      orgId: inspection.org_id,
      inspectionId: inspection.id,
      logbookId: book.id,
      purpose: 'logbook_pdf',
      caption: book.label || kindLabel(book.kind),
      file: pdfFile,
    })
    if (pdfRow && keepOnReport) await updateMedia(pdfRow.id, { show_on_report: true })

    // 2. Read the pages (auto). New scan → read all; amend → only the new pages.
    const newIds = new Set(captured.map((c) => c.id))
    const toRead = mode === 'amend' ? pages.filter((p) => newIds.has(p.id)) : pages
    const urls = toRead.map((p) => p.url).filter(Boolean)
    if (urls.length) {
      setProgress({ label: 'Reading pages', done: 0, total: 1 })
      const { data: draft } = await extractLogbooksBatched(urls, inspection.org_id, {
        onProgress: (pr) => setProgress({ label: 'Reading pages', ...pr }),
      })
      if (draft) {
        const span = spanFromDrafts(draft.logbooks)
        const next = mode === 'amend' ? mergeSpan(book, span) : span
        await updateLogbook(book.id, next)
        for (const ev of draft.events ?? []) {
          await addEvent(inspection, {
            logbookId: book.id,
            position: book.position,
            category: ev.category,
            title: cleanDraftValue(ev.title) || 'Event',
            event_date: cleanDraftValue(ev.event_date) || '',
            tach: cleanDraftValue(ev.tach) ?? '',
            description: cleanDraftValue(ev.description) || '',
          })
        }
      }
    }
    setProgress(null)
    onDone()
  }

  return (
    <section className="insp__section lb__scanflow">
      <div className="insp__sectionhead">
        <h2><ScanLine size={18} aria-hidden="true" /> {mode === 'amend' ? `Add pages — ${amendBook.label || kindLabel(amendBook.kind)}` : 'Scan a logbook'}</h2>
        {step !== 'process' && (
          <button type="button" className="auth__toggle" onClick={cancel}><X size={14} aria-hidden="true" /> Cancel</button>
        )}
      </div>

      {error && <div className="auth__error" role="alert">{error}</div>}

      {step === 'pick' && (
        <>
          <p className="auth__hint">Which logbook is this? Pick the type (and which engine/prop on a twin), then snap the pages.</p>
          <div className="lb__kindgrid">
            {opts.map((o) => (
              <button key={`${o.kind}:${o.position}`} type="button" className="lb__kindbtn" disabled={busy} onClick={() => choose(o)}>
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}

      {step === 'capture' && (
        <>
          {cameraOpen ? (
            <CameraCapture
              count={captured.length}
              onCapture={(file) => addPages([file])}
              onClose={() => setCameraOpen(false)}
            />
          ) : (
            <>
              <p className="auth__hint">
                Snap the pages in order. <strong>Open camera</strong> keeps the camera up so you can shoot page
                after page without leaving — or <strong>Add pages</strong> to pick several from your camera roll.
                {existingCount > 0 && ` This logbook already has ${existingCount} page${existingCount === 1 ? '' : 's'}.`}
              </p>
              <div className="insp__capture">
                {typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia && (
                  <button type="button" className="auth__btn auth__btn--ghost insp__walkthrough" onClick={() => setCameraOpen(true)}>
                    <ScanLine size={15} aria-hidden="true" /> Open camera
                  </button>
                )}
                <PhotoPicker
                  onPick={addPages}
                  multiple
                  uploadOnly
                  busy={busy}
                  uploadLabel="Add pages"
                  className="auth__btn auth__btn--ghost insp__walkthrough"
                />
              </div>
            </>
          )}
          {captured.length > 0 && (
            <>
              <p className="auth__hint"><Check size={13} aria-hidden="true" /> {captured.length} page{captured.length === 1 ? '' : 's'} added.</p>
              <div className="insp__thumbs">
                {captured.map((m, i) => (
                  <span key={m.id} className="insp__thumbwrap"><span className="lb__pagenum">{existingCount + i + 1}</span></span>
                ))}
              </div>
            </>
          )}
          <div className="insp__capture">
            <button type="button" className="auth__btn" onClick={finish} disabled={busy || captured.length === 0}>
              <Check size={15} aria-hidden="true" /> Save &amp; read {captured.length > 0 ? `(${captured.length})` : ''}
            </button>
          </div>
        </>
      )}

      {step === 'process' && (
        <div className="auth__hint" aria-busy="true">
          {progress ? `${progress.label} ${progress.done}${progress.total ? ` of ${progress.total}` : ''}…` : 'Saving…'}
          {progress && (
            <div className="lb__progressbar"><span style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }} /></div>
          )}
        </div>
      )}
    </section>
  )
}

// A scanned logbook: its compiled PDF (download + show-on-report), read times
// (editable), an "add pages" amend action, a collapsible page manager
// (rotate/reorder/delete), and delete-the-logbook — all destructive taps confirmed.
function LogbookCard({ inspection, book, label, engineCount, layout, onAmend, onDelete, onUpdate }) {
  const [media, setMedia] = useState([])
  const [loading, setLoading] = useState(true)
  const [managing, setManaging] = useState(false)
  const [editing, setEditing] = useState(false)
  const [retyping, setRetyping] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(null)

  async function refresh() {
    const { data } = await listMediaByLogbook(book.id)
    setMedia(data)
    setLoading(false)
  }
  useEffect(() => {
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id])

  const pages = media.filter((m) => m.purpose === 'logbook')
  const pdf = media.find((m) => m.purpose === 'logbook_pdf')

  async function rotate(p) {
    const rotation = rotateStep(p.rotation)
    setMedia((prev) => prev.map((x) => (x.id === p.id ? { ...x, rotation } : x)))
    await updateMedia(p.id, { rotation })
  }
  async function removePage(p) {
    setMedia((prev) => prev.filter((x) => x.id !== p.id))
    await deleteMedia(p)
  }
  async function move(idx, dir) {
    const j = idx + dir
    if (j < 0 || j >= pages.length) return
    const next = [...pages]
    ;[next[idx], next[j]] = [next[j], next[idx]]
    setMedia((prev) => [...next, ...prev.filter((m) => m.purpose !== 'logbook')])
    for (const u of reorderUpdates(next)) await updateMedia(u.id, { sort_order: u.sort_order })
  }
  async function recompile() {
    if (!pages.length) return
    setBusy(true)
    setProgress({ done: 0, total: pages.length })
    const { blob, error } = await compileLogbookPdf(pages.map((p) => ({ url: p.url, rotation: p.rotation })), { onProgress: (pr) => setProgress(pr) })
    if (error) { setBusy(false); setProgress(null); return }
    const keepOnReport = pdf?.show_on_report ?? false
    if (pdf) await deleteMedia(pdf)
    const file = new File([blob], 'logbook.pdf', { type: 'application/pdf' })
    const { data } = await uploadMedia({ orgId: inspection.org_id, inspectionId: inspection.id, logbookId: book.id, purpose: 'logbook_pdf', caption: book.label || kindLabel(book.kind), file })
    if (data && keepOnReport) await updateMedia(data.id, { show_on_report: true })
    setBusy(false)
    setProgress(null)
    refresh()
  }
  async function toggleReport() {
    if (!pdf) return
    const next = !pdf.show_on_report
    setMedia((prev) => prev.map((m) => (m.id === pdf.id ? { ...m, show_on_report: next } : m)))
    await updateMedia(pdf.id, { show_on_report: next })
  }
  async function changeType(opt) {
    await onUpdate({ kind: opt.kind, position: opt.position, label: opt.label })
    // Keep the PDF's display name in sync with the corrected type.
    if (pdf) {
      setMedia((prev) => prev.map((m) => (m.id === pdf.id ? { ...m, caption: opt.label } : m)))
      await updateMedia(pdf.id, { caption: opt.label })
    }
    setRetyping(false)
  }
  const typeOpts = kindOptions(engineCount, layout)

  return (
    <div className="lb__card">
      <div className="lb__cardhead">
        <div>
          <span className="lb__cardtitle">{label}</span>
          <span className="lb__cardsub">{loading ? '…' : `${pages.length} page${pages.length === 1 ? '' : 's'}`} · {fmtRange(book)}</span>
        </div>
        <ConfirmButton title="Delete logbook" label="Delete logbook" onConfirm={onDelete}>
          <Trash2 size={15} aria-hidden="true" />
        </ConfirmButton>
      </div>

      {pdf && (
        <div className="lb__pdfcard">
          <FileText size={18} aria-hidden="true" />
          <div className="lb__pdfmain">
            <a href={pdf.url} target="_blank" rel="noreferrer"><Download size={13} aria-hidden="true" /> Logbook PDF</a>
            <label className="lb__pdftoggle">
              <input type="checkbox" checked={!!pdf.show_on_report} onChange={toggleReport} /> Show on report
            </label>
          </div>
          <ConfirmButton title="Delete PDF" label="Delete PDF" onConfirm={() => removePage(pdf)}>
            <Trash2 size={14} aria-hidden="true" />
          </ConfirmButton>
        </div>
      )}

      {editing ? (
        <EditTimes book={book} onSave={async (patch) => { await onUpdate(patch); setEditing(false) }} onCancel={() => setEditing(false)} />
      ) : null}

      {retyping && (
        <div className="lb__retype">
          <span className="auth__hint">Change this logbook’s type:</span>
          <div className="lb__kindgrid">
            {typeOpts.map((o) => (
              <button
                key={`${o.kind}:${o.position}`}
                type="button"
                className={`lb__kindbtn ${o.kind === book.kind && (o.position || 0) === (book.position || 0) ? 'is-current' : ''}`}
                onClick={() => changeType(o)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="insp__capture lb__cardactions">
        <button type="button" className="auth__btn auth__btn--ghost" onClick={onAmend}><Plus size={14} aria-hidden="true" /> Add pages</button>
        <button type="button" className="auth__toggle" onClick={() => setRetyping((v) => !v)}>Change type</button>
        <button type="button" className="auth__toggle" onClick={() => setEditing((v) => !v)}>Edit times</button>
        {pages.length > 0 && <button type="button" className="auth__toggle" onClick={() => setManaging((v) => !v)}>{managing ? 'Hide pages' : 'Manage pages'}</button>}
      </div>

      {managing && pages.length > 0 && (
        <>
          <ol className="lb__pagegrid">
            {pages.map((p, i) => (
              <li key={p.id} className="lb__page">
                <span className="lb__pagenum">{i + 1}</span>
                {p.url && <img className="lb__pageimg" src={p.url} alt={`Page ${i + 1}`} loading="lazy" style={{ transform: `rotate(${p.rotation || 0}deg)` }} />}
                <div className="lb__pagebtns">
                  <button type="button" className="insp__flag" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up"><ArrowUp size={14} aria-hidden="true" /></button>
                  <button type="button" className="insp__flag" onClick={() => move(i, 1)} disabled={i === pages.length - 1} aria-label="Move down"><ArrowDown size={14} aria-hidden="true" /></button>
                  <button type="button" className="insp__flag" onClick={() => rotate(p)} aria-label="Rotate"><RotateCw size={14} aria-hidden="true" /></button>
                  <ConfirmButton title="Delete page" onConfirm={() => removePage(p)}><Trash2 size={14} aria-hidden="true" /></ConfirmButton>
                </div>
              </li>
            ))}
          </ol>
          <div className="insp__capture">
            <button type="button" className="auth__btn" onClick={recompile} disabled={busy}>
              <FileText size={15} aria-hidden="true" /> {busy ? 'Re-compiling…' : 'Re-compile PDF'}
            </button>
          </div>
          {progress && (
            <div className="auth__hint" aria-busy="true">
              Building PDF — page {progress.done} of {progress.total}…
              <div className="lb__progressbar"><span style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }} /></div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function EditTimes({ book, onSave, onCancel }) {
  const [f, setF] = useState({
    start_date: book.start_date ?? '',
    start_tach: book.start_tach ?? '',
    end_date: book.end_date ?? '',
    end_tach: book.end_tach ?? '',
  })
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }))
  return (
    <div className="lb__edittimes">
      <div className="insp__row2">
        <div className="auth__field"><label>Start date</label><input type="date" value={f.start_date} onChange={set('start_date')} /></div>
        <div className="auth__field"><label>Start tach</label><input type="number" inputMode="decimal" step="0.1" value={f.start_tach} onChange={set('start_tach')} /></div>
      </div>
      <div className="insp__row2">
        <div className="auth__field"><label>End date</label><input type="date" value={f.end_date} onChange={set('end_date')} /></div>
        <div className="auth__field"><label>End tach</label><input type="number" inputMode="decimal" step="0.1" value={f.end_tach} onChange={set('end_tach')} /></div>
      </div>
      <div className="insp__capture">
        <button type="button" className="auth__btn" disabled={busy} onClick={async () => { setBusy(true); await onSave({ start_date: f.start_date || null, start_tach: f.start_tach, end_date: f.end_date || null, end_tach: f.end_tach }) }}>{busy ? 'Saving…' : 'Save'}</button>
        <button type="button" className="auth__btn auth__btn--ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
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
