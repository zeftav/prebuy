// Timed-items / airworthiness compliance summary. The recurring inspections and
// life-limited items pertinent to an airframe — IFR checks (91.411/413), ELT +
// battery, annual, make-specific items (Beech wing bolts), on-condition components
// (vacuum pump) — plus any custom / MM life-limited items. For each, record the
// last-complied date and/or tach; we compute next-due and a status (overdue /
// due-soon / current). Stored on the inspection's attributes; prints on the report.

import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, CalendarClock, Check, Plus, Trash2, ScanLine } from 'lucide-react'
import { getInspection } from '../lib/checklist.js'
import {
  normalizeCompliance, complianceRows, complianceStats, statusLabel, saveCompliance, slugKey,
  limitsToComplianceItems, mergeScanParts,
} from '../lib/compliance.js'
import { extractLogbooks, listParts } from '../lib/logbooks.js'
import { uploadMedia, signedUrlsFor } from '../lib/media.js'
import PhotoPicker from '../components/PhotoPicker.jsx'
import './auth.css'
import './inspections.css'

// Today's date (app runtime — fine here; only workflow scripts ban new Date()).
const today = () => new Date().toISOString().slice(0, 10)

export default function Compliance() {
  const { id } = useParams()
  const [inspection, setInspection] = useState(null)
  const [items, setItems] = useState([])
  const [currentTach, setCurrentTach] = useState('')
  const [state, setState] = useState('loading')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data: insp, error } = await getInspection(id)
      if (!active) return
      if (error || !insp) return setState('error')
      setInspection(insp)
      const { items: norm, current_tach } = normalizeCompliance(insp.attributes, { vertical: insp.vertical, make: insp.make })
      setItems(norm)
      // Prefill current airframe time: stored value, else the profile's total time.
      const prof = insp.attributes?.profile?.specs?.total_time
      setCurrentTach(current_tach != null ? String(current_tach) : prof != null ? String(prof) : '')
      setState('ready')
    })()
    return () => { active = false }
  }, [id])

  const ctx = useMemo(() => ({ asOfDate: today(), currentTach: currentTach === '' ? null : Number(currentTach) }), [currentTach])
  const rows = useMemo(() => complianceRows(items, ctx), [items, ctx])
  const stats = useMemo(() => complianceStats(items, ctx), [items, ctx])

  function patch(key, p) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...p } : i)))
    setSaved(false)
  }
  function setAllReport(show) {
    setItems((prev) => prev.map((i) => ({ ...i, show_on_report: show })))
    setSaved(false)
  }
  function removeItem(key) {
    setItems((prev) => prev.filter((i) => i.key !== key))
    setSaved(false)
  }
  function addCustom(draft) {
    const key = uniqueKey(slugKey(draft.label), items)
    setItems((prev) => [...prev, {
      key, label: draft.label.trim(), category: 'component', source: 'custom', basis: draft.basis?.trim() || null,
      last_date: null, last_tach: null, note: null, disabled: false,
      interval_months: draft.interval_months ? Number(draft.interval_months) : null,
      interval_hours: draft.interval_hours ? Number(draft.interval_hours) : null,
    }])
    setSaved(false)
  }
  async function addMmItems(newItems) {
    // Pre-fill each new life-limited item's last-done from parts already read off the
    // logbooks (matched by name / part number), so the chart isn't blank.
    const { data: parts } = await listParts(inspection.id)
    setItems((prev) => {
      const add = newItems.map((it) => ({ ...it, key: uniqueKey(it.key, prev) }))
      const { items: filled } = mergeScanParts(add, parts ?? [])
      return [...prev, ...filled]
    })
    setSaved(false)
  }

  async function save() {
    setSaving(true)
    const { error } = await saveCompliance(inspection, { items, currentTach })
    setSaving(false)
    if (!error) setSaved(true)
  }

  if (state === 'loading') return <main className="auth-pending" aria-busy="true"><p>Loading…</p></main>
  if (state === 'error') return (
    <main className="auth"><div className="auth__error">Couldn’t load this inspection.</div><Link to="/app" className="auth__toggle">← Back</Link></main>
  )

  return (
    <main className="insp">
      <Link to={`/app/inspections/${id}`} className="auth__toggle"><ChevronLeft size={15} aria-hidden="true" /> Inspection</Link>
      <div className="auth__heading">
        <h1><CalendarClock size={20} aria-hidden="true" /> Timed items &amp; compliance</h1>
        <p>Recurring inspections and life-limited items for this airframe. Enter the last-complied date/time and we’ll flag what’s overdue or due soon.</p>
      </div>

      <div className="insp__progress">
        <span>
          {stats.overdue > 0 && <span className="comp__pill comp__pill--overdue">{stats.overdue} overdue</span>}
          {stats['due-soon'] > 0 && <span className="comp__pill comp__pill--due-soon">{stats['due-soon']} due soon</span>}
          {stats.ok > 0 && <span className="comp__pill comp__pill--ok">{stats.ok} current</span>}
          {stats.unknown > 0 && <span className="comp__pill comp__pill--unknown">{stats.unknown} unknown</span>}
        </span>
        <span className="auth__hint">As of {today()}.</span>
      </div>

      <section className="insp__section">
        <div className="auth__field comp__tach">
          <label htmlFor="cur-tach">Current airframe time (hrs)</label>
          <input id="cur-tach" type="number" inputMode="decimal" step="0.1" placeholder="e.g. 4200.0"
            value={currentTach} onChange={(e) => { setCurrentTach(e.target.value); setSaved(false) }} />
          <span className="auth__hint">Used to compute hours-based items (vacuum pump, life-limited parts).</span>
        </div>
      </section>

      <section className="insp__section">
        {rows.length > 1 && (
          <div className="insp__sectionhead">
            <span className="auth__hint">Timed items</span>
            <span className="lb__bulk">
              On report:
              <button type="button" className="auth__toggle" onClick={() => setAllReport(true)}>All</button>
              <span aria-hidden="true">·</span>
              <button type="button" className="auth__toggle" onClick={() => setAllReport(false)}>None</button>
            </span>
          </div>
        )}
        <ul className="comp__list">
          {rows.map((it) => (
            <ComplianceRow key={it.key} item={it} onPatch={patch} onRemove={removeItem} />
          ))}
        </ul>
        <AddItem onAdd={addCustom} />
      </section>

      <MmScan inspection={inspection} onAdd={addMmItems} />

      <p className="auth__hint comp__scanhint">
        Tip: the recurring items above fill in automatically from your logbook scans (annual, IFR checks,
        ELT, vacuum pump, wing bolts) — scan the books on the Logbook audit and come back here to review.
      </p>

      <div className="insp__savebar">
        <button type="button" className="auth__btn" onClick={save} disabled={saving}>
          <Check size={15} aria-hidden="true" /> {saving ? 'Saving…' : saved ? 'Saved' : 'Save compliance'}
        </button>
      </div>
    </main>
  )
}

