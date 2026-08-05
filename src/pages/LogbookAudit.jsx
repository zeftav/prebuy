// Logbook audit / research tool — scan-driven.
//
// You build each logbook by SCANNING it: tap "Scan a logbook", pick its
// type/position (airframe, engine #1, prop #2, …), snap the pages, and we compile
// them into a per-logbook PDF and read the dates/times/events off the pages
// (auto). Later you can re-open a logbook and add more pages (amend) — it
// re-compiles and reads the new pages. Manual "add a logbook by hand" is gone (the
// data comes from the scan); times and events stay editable, and you can still add
// an event by hand. Reconciliation (gaps/overlaps) runs on the scanned data.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, BookOpen, AlertTriangle, Plus, Trash2, ScanLine, RotateCw, ArrowUp, ArrowDown, FileText, Download, X, Check, Search, Package, Loader, ShieldCheck, ChevronRight } from 'lucide-react'
import { getInspection } from '../lib/checklist.js'
import {
  listLogbooks, addLogbook, deleteLogbook, updateLogbook,
  listEvents, addEvent, deleteEvent,
  reconcileLogbooks, kindLabel, categoryLabel, groupLabel, cleanDraftValue,
  extractLogbooksBatched, spanFromDrafts, mergeSpan, reassignLogbookEvents,
  listParts, addParts, deletePart, searchRecords, orderLogbooks, duplicateEvents,
  deleteScanRecordsForLogbook, updateLogbookEvent, updatePart, setAllEventsReport, setAllPartsReport,
  EVENT_CATEGORIES,
} from '../lib/logbooks.js'
import { compileAdCompliance, adStats } from '../lib/ad.js'
import { normalizeCompliance, mergeScanCompliance, saveCompliance } from '../lib/compliance.js'
import { normalizeProfile, engineLabel, draftFromExtraction, mergeProfileDraft, saveProfile } from '../lib/profile.js'
import { uploadMedia, listMediaByLogbook, listMediaByPurpose, updateMedia, deleteMedia } from '../lib/media.js'
import { compileLogbookPdf, rotateStep, reorderUpdates } from '../lib/logbookpdf.js'
import PhotoPicker from '../components/PhotoPicker.jsx'
import CameraCapture from '../components/CameraCapture.jsx'
import './auth.css'
import './inspections.css'

const fmtTach = (v) => (v == null ? '—' : Number(v).toFixed(1))

// Did the scan read anything worth suggesting to the Aircraft Profile?
function draftHasProfileContent(draft) {
  const s = draft?.specs || {}
  const c = draft?.currency || {}
  const e = draft?.equipment || {}
  return Object.values(s).some(Boolean) || Object.values(c).some(Boolean) || (e.avionics?.length || e.additional?.length)
}
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
  opts.push({ kind: 'ad', position: 0, label: 'AD compliance report' })
  opts.push({ kind: 'form_337', position: 0, label: 'Form 337s' })
  opts.push({ kind: 'other', position: 0, label: 'Other' })
  return opts
}

