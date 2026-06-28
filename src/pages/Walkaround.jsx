// Dictate-the-whole-walk-around tool. Instead of tapping each checklist item and
// dictating one note at a time, the mechanic talks through the ENTIRE walk-around
// in one continuous pass; the `structure-walkaround` edge fn (Claude) splits the
// monologue into discrete findings and maps each to the right checklist item (or
// proposes a new one). Review-before-apply (never auto-apply), then the items are
// patched and the still-pending high-risk items are surfaced to "fill in the blanks."
//
// Reuses: useDictation (continuous, typed/paste fallback for iOS Safari),
// orderByFinancialRisk/riskBand, updateInspectionItem, addCustomItem.

import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, Plane, Ship, Mic, Sparkles, Check, Plus, ArrowRight } from 'lucide-react'
import { getInspection, ensureInspectionItems, updateInspectionItem, addCustomItem } from '../lib/checklist.js'
import { orderByFinancialRisk, riskBand } from '../lib/risk.js'
import { getVertical } from '../lib/verticals.js'
import { useDictation } from '../lib/dictation.js'
import { parseWalkaround, buildReviewRows, planApply, acceptedCount } from '../lib/walkaround.js'
import './auth.css'
import './inspections.css'

const STATUSES = [
  { key: 'ok', label: 'OK' },
  { key: 'monitor', label: 'Monitor' },
  { key: 'discrepancy', label: 'Discrepancy' },
]