function ComplianceRow({ item, onPatch, onRemove }) {
  const { due } = item
  const dueBits = [
    due.dueDate ? `due ${due.dueDate}` : null,
    due.dueTach != null ? `at ${due.dueTach.toFixed(1)} hrs` : null,
    due.daysRemaining != null ? (due.daysRemaining < 0 ? `${-due.daysRemaining} days ago` : `in ${due.daysRemaining} days`) : null,
    due.hoursRemaining != null ? (due.hoursRemaining < 0 ? `${(-due.hoursRemaining).toFixed(1)} hrs over` : `${due.hoursRemaining.toFixed(1)} hrs left`) : null,
  ].filter(Boolean).join(' · ')

  return (
    <li className={`comp__row comp__row--${due.status} ${item.disabled ? 'is-disabled' : ''}`}>
      <div className="comp__rowhead">
        <div className="comp__rowid">
          <span className="comp__label">{item.label}</span>
          <span className="comp__basis">
            {item.basis}
            {item.interval_months ? ` · every ${item.interval_months} mo` : ''}
            {item.interval_hours ? ` · every ${item.interval_hours} hrs` : ''}
            {item.source === 'mm-scan' ? ' · from MM scan' : item.source === 'custom' ? ' · custom' : ''}
          </span>
        </div>
        <span className={`comp__badge comp__badge--${due.status}`}>{statusLabel(due.status)}</span>
      </div>

      {!item.disabled && (
        <>
          <div className="insp__row2">
            <div className="auth__field">
              <label>Last complied (date)</label>
              <input type="date" value={item.last_date ?? ''} onChange={(e) => onPatch(item.key, { last_date: e.target.value || null })} />
            </div>
            <div className="auth__field">
              <label>Last complied (tach)</label>
              <input type="number" inputMode="decimal" step="0.1" value={item.last_tach ?? ''} onChange={(e) => onPatch(item.key, { last_tach: e.target.value === '' ? null : Number(e.target.value) })} />
            </div>
          </div>
          {dueBits && <span className="auth__hint comp__due">{dueBits}</span>}
          <input className="comp__note" type="text" placeholder="Note (optional)" value={item.note ?? ''} onChange={(e) => onPatch(item.key, { note: e.target.value || null })} />
        </>
      )}

      <div className="comp__rowactions">
        <label className="comp__na">
          <input type="checkbox" checked={!!item.disabled} onChange={(e) => onPatch(item.key, { disabled: e.target.checked })} />
          Not applicable
        </label>
        {!item.disabled && (
          <label className="comp__na">
            <input type="checkbox" checked={item.show_on_report !== false} onChange={(e) => onPatch(item.key, { show_on_report: e.target.checked })} />
            On report
          </label>
        )}
        {item.source !== 'standard' && (
          <button type="button" className="insp__flag" onClick={() => onRemove(item.key)} aria-label="Remove item" title="Remove item">
            <Trash2 size={14} aria-hidden="true" />
          </button>
        )}
      </div>
    </li>
  )
}