export default function LogbookAudit() {
  const { id } = useParams()
  const [inspection, setInspection] = useState(null)
  const [logbooks, setLogbooks] = useState([])
  const [events, setEvents] = useState([])
  const [parts, setParts] = useState([])
  const [pdfByLogbook, setPdfByLogbook] = useState(new Map()) // logbook_id → signed PDF url (for page hotlinks)
  const [query, setQuery] = useState('')
  const [state, setState] = useState('loading')
  const [scan, setScan] = useState(null) // { mode:'new'|'amend', book? } | null
  // Background processing: after a scan, compiling the PDF + reading the pages runs
  // off the scan flow so you can immediately scan the next book. `jobs` is keyed by
  // logbook id → { title, label, done, total, error, args }. `rev` bumps a card's
  // key when its job finishes so it re-fetches its (now compiled) PDF + pages.
  const [jobs, setJobs] = useState({})
  const [rev, setRev] = useState({})
  const queueRef = useRef(Promise.resolve())

  async function reload(inspId) {
    const [{ data: lb }, { data: ev }, { data: pt }, { data: pdfs }] = await Promise.all([
      listLogbooks(inspId), listEvents(inspId), listParts(inspId), listMediaByPurpose(inspId, 'logbook_pdf'),
    ])
    setLogbooks(lb)
    setEvents(ev)
    setParts(pt)
    setPdfByLogbook(new Map((pdfs ?? []).filter((m) => m.logbook_id && m.url).map((m) => [m.logbook_id, m.url])))
  }

  // Queue a scanned book for background processing (one at a time — gentle on a
  // phone). Then the scan flow closes and you can start the next book.
  function enqueueProcessing({ book, capturedIds, mode }) {
    const title = book.label || kindLabel(book.kind)
    setJobs((p) => ({ ...p, [book.id]: { title, label: 'Queued', done: 0, total: 0, error: null, args: { book, capturedIds, mode } } }))
    queueRef.current = queueRef.current.then(() => processBook({ book, capturedIds, mode })).catch(() => {})
  }

  function retryJob(bookId) {
    const job = jobs[bookId]
    if (job?.args) enqueueProcessing(job.args)
  }
  function dismissJob(bookId) {
    setJobs((p) => { const n = { ...p }; delete n[bookId]; return n })
  }

  // The processing pipeline (compile the PDF from the pages, then read the pages).
  // Progress is written to `jobs[book.id]`; on failure the pages are already saved,
  // so we leave the job in an error state with a Retry.
  async function processBook({ book, capturedIds, mode }) {
    const setJob = (patch) => setJobs((p) => (p[book.id] ? { ...p, [book.id]: { ...p[book.id], ...patch } } : p))
    setJob({ label: 'Building PDF', done: 0, total: 0, error: null })
    try {
      const { data: media } = await listMediaByLogbook(book.id)
      const pages = media.filter((m) => m.purpose === 'logbook')
      const existingPdf = media.find((m) => m.purpose === 'logbook_pdf')

      // Re-read: clear this book's extracted events/parts so re-reading the same
      // pages replaces them (no duplicates), then read like a fresh scan.
      if (mode === 'reread') await deleteScanRecordsForLogbook(book.id)

      // 1. Compile the PDF from every page, in order.
      setJob({ label: 'Building PDF', done: 0, total: pages.length })
      const { blob, error: cErr } = await compileLogbookPdf(
        pages.map((p) => ({ url: p.url, rotation: p.rotation })),
        { onProgress: (pr) => setJob({ label: 'Building PDF', ...pr }) },
      )
      if (cErr) {
        setJob({ error: 'Couldn’t build the PDF. Open the logbook and tap “Re-compile PDF”.', label: null })
        return
      }
      const keepOnReport = existingPdf?.show_on_report ?? false
      if (existingPdf) await deleteMedia(existingPdf)
      const pdfFile = new File([blob], 'logbook.pdf', { type: 'application/pdf' })
      const { data: pdfRow } = await uploadMedia({
        orgId: inspection.org_id, inspectionId: inspection.id, logbookId: book.id,
        purpose: 'logbook_pdf', caption: book.label || kindLabel(book.kind), file: pdfFile,
      })
      if (pdfRow && keepOnReport) await updateMedia(pdfRow.id, { show_on_report: true })

      // 2. Read the pages (auto). New scan → read all; amend → only the new pages.
      const newIds = new Set(capturedIds)
      const toRead = mode === 'amend' ? pages.filter((p) => newIds.has(p.id)) : pages
      const urls = toRead.map((p) => p.url).filter(Boolean)
      if (urls.length) {
        setJob({ label: 'Reading pages', done: 0, total: 1 })
        const { data: draft } = await extractLogbooksBatched(urls, inspection.org_id, {
          onProgress: (pr) => setJob({ label: 'Reading pages', ...pr }),
          context: { kind: book.kind, position: book.position },
        })
        if (draft) {
          const span = spanFromDrafts(draft.logbooks)
          const next = mode === 'amend' ? mergeSpan(book, span) : span
          const unclear = (Array.isArray(draft.unclear) ? draft.unclear : []).slice(0, 10).join('; ')
          const reviewNote = mode === 'amend'
            ? ([book.review_note, unclear].filter(Boolean).join('; ') || null)
            : (unclear || null)
          await updateLogbook(book.id, { ...next, review_note: reviewNote })
          // The extraction pages are relative to the pages we READ this pass. On an
          // amend those are appended after the existing pages, so shift by that many
          // to get the page number in the (re-compiled) PDF.
          const pageBase = mode === 'amend' ? pages.length - toRead.length : 0
          const srcPage = (p) => (Number(p) > 0 ? pageBase + Number(p) : null)
          for (const ev of draft.events ?? []) {
            await addEvent(inspection, {
              logbookId: book.id, position: book.position, category: ev.category,
              title: cleanDraftValue(ev.title) || 'Event',
              event_date: cleanDraftValue(ev.event_date) || '',
              tach: cleanDraftValue(ev.tach) ?? '',
              description: cleanDraftValue(ev.description) || '',
              source_page: srcPage(ev.page),
              next_due_date: cleanDraftValue(ev.next_due_date) || '',
              next_due_hours: cleanDraftValue(ev.next_due_hours) ?? '',
            })
          }
          if (Array.isArray(draft.parts) && draft.parts.length) {
            await addParts(inspection, book.id, draft.parts.map((p) => ({ ...p, source_page: srcPage(p.page) })))
          }
          // Auto-populate the Timed-items / compliance tool from what the scan read
          // (annual, IFR checks, ELT, vacuum pump, wing bolts). Only fills newer
          // dates; the inspector still reviews on the Compliance page.
          if (Array.isArray(draft.compliance) && draft.compliance.length) {
            const { data: fresh } = await getInspection(inspection.id)
            if (fresh) {
              const norm = normalizeCompliance(fresh.attributes, { vertical: fresh.vertical, make: fresh.make })
              const merged = mergeScanCompliance(norm.items, draft.compliance)
              if (merged.filled) await saveCompliance(fresh, { items: merged.items, currentTach: norm.current_tach })
            }
          }
          // Suggest the Aircraft Profile from the same scan (specs/currency/equipment
          // the model read). Fill-blanks only — never clobbers what you've entered —
          // so no second "Scan to pre-fill" is needed for records in the logbooks.
          if (inspection.vertical === 'aviation' && draftHasProfileContent(draft)) {
            const { data: fresh } = await getInspection(inspection.id)
            if (fresh) {
              const pdraft = draftFromExtraction(draft)
              const mergedProfile = mergeProfileDraft(fresh.attributes?.profile, pdraft)
              await saveProfile(inspection.id, fresh.attributes ?? {}, mergedProfile)
            }
          }
        }
      }
    } catch (e) {
      setJob({ error: e?.message || 'Processing failed. Open the logbook and tap “Re-compile PDF”.', label: null })
      return
    }
    // Done — clear the job, force the card to re-fetch its PDF/pages, refresh totals.
    setJobs((p) => { const n = { ...p }; delete n[book.id]; return n })
    setRev((r) => ({ ...r, [book.id]: (r[book.id] || 0) + 1 }))
    await reload(inspection.id)
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
  const dups = useMemo(() => duplicateEvents(events), [events])
  const adc = useMemo(() => compileAdCompliance(events, logbooks), [events, logbooks])
  const adcStats = useMemo(() => adStats(adc.ads), [adc])

  async function closeScan() {
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
  async function onDeletePart(pt) {
    setParts((p) => p.filter((x) => x.id !== pt.id))
    await deletePart(pt.id)
  }
  // Report visibility: events show by default (hold to hide); parts are opt-in.
  async function onToggleEventReport(ev) {
    const next = ev.show_on_report === false
    setEvents((p) => p.map((e) => (e.id === ev.id ? { ...e, show_on_report: next } : e)))
    await updateLogbookEvent(ev.id, { show_on_report: next })
  }
  async function onTogglePartReport(pt) {
    const next = pt.show_on_report !== true
    setParts((p) => p.map((x) => (x.id === pt.id ? { ...x, show_on_report: next } : x)))
    await updatePart(pt.id, { show_on_report: next })
  }
  async function setAllEvents(show) {
    setEvents((p) => p.map((e) => ({ ...e, show_on_report: show })))
    await setAllEventsReport(inspection.id, show)
  }
  async function setAllParts(show) {
    setParts((p) => p.map((x) => ({ ...x, show_on_report: show })))
    await setAllPartsReport(inspection.id, show)
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
  const filtered = searchRecords({ events, parts }, query)

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
          onQueue={enqueueProcessing}
          onClose={closeScan}
        />
      ) : (
        <button type="button" className="auth__btn lb__scanbtn" onClick={() => setScan({ mode: 'new' })}>
          <ScanLine size={16} aria-hidden="true" /> Scan a logbook
        </button>
      )}

      <ProcessingBanner jobs={jobs} onRetry={retryJob} onDismiss={dismissJob} />

      {/* Records search — top of the page, matches render directly below the bar. */}
      {(events.length > 0 || parts.length > 0) && (
        <section className="insp__section lb__searchsection">
          <div className="lb__searchbar">
            <Search size={15} aria-hidden="true" />
            <input
              type="search"
              placeholder="Search this aircraft’s records — events, part numbers…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search records"
            />
            {query && <button type="button" className="auth__toggle" onClick={() => setQuery('')}>Clear</button>}
          </div>
          {query && (
            <div className="lb__results">
              {filtered.events.length + filtered.parts.length === 0 ? (
                <p className="auth__hint">No matching records.</p>
              ) : (
                <ul className="insp__list">
                  {filtered.events.map((e) => (
                    <EventRow key={e.id} e={e} posLabel={posLabel} pdfUrl={pdfByLogbook.get(e.logbook_id)} onDelete={onDeleteEvent} onToggleReport={onToggleEventReport} />
                  ))}
                  {filtered.parts.map((p) => (
                    <PartRow key={p.id} p={p} pdfUrl={pdfByLogbook.get(p.logbook_id)} onDelete={onDeletePart} onToggleReport={onTogglePartReport} />
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      )}

      {/* Logbooks (scanned) */}
      {logbooks.length > 0 && (
        <section className="insp__section">
          <div className="insp__sectionhead"><h2>Logbooks</h2></div>
          <div className="lb__cards">
            {orderLogbooks(logbooks)
              .map((b) => (
                <LogbookCard
                  key={`${b.id}:${rev[b.id] || 0}`}
                  inspection={inspection}
                  book={b}
                  label={posLabel(b.kind, b.position)}
                  engineCount={engineCount}
                  layout={layout}
                  job={jobs[b.id]}
                  onAmend={() => setScan({ mode: 'amend', book: b })}
                  onReread={() => enqueueProcessing({ book: b, capturedIds: [], mode: 'reread' })}
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
        {(recon.issues.length > 0 || dups.length > 0) && (
          <ul className="lb__issues">
            {recon.issues.map((iss, i) => (
              <li key={i} className={`lb__issue lb__issue--${iss.type}`}>
                <AlertTriangle size={14} aria-hidden="true" /> {iss.message}
              </li>
            ))}
            {dups.length > 0 && (
              <li className="lb__issue lb__issue--overlap">
                <AlertTriangle size={14} aria-hidden="true" /> {dups.length} possible duplicate entr{dups.length === 1 ? 'y' : 'ies'} — the same event appears more than once (a page may have been scanned twice). Check the events below and delete any repeats.
              </li>
            )}
          </ul>
        )}
      </section>

      {/* AD compliance — compact card linking to the full chart. */}
      {adc.ads.length > 0 && (
        <Link to={`/app/inspections/${id}/ad-compliance`} className="lb__adcard">
          <span className="lb__adcardmain">
            <span className="lb__adcardtitle"><ShieldCheck size={16} aria-hidden="true" /> AD compliance</span>
            <span className="auth__hint">
              {adcStats.total} AD{adcStats.total === 1 ? '' : 's'}
              {adcStats.recurring ? ` · ${adcStats.recurring} recurring` : ''}
              {adc.issues.length ? ` · ${adc.issues.length} to check` : ''}
            </span>
          </span>
          <span className="lb__adcardgo">View chart <ChevronRight size={15} aria-hidden="true" /></span>
        </Link>
      )}

      {/* Notable events (full list; search is up top) */}
      <section className="insp__section">
        <div className="insp__sectionhead">
          <h2>Notable events</h2>
          {events.length > 1 && <ReportBulk onAll={() => setAllEvents(true)} onNone={() => setAllEvents(false)} />}
        </div>
        {events.length > 0 && (
          <ul className="insp__list">
            {events.map((e) => (
              <EventRow key={e.id} e={e} posLabel={posLabel} pdfUrl={pdfByLogbook.get(e.logbook_id)} onDelete={onDeleteEvent} onToggleReport={onToggleEventReport} />
            ))}
          </ul>
        )}
        <AddEvent onAdd={onAddEvent} engineCount={engineCount} layout={layout} />
      </section>

      {/* Parts / components (full list) */}
      {parts.length > 0 && (
        <section className="insp__section">
          <div className="insp__sectionhead">
            <h2><Package size={18} aria-hidden="true" /> Parts &amp; components</h2>
            {parts.length > 1 && <ReportBulk onAll={() => setAllParts(true)} onNone={() => setAllParts(false)} />}
          </div>
          <ul className="insp__list">
            {parts.map((p) => (
              <PartRow key={p.id} p={p} pdfUrl={pdfByLogbook.get(p.logbook_id)} onDelete={onDeletePart} onToggleReport={onTogglePartReport} />
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}

// Bulk "on report" control for a whole section (events / parts).
function ReportBulk({ onAll, onNone }) {
  return (
    <span className="lb__bulk">
      On report:
      <button type="button" className="auth__toggle" onClick={onAll}>All</button>
      <span aria-hidden="true">·</span>
      <button type="button" className="auth__toggle" onClick={onNone}>None</button>
    </span>
  )
}

// Report visibility toggle used on events/parts. `on` = appears on the report.
function ReportToggle({ on, onToggle }) {
  return (
    <button
      type="button"
      className={`insp__flag ${on ? 'is-on' : ''}`}
      onClick={onToggle}
      aria-pressed={on}
      title={on ? 'On the customer report — tap to hold back' : 'Held from the report — tap to include'}
    >
      <FileText size={14} aria-hidden="true" />
    </button>
  )
}

// A notable event row (used in search results + the full list).
function EventRow({ e, posLabel, pdfUrl, onDelete, onToggleReport }) {
  return (
    <li className="insp__row">
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
      <PageLink url={pdfUrl} page={e.source_page} />
      {onToggleReport && <ReportToggle on={e.show_on_report === true} onToggle={() => onToggleReport(e)} />}
      <ConfirmButton title="Delete event" onConfirm={() => onDelete(e)}>
        <Trash2 size={15} aria-hidden="true" />
      </ConfirmButton>
    </li>
  )
}

// A part / component row (used in search results + the full list).
function PartRow({ p, pdfUrl, onDelete, onToggleReport }) {
  return (
    <li className="insp__row">
      <span className="insp__main">
        <span className="insp__id">{p.part_number || p.description || 'Part'}</span>
        <span className="insp__sub">{[p.part_number ? p.description : null, p.event_date, p.tach != null ? `tach ${fmtTach(p.tach)}` : null].filter(Boolean).join(' · ')}</span>
      </span>
      <PageLink url={pdfUrl} page={p.source_page} />
      {onToggleReport && <ReportToggle on={p.show_on_report === true} onToggle={() => onToggleReport(p)} />}
      <ConfirmButton title="Delete part" onConfirm={() => onDelete(p)}>
        <Trash2 size={15} aria-hidden="true" />
      </ConfirmButton>
    </li>
  )
}

// Hotlink to the page of the logbook's compiled PDF an item was read from. Native
// PDF viewers honor the #page=N fragment, so this jumps straight to that page.
function PageLink({ url, page }) {
  if (!url || !page) return null
  return (
    <a className="lb__pagelink" href={`${url}#page=${page}`} target="_blank" rel="noreferrer" title={`Open the logbook PDF at page ${page}`}>
      <FileText size={12} aria-hidden="true" /> p.{page}
    </a>
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

// Scan a logbook: pick type/position (new) → snap pages sequentially → hand off to
// background processing (compile the PDF + read the pages) so you can immediately
// scan the next book. Amend mode skips the picker and appends pages to an existing
// logbook; the new pages are compiled + read in the background too.
function ScanFlow({ inspection, engineCount, layout, mode, book: amendBook, onCancel, onQueue, onClose }) {
  const [step, setStep] = useState(mode === 'amend' ? 'capture' : 'pick')
  const [book, setBook] = useState(amendBook ?? null)
  const [captured, setCaptured] = useState([]) // page rows added THIS session
  const [existingCount, setExistingCount] = useState(0)
  const [busy, setBusy] = useState(false)
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

  // Hand the captured pages to background processing and close the scan flow so the
  // inspector can start the next logbook immediately. Pages are already uploaded, so
  // the background job just needs the book + which pages are new.
  function finish() {
    if (!book) return onClose()
    if (captured.length === 0 && mode === 'amend') return onClose() // nothing added
    onQueue({ book, capturedIds: captured.map((c) => c.id), mode })
    onClose()
  }

  return (
    <section className="insp__section lb__scanflow">
      <div className="insp__sectionhead">
        <h2><ScanLine size={18} aria-hidden="true" /> {mode === 'amend' ? `Add pages — ${amendBook.label || kindLabel(amendBook.kind)}` : 'Scan a logbook'}</h2>
        <button type="button" className="auth__toggle" onClick={cancel}><X size={14} aria-hidden="true" /> Cancel</button>
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
          {captured.length > 0 && (
            <p className="auth__hint">We’ll build the PDF and read the pages in the background — you can scan the next logbook right away.</p>
          )}
        </>
      )}
    </section>
  )
}

// Compact, always-visible progress for logbooks processing in the background. Shown
// on mobile + desktop so you can scan the next book while these finish.
function ProcessingBanner({ jobs, onRetry, onDismiss }) {
  const entries = Object.entries(jobs)
  if (!entries.length) return null
  return (
    <div className="lb__jobs" aria-live="polite">
      {entries.map(([id, j]) => (
        <div key={id} className={`lb__job ${j.error ? 'lb__job--error' : ''}`}>
          <div className="lb__jobmain">
            <span className="lb__jobtitle">
              {!j.error && <Loader size={14} className="lb__spin" aria-hidden="true" />}
              {j.error && <AlertTriangle size={14} aria-hidden="true" />}
              {j.title}
            </span>
            <span className="auth__hint">
              {j.error ? j.error : `${j.label || 'Processing'}${j.total ? ` — ${j.done} of ${j.total}` : '…'}`}
            </span>
            {!j.error && (
              <div className="lb__progressbar">
                <span style={{ width: `${j.total ? Math.round((j.done / j.total) * 100) : 12}%` }} />
              </div>
            )}
          </div>
          {j.error && (
            <span className="insp__rowconfirm">
              <button type="button" className="insp__rowyes" onClick={() => onRetry(id)}>Retry</button>
              <button type="button" className="insp__rowno" onClick={() => onDismiss(id)}>Dismiss</button>
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

// A scanned logbook: its compiled PDF (download + show-on-report), read times
// (editable), an "add pages" amend action, a collapsible page manager
// (rotate/reorder/delete), and delete-the-logbook — all destructive taps confirmed.
function LogbookCard({ inspection, book, label, engineCount, layout, job, onAmend, onReread, onDelete, onUpdate }) {
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
          <span className="lb__cardtitle">
            {label}
            {job && !job.error && (
              <span className="lb__procbadge"><Loader size={12} className="lb__spin" aria-hidden="true" /> {job.label || 'Processing'}…</span>
            )}
          </span>
          <span className="lb__cardsub">{loading ? '…' : `${pages.length} page${pages.length === 1 ? '' : 's'}`} · {fmtRange(book)}</span>
        </div>
        <ConfirmButton title="Delete logbook" label="Delete logbook" onConfirm={onDelete}>
          <Trash2 size={15} aria-hidden="true" />
        </ConfirmButton>
      </div>

      {book.review_note && (
        <div className="lb__review-flag">
          <AlertTriangle size={15} aria-hidden="true" />
          <div className="lb__review-main">
            <strong>Some entries were hard to read — verify against the PDF.</strong>
            <span className="auth__hint">{book.review_note}</span>
          </div>
          <button type="button" className="auth__toggle" onClick={() => onUpdate({ review_note: null })}>Mark reviewed</button>
        </div>
      )}

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
        {pages.length > 0 && !job && (
          <ConfirmButton title="Re-read pages" label="Re-read & replace entries" className="auth__toggle" onConfirm={onReread}>
            Re-read
          </ConfirmButton>
        )}
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