export default function Walkaround() {
  const { id } = useParams()
  const [inspection, setInspection] = useState(null)
  const [items, setItems] = useState([])
  const [state, setState] = useState('loading') // loading | record | review | applied | error
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [rows, setRows] = useState([])
  const [applied, setApplied] = useState(null) // { matched, created }
  const dict = useDictation()
  const taRef = useRef(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data: insp, error } = await getInspection(id)
      if (!active) return
      if (error || !insp) return setState('error')
      setInspection(insp)
      const res = await ensureInspectionItems(insp)
      if (!active) return
      if (res.error) return setState('error')
      setItems(res.data)
      setState('record')
    })()
    return () => {
      active = false
    }
  }, [id])

  // Mirror the live transcript into the textarea while dictating.
  useEffect(() => {
    if (dict.listening) {
      setText([dict.transcript, dict.interim].filter(Boolean).join(' ').trim())
    }
  }, [dict.transcript, dict.interim, dict.listening])

  function toggleMic() {
    if (dict.listening) {
      dict.stop()
    } else {
      dict.setTranscript(text)
      dict.start()
    }
  }

  async function parse() {
    setError(null)
    setBusy(true)
    if (dict.listening) dict.stop()
    const { data, error } = await parseWalkaround(text, items, inspection.vertical, inspection.org_id)
    setBusy(false)
    if (error) return setError(error.message)
    const built = buildReviewRows(data.findings, items)
    if (built.length === 0) {
      setError('No findings were parsed — try adding more detail, then parse again.')
      return
    }
    setRows(built)
    setState('review')
  }

  async function apply() {
    setError(null)
    setBusy(true)
    const { patches, newItems } = planApply(rows)
    let matched = 0
    let created = 0
    // Patch matched items.
    for (const p of patches) {
      const { error } = await updateInspectionItem(p.id, p.patch)
      if (!error) matched += 1
    }
    // Create new custom items, then apply their status/severity/findings.
    for (const n of newItems) {
      const { data, error } = await addCustomItem(inspection, n.draft)
      if (error || !data) continue
      await updateInspectionItem(data.id, n.patch)
      created += 1
    }
    setBusy(false)
    // Reload items so the "fill in the blanks" list reflects what's now done.
    const res = await ensureInspectionItems(inspection)
    if (!res.error) setItems(res.data)
    setApplied({ matched, created })
    setState('applied')
  }

  const accepted = useMemo(() => acceptedCount(rows), [rows])

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
  const Icon = cfg.key === 'marine' ? Ship : Plane

  return (
    <main className="insp">
      <Link to={`/app/inspections/${id}`} className="auth__toggle">
        <ChevronLeft size={15} aria-hidden="true" /> Inspection
      </Link>

      <div className="auth__heading">
        <h1>
          <Icon size={20} aria-hidden="true" /> Dictate the walk-around
        </h1>
        <p>
          Talk through the whole {cfg.noun} in one pass — every tire, panel, leak, “looks good.”
          We’ll split it into findings and map each to the right checklist item for you to review.
        </p>
      </div>

      {error && <div className="auth__error" role="alert">{error}</div>}

      {/* ── Record ───────────────────────────────────────────────────────── */}
      {state === 'record' && (
        <section className="insp__walkrec">
          <div className="insp__capture">
            {dict.supported && (
              <button type="button" className={`auth__btn ${dict.listening ? 'insp__capturebtn is-live' : ''}`} onClick={toggleMic}>
                <Mic size={15} aria-hidden="true" /> {dict.listening ? 'Stop dictation' : 'Start dictation'}
              </button>
            )}
          </div>
          {dict.listening && <p className="auth__hint">Listening… just talk. Tap “Stop dictation” when you’re done.</p>}
          {!dict.supported && (
            <p className="auth__hint">Dictation isn’t supported on this browser — type or paste the walk-around below.</p>
          )}

          <textarea
            ref={taRef}
            className="insp__walktext"
            rows={12}
            placeholder="e.g. Left main tire worn to the cords, nose strut a little low, small oil weep at the left valve cover, prop and spinner look good, right brake disc has a lip…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />

          <div className="insp__capture">
            <button type="button" className="auth__btn" onClick={parse} disabled={busy || !text.trim()}>
              <Sparkles size={15} aria-hidden="true" /> {busy ? 'Parsing…' : 'Parse into findings'}
            </button>
            {text.trim() && !busy && (
              <button type="button" className="auth__btn auth__btn--ghost" onClick={() => { setText(''); dict.reset() }}>
                Clear
              </button>
            )}
          </div>
          {items.length === 0 && (
            <p className="auth__hint">
              This inspection has no checklist items yet, so every finding will become a new item.
            </p>
          )}
        </section>
      )}

      {/* ── Review ───────────────────────────────────────────────────────── */}
      {state === 'review' && (
        <section className="insp__walkreview">
          <p className="auth__hint">
            Review each parsed finding, fix anything that’s off, and untick what you don’t want.
            Low-confidence items are flagged — double-check those.
          </p>
          <ol className="insp__items">
            {rows.map((row) => (
              <ReviewRow
                key={row.key}
                row={row}
                items={items}
                onChange={(patch) => setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, ...patch } : r)))}
              />
            ))}
          </ol>
          <div className="insp__capture">
            <button type="button" className="auth__btn" onClick={apply} disabled={busy || accepted === 0}>
              <Check size={15} aria-hidden="true" /> {busy ? 'Applying…' : `Apply ${accepted} finding${accepted === 1 ? '' : 's'}`}
            </button>
            <button type="button" className="auth__btn auth__btn--ghost" onClick={() => setState('record')} disabled={busy}>
              Back to dictation
            </button>
          </div>
        </section>
      )}

      {/* ── Applied / fill in the blanks ─────────────────────────────────── */}
      {state === 'applied' && (
        <FillBlanks inspection={inspection} items={items} applied={applied} onRedictate={() => { setRows([]); setApplied(null); setText(''); dict.reset(); setState('record') }} />
      )}
    </main>
  )
}