function AddItem({ onAdd }) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ label: '', basis: '', interval_months: '', interval_hours: '' })
  const [error, setError] = useState(null)
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }))

  if (!open) {
    return (
      <button type="button" className="auth__btn auth__btn--ghost insp__walkthrough" onClick={() => setOpen(true)}>
        <Plus size={15} aria-hidden="true" /> Add item
      </button>
    )
  }
  function submit(e) {
    e.preventDefault()
    if (!f.label.trim()) return setError('Give the item a name.')
    onAdd(f)
    setF({ label: '', basis: '', interval_months: '', interval_hours: '' })
    setError(null)
    setOpen(false)
  }
  return (
    <form className="auth__form insp__additem" onSubmit={submit}>
      <div className="auth__field">
        <label>New timed item</label>
        <input type="text" placeholder="e.g. Fuel bladder replacement" value={f.label} onChange={set('label')} />
      </div>
      <div className="auth__field">
        <label>Basis / reference (optional)</label>
        <input type="text" placeholder="AD, SB, MM life limit…" value={f.basis} onChange={set('basis')} />
      </div>
      <div className="insp__row2">
        <div className="auth__field">
          <label>Every … months (optional)</label>
          <input type="number" inputMode="numeric" placeholder="e.g. 24" value={f.interval_months} onChange={set('interval_months')} />
        </div>
        <div className="auth__field">
          <label>Every … hours (optional)</label>
          <input type="number" inputMode="numeric" placeholder="e.g. 500" value={f.interval_hours} onChange={set('interval_hours')} />
        </div>
      </div>
      {error && <div className="auth__error" role="alert">{error}</div>}
      <div className="insp__capture">
        <button type="submit" className="auth__btn">Add item</button>
        <button type="button" className="auth__btn auth__btn--ghost" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  )
}