function ReviewRow({ row, items, onChange }) {
  const band = row.itemId ? riskBand(items.find((i) => i.id === row.itemId) || {}) : sevBand(row.severity)
  const lowConf = row.confidence === 'low'

  function remap(value) {
    if (value === '__new') {
      onChange({ itemId: null, isNew: true })
    } else {
      const it = items.find((i) => i.id === value)
      onChange({ itemId: value, isNew: false, category: it?.category ?? row.category, title: it?.title ?? row.title })
    }
  }

  return (
    <li className={`insp__item insp__item--${row.status} ${row.accept ? '' : 'insp__walkrow--off'}`}>
      <div className="insp__itemhead">
        <span className={`insp__riskdot insp__riskdot--${band}`} aria-hidden="true" />
        <label className="insp__walkaccept">
          <input type="checkbox" checked={row.accept} onChange={(e) => onChange({ accept: e.target.checked })} />
          <span className="insp__walkmap">
            {row.isNew ? (
              <span className="insp__ownertag"><Plus size={12} aria-hidden="true" /> New item</span>
            ) : null}
            {row.category} · {row.title}
          </span>
        </label>
        {lowConf && <span className="insp__lowconf" title="Low confidence — verify">low confidence</span>}
      </div>

      {/* Re-map to a different item (or new). */}
      <div className="insp__walkremap">
        <label className="auth__hint" htmlFor={`map-${row.key}`}>Maps to</label>
        <select id={`map-${row.key}`} value={row.itemId ?? '__new'} onChange={(e) => remap(e.target.value)}>
          <option value="__new">+ New custom item</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>{i.category} :: {i.title}</option>
          ))}
        </select>
      </div>

      {row.isNew && (
        <div className="insp__row2">
          <div className="auth__field">
            <label htmlFor={`cat-${row.key}`}>Category</label>
            <input id={`cat-${row.key}`} type="text" value={row.category} onChange={(e) => onChange({ category: e.target.value })} />
          </div>
          <div className="auth__field">
            <label htmlFor={`ttl-${row.key}`}>Item title</label>
            <input id={`ttl-${row.key}`} type="text" value={row.title} onChange={(e) => onChange({ title: e.target.value })} />
          </div>
        </div>
      )}

      <div className="insp__statusrow" role="group" aria-label="Status">
        {STATUSES.map((s) => (
          <button
            key={s.key}
            type="button"
            className={`insp__statusbtn ${row.status === s.key ? `is-${s.key}` : ''}`}
            aria-pressed={row.status === s.key}
            onClick={() => onChange({ status: s.key })}
          >
            {s.label}
          </button>
        ))}
      </div>

      <textarea
        className="insp__findings"
        rows={2}
        value={row.finding}
        placeholder="Finding…"
        onChange={(e) => onChange({ finding: e.target.value })}
      />
    </li>
  )
}

function FillBlanks({ inspection, items, applied, onRedictate }) {
  const pending = orderByFinancialRisk(items.filter((i) => !i.status || i.status === 'pending'))
  const reviewed = items.length - pending.length

  return (
    <section className="insp__walkdone">
      <div className="auth__notice">
        <strong>Applied.</strong>{' '}
        {applied.matched > 0 && `${applied.matched} item${applied.matched === 1 ? '' : 's'} updated`}
        {applied.matched > 0 && applied.created > 0 && ', '}
        {applied.created > 0 && `${applied.created} new item${applied.created === 1 ? '' : 's'} added`}
        {applied.matched === 0 && applied.created === 0 && 'Nothing was applied'}
        .
      </div>

      <div className="insp__progress">
        <span>{reviewed} of {items.length} items reviewed</span>
        <span className="auth__hint">Finish the rest, highest risk first.</span>
      </div>

      {pending.length > 0 ? (
        <>
          <h2 className="insp__sectionhead">Fill in the blanks ({pending.length})</h2>
          <p className="auth__hint">These items weren’t mentioned in the walk-around. Work them in the inspection, highest risk first.</p>
          <ol className="insp__items">
            {pending.slice(0, 30).map((i) => (
              <li key={i.id} className="insp__item insp__item--pending">
                <div className="insp__itemhead">
                  <span className={`insp__riskdot insp__riskdot--${riskBand(i)}`} aria-hidden="true" />
                  <span className="insp__itemtitle">
                    <span className="insp__itemcat">{i.category}</span>
                    <span>{i.title}</span>
                  </span>
                </div>
              </li>
            ))}
          </ol>
          {pending.length > 30 && <p className="auth__hint">…and {pending.length - 30} more.</p>}
        </>
      ) : (
        <p className="insp__clean">All items have been reviewed. 🎉</p>
      )}

      <div className="insp__capture">
        <Link to={`/app/inspections/${inspection.id}`} className="auth__btn">
          Go to the inspection <ArrowRight size={15} aria-hidden="true" />
        </Link>
        <button type="button" className="auth__btn auth__btn--ghost" onClick={onRedictate}>
          <Mic size={15} aria-hidden="true" /> Dictate more
        </button>
      </div>
    </section>
  )
}

// Coarse band from severity, for new-item dots (no risk_weight yet).
function sevBand(severity) {
  const s = Number(severity) || 0
  if (s >= 70) return 'high'
  if (s >= 40) return 'medium'
  return 'low'
}