// Scan the Maintenance Manual's life-limited / airworthiness-limitations pages →
// Claude vision → review the extracted items → add them as mm-scan compliance items.
function MmScan({ inspection, onAdd }) {
  const [phase, setPhase] = useState('idle') // idle | working | review
  const [drafts, setDrafts] = useState([])
  const [pick, setPick] = useState(new Set())
  const [error, setError] = useState(null)

  async function onPick(files) {
    const list = Array.from(files ?? [])
    if (!list.length) return
    setError(null)
    setPhase('working')
    const paths = []
    for (const f of list) {
      const { data, error: upErr } = await uploadMedia({ orgId: inspection.org_id, inspectionId: inspection.id, purpose: 'logbook', file: f })
      if (!upErr && data) paths.push(data.storage_path)
    }
    const urls = await signedUrlsFor(paths)
    if (!urls.length) { setError('Couldn’t upload the photos. Try again.'); return setPhase('idle') }
    const { data, error: exErr } = await extractLogbooks(urls, inspection.org_id, { kind: 'mm_limits' })
    if (exErr) { setError(exErr.message); return setPhase('idle') }
    const items = limitsToComplianceItems(data?.limits)
    if (!items.length) { setError('No life-limited items found on those pages — try clearer photos of the limits table.'); return setPhase('idle') }
    setDrafts(items)
    setPick(new Set(items.map((_, i) => i)))
    setPhase('review')
  }

  function toggle(i) {
    setPick((p) => { const n = new Set(p); if (n.has(i)) n.delete(i); else n.add(i); return n })
  }
  function apply() {
    onAdd(drafts.filter((_, i) => pick.has(i)))
    setPhase('idle')
    setDrafts([])
  }

  return (
    <section className="insp__section lb__scan">
      <div className="insp__sectionhead">
        <h2><ScanLine size={18} aria-hidden="true" /> Scan MM life-limited pages <span className="lb__beta">beta</span></h2>
      </div>

      {phase === 'idle' && (
        <>
          <p className="auth__hint">Photograph the Maintenance Manual’s life-limited / airworthiness-limitations table and we’ll pull each item and its limit (hours / cycles / calendar) in for you to review.</p>
          {error && <div className="auth__error" role="alert">{error}</div>}
          <PhotoPicker onPick={onPick} multiple takeLabel="Scan MM pages" takeIcon={ScanLine} uploadLabel="Upload pages" className="auth__btn auth__btn--ghost insp__walkthrough" />
        </>
      )}

      {phase === 'working' && <p className="auth__hint" aria-busy="true">Reading the limits pages…</p>}

      {phase === 'review' && (
        <>
          <p className="auth__hint">{pick.size} of {drafts.length} selected. Untick anything you don’t want.</p>
          <ul className="comp__list">
            {drafts.map((it, i) => (
              <li key={it.key} className="comp__row">
                <label className="comp__na">
                  <input type="checkbox" checked={pick.has(i)} onChange={() => toggle(i)} />
                  <span>
                    <span className="comp__label">{it.label}</span>
                    <span className="comp__basis">
                      {it.basis}
                      {it.interval_hours ? ` · ${it.interval_hours} hrs` : ''}
                      {it.interval_months ? ` · ${it.interval_months} mo` : ''}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <div className="insp__capture">
            <button type="button" className="auth__btn" onClick={apply} disabled={pick.size === 0}>Add {pick.size} item{pick.size === 1 ? '' : 's'}</button>
            <button type="button" className="auth__btn auth__btn--ghost" onClick={() => { setPhase('idle'); setDrafts([]) }}>Cancel</button>
          </div>
          <p className="auth__hint">Then set the current airframe time and each item’s last-complied to compute due status. Save when done.</p>
        </>
      )}
    </section>
  )
}

// Ensure a fresh custom key doesn't collide with an existing one.
function uniqueKey(base, items) {
  const keys = new Set((items ?? []).map((i) => i.key))
  if (!keys.has(base)) return base
  let n = 2
  while (keys.has(`${base}_${n}`)) n += 1
  return `${base}_${n}`
}
