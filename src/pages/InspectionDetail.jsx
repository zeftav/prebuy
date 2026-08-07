// Guided inspection detail. Loads the inspection, instantiates its checklist from
// the matching global template on first open, and walks the items in financial-
// risk order (risk.js). Each item: mark ok/monitor/discrepancy/na, dictate a note
// (Web Speech), and "Clean up with AI" → the structure-finding edge fn (Claude)
// turns the raw dictation into a customer-facing finding + suggested severity/status.

import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { Plane, Ship, ChevronLeft, Mic, Sparkles, Images, X, Flag, Plus, Trash2, Share2, Copy, ExternalLink, BookOpen, FileText, Paperclip, ClipboardCheck, Send, ListChecks, Search, Check, Wrench, CalendarClock, DollarSign } from 'lucide-react'
import PhotoPicker from '../components/PhotoPicker.jsx'
import { useAuth } from '../lib/auth.jsx'
import {
  getInspection,
  ensureInspectionItems,
  updateInspectionItem,
  addCustomItem,
  deleteInspectionItem,
  setInspectionChecklist,
} from '../lib/checklist.js'
import { listShopTemplates } from '../lib/templates.js'
import { orderByFinancialRisk, orderByChecklist, riskBand } from '../lib/risk.js'
import { getVertical, profileSchema } from '../lib/verticals.js'
import { useDictation } from '../lib/dictation.js'
import { structureFinding } from '../lib/findings.js'
import { uploadMedia, listMedia, deleteMedia } from '../lib/media.js'
import { updateInspectionMeta, startInspectionFromListing, deleteInspection } from '../lib/inspections.js'
import { fetchMemberships } from '../lib/shops.js'
import { createHandoff, listHandoffs, revokeHandoff, handoffUrl } from '../lib/handoff.js'
import { publishInspection, unpublishInspection, reportUrl, listRevisions } from '../lib/report.js'
import { listFollowups, addFollowup, updateFollowup, deleteFollowup, openCount, groupByStatus, reasonLabel, FOLLOWUP_REASONS } from '../lib/followups.js'
import { hasPhases, PHASES } from '../lib/templates.js'
import { isBeech } from '../lib/gearrig.js'
import { isCompressionItem, normalizeCompression, cylinderStatus, compressionStats, cylinderOrder, cylCaption, cylTag, saveItemCompression } from '../lib/compression.js'
import { normalizeEstimate, normalizeItemEstimate, hasEstimate, lineTotal, estimateStats, formatUsd, saveItemEstimate, saveEstimateSettings } from '../lib/estimate.js'
import { saveItemAirworthiness } from '../lib/airworthiness.js'
import './auth.css'
import './inspections.css'

const STATUSES = [
  { key: 'ok', label: 'OK' },
  { key: 'monitor', label: 'Monitor' },
  { key: 'discrepancy', label: 'Discrepancy' },
  { key: 'na', label: 'N/A' },
]

// The status dot mirrors the item's result: hollow = not reviewed yet, then the
// same colors as the status buttons (green OK · amber Monitor · red Discrepancy).
const DOT_LABELS = {
  pending: 'Not reviewed yet',
  ok: 'OK',
  monitor: 'Monitor',
  discrepancy: 'Discrepancy',
  na: 'N/A',
}

export default function InspectionDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const [inspection, setInspection] = useState(null)
  const [items, setItems] = useState([])
  const [media, setMedia] = useState([])
  const [followups, setFollowups] = useState([])
  const [state, setState] = useState('loading') // loading | ready | error | notfound
  const [note, setNote] = useState(null)
  const [role, setRole] = useState(null) // caller's role in this inspection's org

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
      else if (res.generic) setNote('generic-template')
      setState('ready')
      const { data: m } = await listMedia(insp.id)
      if (active) setMedia(m)
      const { data: fu } = await listFollowups(insp.id)
      if (active) setFollowups(fu)
    })()
    return () => {
      active = false
    }
  }, [id])

  async function refreshMedia() {
    const { data } = await listMedia(id)
    setMedia(data)
  }

  // Resolve the caller's role in this inspection's org (gates delete to owner/admin).
  useEffect(() => {
    if (!inspection?.org_id) return
    let active = true
    fetchMemberships().then(({ data }) => {
      if (!active) return
      const m = (data ?? []).find((x) => x.org_id === inspection.org_id)
      setRole(m?.role ?? null)
    })
    return () => {
      active = false
    }
  }, [inspection?.org_id])

  // Two-phase checklists (e.g. Savvy) work Phase 1 first, then Phase 2 — and they
  // follow the CHECKLIST's own top-to-bottom sequence (sort_order), not risk order.
  const usesPhases = useMemo(() => hasPhases(items), [items])

  // Stable display order for the standard (non-phased) checklist: risk-ranked ONCE
  // when items load, then held steady so an item doesn't jump as you edit it (e.g.
  // "Clean up with AI" changes status + severity). Re-ranks on reload.
  const [order, setOrder] = useState([])
  useEffect(() => {
    setOrder((prev) => {
      const present = new Set(items.map((i) => i.id))
      const kept = prev.filter((id) => present.has(id))
      const keptSet = new Set(kept)
      const fresh = orderByFinancialRisk(items.filter((i) => !keptSet.has(i.id))).map((i) => i.id)
      return [...kept, ...fresh]
    })
  }, [items])
  const orderedAll = useMemo(() => {
    // Phased/uploaded checklists follow their document order; standard checklists
    // use the stable risk-ranked order.
    if (usesPhases) return orderByChecklist(items)
    const byId = new Map(items.map((i) => [i.id, i]))
    return order.map((id) => byId.get(id)).filter(Boolean)
  }, [usesPhases, order, items])
  const [phaseFilter, setPhaseFilter] = useState(1)
  const ordered = useMemo(
    () => (usesPhases ? orderedAll.filter((i) => Number(i.phase) === phaseFilter) : orderedAll),
    [orderedAll, usesPhases, phaseFilter],
  )

  // Optional filter + re-sort of the items list (default keeps the risk/checklist
  // order). Sorts read data already on the page: AI severity, estimate cost, the
  // airworthiness flag; filters narrow to discrepancies / airworthiness / etc.
  const [itemFilter, setItemFilter] = useState('all') // all | discrepancy | airworthy | monitor | open
  const [itemSort, setItemSort] = useState('default') // default | severity | cost | airworthy
  const displayed = useMemo(() => {
    const attrs = inspection?.attributes ?? {}
    const est = attrs.estimate?.items ?? {}
    const rate = attrs.estimate?.labor_rate ?? null
    const aw = attrs.airworthiness ?? {}
    let list = ordered
    if (itemFilter === 'discrepancy') list = list.filter((i) => i.status === 'discrepancy')
    else if (itemFilter === 'airworthy') list = list.filter((i) => aw[i.id])
    else if (itemFilter === 'monitor') list = list.filter((i) => i.status === 'monitor')
    else if (itemFilter === 'open') list = list.filter((i) => !i.status || i.status === 'pending')
    if (itemSort === 'severity') list = [...list].sort((a, b) => (Number(b.severity) || 0) - (Number(a.severity) || 0))
    else if (itemSort === 'cost') list = [...list].sort((a, b) => lineTotal(est[b.id], rate) - lineTotal(est[a.id], rate))
    else if (itemSort === 'airworthy') list = [...list].sort((a, b) => (aw[b.id] ? 1 : 0) - (aw[a.id] ? 1 : 0))
    return list
  }, [ordered, itemFilter, itemSort, inspection?.attributes])
  const phaseReviewed = (p) => items.filter((i) => Number(i.phase) === p).filter((i) => i.status && i.status !== 'pending').length
  const phaseTotal = (p) => items.filter((i) => Number(i.phase) === p).length
  const reviewed = usesPhases ? phaseReviewed(phaseFilter) : items.filter((i) => i.status && i.status !== 'pending').length
  const shownTotal = usesPhases ? phaseTotal(phaseFilter) : items.length

  // Optimistic patch with revert-on-failure. Returns the error (or null) so callers
  // (e.g. the notes auto-save indicator) can reflect the result.
  async function patchItem(item, patch) {
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, ...patch } : i)))
    const { error } = await updateInspectionItem(item.id, patch)
    if (error) setItems((prev) => prev.map((i) => (i.id === item.id ? item : i)))
    return error ?? null
  }

  function setItemStatus(item, status) {
    const next = status === item.status ? 'pending' : status // tap again to clear
    patchItem(item, { status: next })
  }

  async function addItem(draft) {
    // Tag a manually-added item with the phase you're currently working.
    const withPhase = usesPhases ? { ...draft, phase: phaseFilter } : draft
    const { data, error } = await addCustomItem(inspection, withPhase)
    if (!error && data) setItems((prev) => [...prev, data])
    return error
  }

  async function removeItem(item) {
    setItems((prev) => prev.filter((i) => i.id !== item.id))
    const { error } = await deleteInspectionItem(item.id)
    if (error) setItems((prev) => [...prev, item])
  }

  // Switch which checklist this inspection uses (standard library ↔ a shop template).
  // Only allowed before any template item is worked. Returns an error message or null.
  async function changeChecklist(templateId) {
    const { data, error } = await setInspectionChecklist(inspection, templateId || null)
    if (error) return error.message
    setInspection((p) => {
      const attributes = { ...(p.attributes ?? {}) }
      if (templateId) attributes.template_id = templateId
      else delete attributes.template_id
      return { ...p, attributes }
    })
    setItems(data)
    if (data.length) setNote(null)
    return null
  }

  // ── Follow-ups ("to-investigate" list) ────────────────────────────────────
  async function addFu(draft) {
    const { data, error } = await addFollowup(inspection, draft, user?.id)
    if (!error && data) setFollowups((prev) => [data, ...prev])
    return error
  }

  async function patchFu(fu, patch) {
    setFollowups((prev) => prev.map((f) => (f.id === fu.id ? { ...f, ...patch } : f)))
    const { data, error } = await updateFollowup(fu.id, patch)
    if (error) setFollowups((prev) => prev.map((f) => (f.id === fu.id ? fu : f)))
    else if (data) setFollowups((prev) => prev.map((f) => (f.id === fu.id ? data : f)))
  }

  async function removeFu(fu) {
    setFollowups((prev) => prev.filter((f) => f.id !== fu.id))
    const { error } = await deleteFollowup(fu.id)
    if (error) setFollowups((prev) => [fu, ...prev])
  }

  // Save a compression-test item's structured readings (stored on attributes).
  async function saveCompression(itemId, rec) {
    const { data, error } = await saveItemCompression(inspection, itemId, rec)
    if (!error && data) setInspection((p) => ({ ...p, attributes: data.attributes }))
    return error
  }

  // Repair estimate: per-discrepancy labor/parts + inspection-level rate/on-report.
  async function saveEstimate(itemId, rec) {
    const { data, error } = await saveItemEstimate(inspection, itemId, rec)
    if (!error && data) setInspection((p) => ({ ...p, attributes: data.attributes }))
    return error
  }
  async function saveEstimatePrefs(patch) {
    const { data, error } = await saveEstimateSettings(inspection, patch)
    if (!error && data) setInspection((p) => ({ ...p, attributes: data.attributes }))
    return error
  }

  // Airworthiness flag per discrepancy (must-fix for an annual signoff).
  async function saveAirworthy(itemId, on) {
    const { data, error } = await saveItemAirworthiness(inspection, itemId, on)
    if (!error && data) setInspection((p) => ({ ...p, attributes: data.attributes }))
    return error
  }

  // One-tap "flag for follow-up" from a checklist item.
  async function flagFollowup(item) {
    const note = [item.category, item.title].filter(Boolean).join(' — ')
    await addFu({ note, reason: 'look-deeper', inspectionItemId: item.id })
  }

  async function publish() {
    const { data, error } = await publishInspection(inspection.id)
    if (!error && data) {
      setInspection((p) => ({ ...p, status: 'published', published_at: data.published_at, share_token: data.share_token ?? p.share_token, current_revision: data.revision }))
    }
    return error
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

  const [handoffBusy, setHandoffBusy] = useState(false)
  async function startInspection() {
    setHandoffBusy(true)
    const { data, error } = await startInspectionFromListing(inspection, user?.id)
    setHandoffBusy(false)
    if (!error && data) navigate(`/app/inspections/${data.id}`)
  }

  async function removeInspection() {
    const { error } = await deleteInspection(inspection.id)
    if (error) return error
    navigate('/app', { replace: true })
    return null
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
  const pSchema = profileSchema(inspection.vertical)
  const subtitle = [inspection.year, inspection.make, inspection.model].filter(Boolean).join(' ')
  const isListing = inspection.mode === 'listing'
  const isRecords = inspection.mode === 'records'
  const captureOnly = isListing || isRecords // no prepurchase checklist

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

      {captureOnly ? (
        <div className="insp__progress">
          <span>{isRecords ? 'Aircraft records' : 'Broker listing'}</span>
          <span className="auth__hint">
            {isRecords ? 'Onboarding — scan logbooks, build PDFs, and a searchable records resource.' : 'Capture-only — profile, photos & logbooks; no checklist.'}
          </span>
        </div>
      ) : (
        <div className="insp__progress">
          <span>{reviewed} of {shownTotal} items reviewed</span>
          <span className="auth__hint">Worked highest financial risk first.</span>
        </div>
      )}

      {!captureOnly && usesPhases && (
        <>
          <div className="insp__phasetabs" role="tablist" aria-label="Inspection phase">
            {PHASES.map((p) => (
              <button
                key={p.key}
                type="button"
                role="tab"
                aria-selected={phaseFilter === p.key}
                className={`insp__phasetab ${phaseFilter === p.key ? 'is-active' : ''}`}
                onClick={() => setPhaseFilter(p.key)}
              >
                {p.label} <span className="insp__phasecount">{phaseReviewed(p.key)}/{phaseTotal(p.key)}</span>
              </button>
            ))}
          </div>
          <p className="auth__hint insp__phasehint">
            {phaseFilter === 1
              ? 'Work Phase 1 first (records + a targeted look for deal-breakers), then report before Phase 2.'
              : 'Phase 2 — the detailed inspection. Complete Phase 1 first.'}
          </p>
        </>
      )}

      <InspectionMeta inspection={inspection} onSave={saveMeta} />

      {!captureOnly && (
        <ChecklistPicker
          inspection={inspection}
          items={items}
          onChange={changeChecklist}
        />
      )}

      <div className="insp__tools">
        {isRecords && (
          <Link to={`/app/inspections/${inspection.id}/logbooks`} className="auth__btn insp__walkthrough insp__walkcta">
            <BookOpen size={15} aria-hidden="true" /> Scan logbooks
          </Link>
        )}
        {!captureOnly && (
          <Link to={`/app/inspections/${inspection.id}/walkaround`} className="auth__btn insp__walkthrough insp__walkcta">
            <Mic size={15} aria-hidden="true" /> Dictate walk-around
          </Link>
        )}
        <Link to={`/app/inspections/${inspection.id}/profile`} className="auth__btn auth__btn--ghost insp__walkthrough">
          <FileText size={15} aria-hidden="true" /> {pSchema.noun} profile
        </Link>
        <Link to={`/app/inspections/${inspection.id}/overview`} className="auth__btn auth__btn--ghost insp__walkthrough">
          <Images size={15} aria-hidden="true" /> Photo walkthrough
        </Link>
        <Link to={`/app/inspections/${inspection.id}/logbooks`} className="auth__btn auth__btn--ghost insp__walkthrough">
          <BookOpen size={15} aria-hidden="true" /> Logbook audit
        </Link>
        {cfg.key === 'aviation' && (
          <Link to={`/app/inspections/${inspection.id}/compliance`} className="auth__btn auth__btn--ghost insp__walkthrough">
            <CalendarClock size={15} aria-hidden="true" /> Timed items
          </Link>
        )}
        {!captureOnly && isBeech(inspection.make) && (
          <Link to={`/app/inspections/${inspection.id}/gear-rigging`} className="auth__btn auth__btn--ghost insp__walkthrough">
            <Wrench size={15} aria-hidden="true" /> Gear rigging
          </Link>
        )}
      </div>

      <PublishBar inspection={inspection} onPublish={publish} onUnpublish={unpublish} openFollowups={openCount(followups)} />

      {captureOnly ? (
        <>
          <div className="insp__listingactions">
            <p className="auth__hint">
              {isRecords
                ? 'Scan the logbooks above to build PDF copies and a searchable record of times, events and part numbers — or promote this into a full pre-purchase inspection.'
                : `Build the ${pSchema.noun.toLowerCase()} profile, photos and logbooks above, then publish the listing — or send it to a shop for a full pre-purchase inspection.`}
            </p>
            <button type="button" className="auth__btn auth__btn--ghost insp__walkthrough" onClick={startInspection} disabled={handoffBusy}>
              <ClipboardCheck size={15} aria-hidden="true" /> {handoffBusy ? 'Starting…' : isRecords ? 'Start inspection from these records' : 'Start inspection in this shop'}
            </button>
          </div>
          {isListing && <HandoffPanel inspection={inspection} userId={user?.id} />}
        </>
      ) : (
        <>
          {note === 'no-template' && (
            <div className="auth__notice">
              No checklist template matched {subtitle || 'this aircraft'} yet, so this inspection has no items.
              A matching template needs seeding for its make/model.
            </div>
          )}

          {note === 'generic-template' && (
            <div className="auth__notice">
              No model-specific checklist for {subtitle || 'this aircraft'} yet — started you on the
              <strong> general aircraft survey</strong>. Add or re-prioritize items below to tailor it.
            </div>
          )}

          <ItemFilterBar
            filter={itemFilter} sort={itemSort}
            onFilter={setItemFilter} onSort={setItemSort}
            shown={displayed.length} total={ordered.length}
          />

          <ol className="insp__items">
            {displayed.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                media={media.filter((m) => m.inspection_item_id === item.id)}
                inspection={inspection}
                compression={inspection.attributes?.compression?.[item.id] ?? null}
                estimate={inspection.attributes?.estimate?.items?.[item.id] ?? null}
                laborRate={inspection.attributes?.estimate?.labor_rate ?? null}
                airworthy={inspection.attributes?.airworthiness?.[item.id] === true}
                onStatus={setItemStatus}
                onPatch={patchItem}
                onRemove={removeItem}
                onMediaChange={refreshMedia}
                onFlagFollowup={flagFollowup}
                onSaveCompression={saveCompression}
                onSaveEstimate={saveEstimate}
                onSaveAirworthy={saveAirworthy}
              />
            ))}
          </ol>

          <AddItem onAdd={addItem} />

          <EstimateSummary inspection={inspection} items={ordered} onSavePrefs={saveEstimatePrefs} />

          <FollowupsPanel followups={followups} onAdd={addFu} onPatch={patchFu} onRemove={removeFu} />
        </>
      )}

      {inspection.source_inspection_id && (
        <p className="auth__hint insp__sourcenote">Started from a broker listing.</p>
      )}

      {(role === 'owner' || role === 'admin') && (
        <DangerZone inspection={inspection} noun={isRecords ? 'records' : isListing ? 'listing' : 'inspection'} onDelete={removeInspection} />
      )}
    </main>
  )
}

function DangerZone({ inspection, noun = 'inspection', onDelete }) {
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const match = (inspection.identifier || '').trim()
  const ready = confirm.trim().toUpperCase() === match.toUpperCase() && match.length > 0

  async function doDelete() {
    setBusy(true)
    setError(null)
    const err = await onDelete()
    if (err) {
      setBusy(false)
      setError(err.message || 'Could not delete.')
    }
    // on success the page navigates away
  }

  return (
    <section className="insp__danger">
      {!open ? (
        <button type="button" className="auth__toggle insp__dangerlink" onClick={() => setOpen(true)}>
          <Trash2 size={14} aria-hidden="true" /> Delete this {noun}
        </button>
      ) : (
        <div className="insp__dangerbox">
          <p>
            <strong>Delete this {noun}?</strong> This permanently removes it and all its items, photos,
            documents and logbooks{inspection.status === 'published' ? ', and takes its published report offline' : ''}.
            This can’t be undone.
          </p>
          {error && <div className="auth__error" role="alert">{error}</div>}
          <label className="auth__hint" htmlFor="delconfirm">
            Type <strong>{match}</strong> to confirm
          </label>
          <input
            id="delconfirm"
            type="text"
            autoComplete="off"
            placeholder={match}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <div className="insp__dangeractions">
            <button type="button" className="auth__btn auth__btn--ghost" onClick={() => { setOpen(false); setConfirm(''); setError(null) }}>
              Cancel
            </button>
            <button type="button" className="auth__btn insp__btndanger" onClick={doDelete} disabled={busy || !ready}>
              {busy ? 'Deleting…' : `Delete ${noun}`}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

// Filter + sort control over the items list. Default keeps the risk/checklist
// order; sorts read data already on the page (severity, estimate cost, airworthy).
const ITEM_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'discrepancy', label: 'Discrepancies' },
  { key: 'airworthy', label: 'Airworthiness' },
  { key: 'monitor', label: 'Monitor' },
  { key: 'open', label: 'Not inspected' },
]
function ItemFilterBar({ filter, sort, onFilter, onSort, shown, total }) {
  return (
    <div className="insp__filterbar">
      <div className="insp__filterchips" role="group" aria-label="Filter items">
        {ITEM_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`insp__chip ${filter === f.key ? 'is-on' : ''}`}
            aria-pressed={filter === f.key}
            onClick={() => onFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <label className="insp__sortsel">
        <span>Sort</span>
        <select value={sort} onChange={(e) => onSort(e.target.value)}>
          <option value="default">Risk (default)</option>
          <option value="severity">Severity</option>
          <option value="cost">Est. cost</option>
          <option value="airworthy">Airworthiness first</option>
        </select>
      </label>
      {shown !== total && <span className="auth__hint insp__filtercount">{shown} of {total}</span>}
    </div>
  )
}

function ItemRow({ item, media, inspection, compression, estimate, laborRate, airworthy, onStatus, onPatch, onRemove, onMediaChange, onFlagFollowup, onSaveCompression, onSaveEstimate, onSaveAirworthy }) {
  const [open, setOpen] = useState(false)
  const isCompression = isCompressionItem(item)
  const [findings, setFindings] = useState(item.findings ?? '')
  const [saveState, setSaveState] = useState('idle') // idle | saving | saved | error
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [docBusy, setDocBusy] = useState(false)
  const dict = useDictation()
  const band = riskBand(item)
  const dotStatus = ['ok', 'monitor', 'discrepancy', 'na'].includes(item.status) ? item.status : 'pending'
  const isDiscrepancy = item.status === 'discrepancy'
  // Photos render as thumbnails; documents (PDF lab reports, etc.) as download links.
  // Borescope shots tagged to a cylinder (caption `cyl:N`) show in the compression
  // form instead, so keep them out of the generic gallery.
  const photos = media.filter((m) => m.kind !== 'document' && cylTag(m.caption) == null)
  const docs = media.filter((m) => m.kind === 'document')

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

  async function addDoc(file) {
    if (!file) return
    setDocBusy(true)
    const { error } = await uploadMedia({
      orgId: inspection.org_id,
      inspectionId: inspection.id,
      inspectionItemId: item.id,
      purpose: 'attachment',
      file,
      caption: file.name, // keep the original filename for display
    })
    setDocBusy(false)
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
    const { data, error } = await structureFinding(findings, item.title, inspection.org_id)
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

  const findingsDirty = findings.trim() !== (item.findings ?? '')

  async function saveFindings() {
    if (!findingsDirty) return
    setSaveState('saving')
    const err = await onPatch(item, { findings: findings.trim() || null })
    setSaveState(err ? 'error' : 'saved')
  }

  // Auto-save the note as you type (debounced) — but not while live dictation is
  // streaming into the field (that saves when you stop). Also saves on blur.
  useEffect(() => {
    if (dict.listening || !findingsDirty) return
    const t = setTimeout(() => { saveFindings() }, 1200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findings, dict.listening, item.findings])

  // Let the "Saved ✓" flash fade.
  useEffect(() => {
    if (saveState !== 'saved') return
    const t = setTimeout(() => setSaveState('idle'), 2000)
    return () => clearTimeout(t)
  }, [saveState])

  return (
    <li className={`insp__item insp__item--${item.status || 'pending'}`}>
      <div className="insp__itemhead">
        <span
          className={`insp__statusdot insp__statusdot--${dotStatus}`}
          title={`${DOT_LABELS[dotStatus]} · ${band} financial risk`}
          aria-label={DOT_LABELS[dotStatus]}
        />
        <button type="button" className="insp__itemtitle" onClick={() => setOpen((o) => !o)}>
          <span className="insp__itemcat">
            {item.category}
            {item.owner_priority && <span className="insp__ownertag">★ owner priority</span>}
            {airworthy && isDiscrepancy && <span className="insp__awtag">✈ airworthiness</span>}
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
        <button
          type="button"
          className="insp__flag"
          onClick={() => onFlagFollowup(item)}
          aria-label="Flag for follow-up"
          title="Flag for follow-up — add to the to-investigate list"
        >
          <Search size={15} aria-hidden="true" />
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

      {(open || isDiscrepancy || item.findings || isCompression) && (
        <div className="insp__itembody">
          {item.description && <p className="insp__itemdesc">{item.description}</p>}

          {isCompression && (
            <CompressionForm
              rec={compression}
              onSave={(r) => onSaveCompression(item.id, r)}
              inspection={inspection}
              itemId={item.id}
              media={media}
              onMediaChange={onMediaChange}
            />
          )}

          {isDiscrepancy && (
            <label className="insp__airworthy" title="Must be corrected for an annual / return-to-service signoff">
              <input type="checkbox" checked={airworthy} onChange={(e) => onSaveAirworthy(item.id, e.target.checked)} />
              <Wrench size={14} aria-hidden="true" /> Airworthiness item — required for signoff
            </label>
          )}

          {isDiscrepancy && (
            <EstimateForm rec={estimate} rate={laborRate} onSave={(r) => onSaveEstimate(item.id, r)} />
          )}

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
            <PhotoPicker onPick={(files) => addPhoto(files?.[0])} busy={photoBusy} video takeLabel="Photo / video" uploadLabel="Photo / video" />
            <label className="insp__capturebtn">
              <Paperclip size={15} aria-hidden="true" />
              {docBusy ? 'Uploading…' : 'Attach file'}
              <input
                type="file"
                accept="application/pdf,image/*"
                hidden
                disabled={docBusy}
                onChange={(e) => addDoc(e.target.files?.[0])}
              />
            </label>
          </div>

          {photos.length > 0 && (
            <div className="insp__thumbs">
              {photos.map((m) => (
                <span key={m.id} className="insp__thumbwrap">
                  {m.url && (m.kind === 'video'
                    ? <video className="insp__thumb" src={m.url} controls playsInline preload="metadata" />
                    : <img className="insp__thumb" src={m.url} alt="finding" loading="lazy" />)}
                  <button type="button" className="insp__thumbdel" onClick={() => removePhoto(m)} aria-label="Remove">
                    <X size={12} aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {docs.length > 0 && (
            <ul className="insp__docs">
              {docs.map((m) => (
                <li key={m.id} className="insp__doc">
                  <Paperclip size={13} aria-hidden="true" />
                  {m.url
                    ? <a href={m.url} target="_blank" rel="noreferrer">{m.caption || 'Attachment'}</a>
                    : <span>{m.caption || 'Attachment'}</span>}
                  <button type="button" className="insp__thumbdel insp__docdel" onClick={() => removePhoto(m)} aria-label="Remove attachment">
                    <X size={12} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
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

          <div className="insp__savestatus" aria-live="polite">
            {saveState === 'saving' ? (
              <span className="insp__savestate">Saving…</span>
            ) : saveState === 'error' ? (
              <button type="button" className="insp__savestate is-err" onClick={saveFindings}>Couldn’t save — tap to retry</button>
            ) : findingsDirty ? (
              <span className="insp__savestate is-dirty">Unsaved…</span>
            ) : saveState === 'saved' ? (
              <span className="insp__savestate is-ok"><Check size={12} aria-hidden="true" /> Saved</span>
            ) : null}
          </div>

          {isDiscrepancy && typeof item.severity === 'number' && (
            <span className="auth__hint">AI severity estimate: {item.severity}/100</span>
          )}
        </div>
      )}
    </li>
  )
}

// Differential compression test: the day's master-orifice reading + a value per
// cylinder (XX/80). A cylinder below the master orifice is flagged for a look.
function CompressionForm({ rec, onSave, inspection, itemId, media = [], onMediaChange }) {
  const [data, setData] = useState(() => normalizeCompression(rec))
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [boreBusy, setBoreBusy] = useState(null) // cylinder # currently uploading
  const stats = compressionStats(data)

  // Borescope files usually come off the scope's camera roll — often several at
  // once, image or video. Upload each and tag it to this cylinder.
  async function addBorescope(n, files) {
    const list = Array.from(files ?? [])
    if (!list.length) return
    setBoreBusy(n)
    for (const file of list) {
      await uploadMedia({
        orgId: inspection.org_id, inspectionId: inspection.id, inspectionItemId: itemId,
        purpose: 'discrepancy', caption: cylCaption(n), file,
      })
    }
    setBoreBusy(null)
    onMediaChange?.()
  }
  async function delBorescope(m) {
    await deleteMedia(m)
    onMediaChange?.()
  }

  function setMaster(v) { setData((d) => ({ ...d, master_orifice: v })); setSaved(false) }
  function setNotes(v) { setData((d) => ({ ...d, notes: v })); setSaved(false) }
  function setCyl(i, v) {
    setData((d) => ({ ...d, cylinders: d.cylinders.map((c, j) => (j === i ? { value: v } : c)) }))
    setSaved(false)
  }
  function setCount(n) {
    const count = Math.max(1, Math.min(12, Number(n) || 1))
    setData((d) => ({
      ...d,
      cylinders: Array.from({ length: count }, (_, i) => d.cylinders[i] ?? { value: '' }),
    }))
    setSaved(false)
  }
  async function save() {
    setBusy(true)
    const err = await onSave(data)
    setBusy(false)
    if (!err) setSaved(true)
  }

  return (
    <div className="insp__compression">
      <div className="insp__comprow">
        <div className="auth__field insp__year">
          <label>Master orifice</label>
          <input type="number" inputMode="decimal" placeholder="e.g. 42" value={data.master_orifice} onChange={(e) => setMaster(e.target.value)} />
        </div>
        <div className="auth__field insp__year">
          <label>Cylinders</label>
          <input type="number" inputMode="numeric" min="1" max="12" value={data.cylinders.length} onChange={(e) => setCount(e.target.value)} />
        </div>
        <span className="auth__hint insp__comphint">
          Readings are /80, in test order (1-3-5-2-4-6). {stats.low > 0 ? `${stats.low} below the master orifice` : stats.entered ? 'all above the master orifice' : 'enter each cylinder'}.
        </span>
      </div>
      <div className="insp__compcyls">
        {cylinderOrder(data.cylinders.length).map((i) => {
          const c = data.cylinders[i]
          const st = cylinderStatus(c.value, data.master_orifice)
          return (
            <label key={i} className={`insp__compcyl insp__compcyl--${st}`}>
              <span>#{i + 1}</span>
              <input type="number" inputMode="decimal" placeholder="—" value={c.value} onChange={(e) => setCyl(i, e.target.value)} />
              <span className="insp__compdenom">/80</span>
            </label>
          )
        })}
      </div>

      <div className="insp__borescope">
        <span className="auth__hint">Borescope images per cylinder — upload from your borescope (photos or video), or take a shot. You can add several at once.</span>
        {cylinderOrder(data.cylinders.length).map((i) => {
          const n = i + 1
          const shots = media.filter((m) => cylTag(m.caption) === n && m.kind !== 'document')
          return (
            <div key={n} className="insp__borerow">
              <span className="insp__borenum">#{n}</span>
              <div className="insp__thumbs insp__borethumbs">
                {shots.map((m) => (
                  <span key={m.id} className="insp__thumbwrap">
                    {m.url && (m.kind === 'video'
                      ? <video className="insp__thumb" src={m.url} controls playsInline preload="metadata" />
                      : <img className="insp__thumb" src={m.url} alt={`Cylinder ${n} borescope`} loading="lazy" />)}
                    <button type="button" className="insp__thumbdel" onClick={() => delBorescope(m)} aria-label="Remove">
                      <X size={12} aria-hidden="true" />
                    </button>
                  </span>
                ))}
                <PhotoPicker
                  onPick={(files) => addBorescope(n, files)}
                  multiple
                  video
                  busy={boreBusy === n}
                  takeLabel="Borescope"
                  uploadLabel="Upload"
                  className="insp__capturebtn insp__borepick"
                />
              </div>
            </div>
          )
        })}
      </div>

      <textarea className="insp__findings" rows={2} placeholder="Compression notes (staking, borescope, wet/dry, where the air is going…)" value={data.notes} onChange={(e) => setNotes(e.target.value)} />
      <div className="insp__capture">
        <button type="button" className="auth__btn" onClick={save} disabled={busy}>
          <Check size={15} aria-hidden="true" /> {busy ? 'Saving…' : saved ? 'Saved' : 'Save compression'}
        </button>
      </div>
    </div>
  )
}

// Per-discrepancy repair estimate: labor hours + parts cost (+ optional note).
// The line total uses the inspection's labor rate (set on the Estimate summary).
function EstimateForm({ rec, rate, onSave }) {
  const [f, setF] = useState(() => {
    const n = normalizeItemEstimate(rec)
    return { labor_hours: n.labor_hours ?? '', parts_cost: n.parts_cost ?? '', note: n.note }
  })
  const [saveState, setSaveState] = useState('idle') // idle | saving | saved
  const set = (k) => (e) => { setF((p) => ({ ...p, [k]: e.target.value })); setSaveState('idle') }
  const total = lineTotal(f, rate)
  async function save() {
    setSaveState('saving')
    const err = await onSave(f)
    setSaveState(err ? 'idle' : 'saved')
  }
  return (
    <div className="insp__estimate">
      <div className="insp__estimatehead">
        <DollarSign size={15} aria-hidden="true" /> <strong>Repair estimate</strong>
        {hasEstimate(f) && <span className="insp__estimatetotal">{formatUsd(total)}</span>}
      </div>
      <div className="insp__row2">
        <div className="auth__field">
          <label>Labor (hours)</label>
          <input type="number" inputMode="decimal" step="0.1" placeholder="e.g. 2.5" value={f.labor_hours} onChange={set('labor_hours')} />
        </div>
        <div className="auth__field">
          <label>Parts ($)</label>
          <input type="number" inputMode="decimal" step="1" placeholder="e.g. 400" value={f.parts_cost} onChange={set('parts_cost')} />
        </div>
      </div>
      <input className="insp__findings" type="text" placeholder="Estimate note (part number, sublet, assumptions…)" value={f.note} onChange={set('note')} />
      <div className="insp__capture">
        <button type="button" className="auth__btn auth__btn--ghost" onClick={save} disabled={saveState === 'saving'}>
          <Check size={15} aria-hidden="true" /> {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? 'Saved' : 'Save estimate'}
        </button>
        {rate == null && <span className="auth__hint">Set a labor rate below to price the hours.</span>}
      </div>
    </div>
  )
}

// Estimate rollup for the whole inspection: labor rate, totals across all
// discrepancies, and whether the estimate prints on the customer report.
function EstimateSummary({ inspection, items, onSavePrefs }) {
  const est = normalizeEstimate(inspection.attributes)
  const discrepancies = (items ?? []).filter((i) => i.status === 'discrepancy')
  const priced = discrepancies.filter((i) => est.items[i.id] && hasEstimate(est.items[i.id]))
  const [rate, setRate] = useState(est.labor_rate != null ? String(est.labor_rate) : '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const stats = estimateStats(discrepancies, est.items, est.labor_rate)

  if (!discrepancies.length) return null

  async function saveRate() {
    setSaving(true)
    const err = await onSavePrefs({ labor_rate: rate === '' ? null : Number(rate) })
    setSaving(false)
    if (!err) { setSaved(true); setTimeout(() => setSaved(false), 1500) }
  }

  return (
    <section className="insp__section insp__estsummary">
      <div className="insp__sectionhead">
        <h2><DollarSign size={18} aria-hidden="true" /> Repairs estimate</h2>
      </div>
      <p className="auth__hint">
        {priced.length} of {discrepancies.length} discrepanc{discrepancies.length === 1 ? 'y' : 'ies'} estimated.
        Enter labor hours and parts on each discrepancy above; set your shop labor rate here to price it.
      </p>
      <div className="insp__estsummarygrid">
        <div className="auth__field insp__esrate">
          <label htmlFor="labor-rate">Labor rate ($/hr)</label>
          <input id="labor-rate" type="number" inputMode="decimal" step="1" placeholder="e.g. 95" value={rate}
            onChange={(e) => { setRate(e.target.value); setSaved(false) }} onBlur={saveRate} />
        </div>
        <dl className="insp__esttotals">
          <div><dt>Labor</dt><dd>{stats.laborHours} hr · {formatUsd(stats.laborCost)}</dd></div>
          <div><dt>Parts</dt><dd>{formatUsd(stats.partsCost)}</dd></div>
          <div className="insp__esttotal"><dt>Total estimate</dt><dd>{formatUsd(stats.total)}</dd></div>
        </dl>
      </div>
      <label className="insp__estreport">
        <input type="checkbox" checked={est.show_on_report}
          onChange={(e) => onSavePrefs({ show_on_report: e.target.checked })} />
        Show this estimate on the customer report
      </label>
      {(saving || saved) && <span className="auth__hint" role="status">{saving ? 'Saving…' : 'Saved'}</span>}
    </section>
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

// Choose which checklist this inspection runs on: the standard library (auto by
// make/model) or one of the shop's own uploaded checklists (e.g. a Savvy prebuy).
// Shop templates are opt-in — never applied unless picked. Switching re-instantiates
// the checklist, so it's only offered before any item has been worked.
function ChecklistPicker({ inspection, items, onChange }) {
  const [templates, setTemplates] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const selected = inspection.attributes?.template_id ?? ''

  useEffect(() => {
    let active = true
    listShopTemplates(inspection.org_id).then(({ data }) => {
      if (active) setTemplates(data ?? [])
    })
    return () => {
      active = false
    }
  }, [inspection.org_id])

  if (templates.length === 0) return null // nothing to switch to

  const worked = items.filter((i) => i.template_item_id).some((i) => i.status && i.status !== 'pending')
  // Stale: standard is selected but the items carry phases — only shop templates
  // (e.g. Savvy) have those, so these are leftover items from before checklists
  // became opt-in. Offer a forced rebuild since a same-value <select> can't fire.
  const stale = selected === '' && hasPhases(items)

  async function apply(value) {
    setError(null)
    setBusy(true)
    const err = await onChange(value)
    setBusy(false)
    if (err) setError(err)
  }

  function pick(e) {
    const value = e.target.value
    if (value === selected) return
    apply(value)
  }

  return (
    <div className="insp__checklistpick">
      <label htmlFor="insp-checklist">Checklist</label>
      <select id="insp-checklist" value={selected} onChange={pick} disabled={busy || worked}>
        <option value="">Standard checklist (auto by make/model)</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
            {t.item_count ? ` (${t.item_count} items)` : ''}
          </option>
        ))}
      </select>
      {stale && !worked && (
        <div className="insp__checkliststale">
          <span className="auth__hint">
            This inspection is running an uploaded checklist from before checklists became opt-in. Reset it to
            rebuild on the standard checklist.
          </span>
          <button type="button" className="auth__btn auth__btn--ghost" disabled={busy} onClick={() => apply('')}>
            {busy ? 'Rebuilding…' : 'Reset to standard checklist'}
          </button>
        </div>
      )}
      {worked ? (
        <span className="auth__hint">You’ve started working items — clear them to switch checklists.</span>
      ) : (
        !stale && <span className="auth__hint">Switching rebuilds the checklist. Your uploaded checklists apply only when picked here.</span>
      )}
      {error && <span className="auth__hint" role="alert">{error}</span>}
    </div>
  )
}

function PublishBar({ inspection, onPublish, onUnpublish, openFollowups = 0 }) {
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [revisions, setRevisions] = useState([])
  const [showHistory, setShowHistory] = useState(false)
  const published = inspection.status === 'published'
  const rev = Number(inspection.current_revision) || 0
  const link = reportUrl(inspection.share_token)

  useEffect(() => {
    if (!published) return
    let active = true
    listRevisions(inspection.id).then(({ data }) => { if (active) setRevisions(data ?? []) })
    return () => { active = false }
  }, [published, inspection.id, rev])

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
          <p className="auth__hint">Publish to freeze this report as Revision 1 and create a read-only link. You can keep editing and publish further revisions later.</p>
          {openFollowups > 0 && (
            <p className="auth__hint insp__pubwarn">
              {openFollowups} open follow-up{openFollowups === 1 ? '' : 's'} — work or resolve them first, or mark them to show on the report.
            </p>
          )}
        </div>
        <button type="button" className="auth__btn" disabled={busy} onClick={() => act(onPublish)}>
          <Share2 size={15} aria-hidden="true" /> {busy ? 'Publishing…' : 'Publish report'}
        </button>
      </div>
    )
  }

  const lastRev = revisions[0]
  return (
    <div className="insp__publish is-published">
      <div className="insp__publishtop">
        <span className="insp__status insp__status--published">published{rev ? ` · rev ${rev}` : ''}</span>
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
      <p className="auth__hint">
        The link shows <strong>Revision {rev || 1}</strong>{lastRev?.published_at ? ` (published ${new Date(lastRev.published_at).toLocaleDateString()})` : ''}. Any edits you make now are
        draft — they go live when you publish the next revision.
      </p>
      <div className="insp__capture">
        <button type="button" className="auth__btn" disabled={busy} onClick={() => act(onPublish)}>
          <Share2 size={15} aria-hidden="true" /> {busy ? 'Publishing…' : `Publish revision ${rev + 1}`}
        </button>
        <button type="button" className="auth__toggle" disabled={busy} onClick={() => act(onUnpublish)}>
          Unpublish
        </button>
      </div>
      {revisions.length > 0 && (
        <>
          <button type="button" className="auth__toggle" onClick={() => setShowHistory((v) => !v)}>
            {showHistory ? 'Hide' : 'Revision history'} ({revisions.length})
          </button>
          {showHistory && (
            <ul className="insp__revlist">
              {revisions.map((r) => (
                <li key={r.id} className="insp__revrow">
                  <span className="insp__revnum">Rev {r.revision}</span>
                  <span className="auth__hint">
                    {r.published_at ? new Date(r.published_at).toLocaleString() : ''}
                    {r.note ? ` · ${r.note}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  )
}

// Broker handoff: create a claim link for another shop to pick up this listing.
function HandoffPanel({ inspection, userId }) {
  const [handoffs, setHandoffs] = useState([])
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ to_shop_name: '', to_email: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [copiedId, setCopiedId] = useState(null)

  useEffect(() => {
    listHandoffs(inspection.id).then(({ data }) => setHandoffs(data))
  }, [inspection.id])

  async function create() {
    setBusy(true)
    setError(null)
    const { data, error } = await createHandoff(inspection, { toShopName: f.to_shop_name, toEmail: f.to_email }, userId)
    setBusy(false)
    if (error) return setError(error.message)
    setHandoffs((p) => [data, ...p])
    setF({ to_shop_name: '', to_email: '' })
    setOpen(false)
  }

  async function revoke(h) {
    setHandoffs((p) => p.map((x) => (x.id === h.id ? { ...x, status: 'revoked' } : x)))
    await revokeHandoff(h.id)
  }

  async function copy(h) {
    try {
      await navigator.clipboard.writeText(handoffUrl(h.token))
      setCopiedId(h.id)
      setTimeout(() => setCopiedId(null), 1500)
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <div className="insp__handoff">
      <div className="insp__sectionhead">
        <h2><Send size={18} aria-hidden="true" /> Hand off to an inspecting shop</h2>
      </div>
      <p className="auth__hint">
        Create a secure link and send it to a shop — they claim it into their PreBuy and get this listing
        as a full pre-purchase inspection (profile, photos and logbooks included).
      </p>

      {handoffs.length > 0 && (
        <ul className="insp__list">
          {handoffs.map((h) => (
            <li key={h.id} className="insp__row">
              <span className="insp__main">
                <span className="insp__id">{h.to_shop_name || h.to_email || 'Handoff link'}</span>
                <span className="insp__sub">
                  {h.status === 'pending' ? 'Awaiting claim' : h.status === 'claimed' ? 'Claimed' : 'Revoked'}
                  {h.to_email ? ` · ${h.to_email}` : ''}
                </span>
              </span>
              {h.status === 'pending' && (
                <>
                  <button type="button" className="insp__capturebtn" onClick={() => copy(h)}>
                    <Copy size={14} aria-hidden="true" /> {copiedId === h.id ? 'Copied' : 'Copy link'}
                  </button>
                  <button type="button" className="insp__flag" onClick={() => revoke(h)} aria-label="Revoke handoff">
                    <X size={15} aria-hidden="true" />
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {open ? (
        <div className="auth__form insp__additem">
          <div className="insp__row2">
            <div className="auth__field">
              <label htmlFor="ho-name">Shop name (optional)</label>
              <input id="ho-name" type="text" placeholder="e.g. Falcon Aviation" value={f.to_shop_name} onChange={(e) => setF((p) => ({ ...p, to_shop_name: e.target.value }))} />
            </div>
            <div className="auth__field">
              <label htmlFor="ho-email">Email (optional)</label>
              <input id="ho-email" type="email" placeholder="shop@example.com" value={f.to_email} onChange={(e) => setF((p) => ({ ...p, to_email: e.target.value }))} />
            </div>
          </div>
          <p className="auth__hint">We’ll generate a link to send them. (Auto-email invites are coming soon.)</p>
          {error && <div className="auth__error" role="alert">{error}</div>}
          <div className="insp__capture">
            <button type="button" className="auth__btn" onClick={create} disabled={busy}>{busy ? 'Creating…' : 'Create handoff link'}</button>
            <button type="button" className="auth__btn auth__btn--ghost" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" className="auth__btn auth__btn--ghost insp__walkthrough" onClick={() => setOpen(true)}>
          <Send size={15} aria-hidden="true" /> Create handoff link
        </button>
      )}
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
  const [notes, setNotes] = useState('')
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
    const err = await onAdd({ title, category, description: notes, risk_weight: weight, owner_priority: owner })
    setBusy(false)
    if (err) return setError(err.message)
    setTitle('')
    setCategory('')
    setNotes('')
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
      <div className="auth__field">
        <label htmlFor="add-notes">Notes / what to check (optional)</label>
        <textarea
          id="add-notes"
          className="insp__summaryinput"
          rows={2}
          placeholder="Context, the owner's concern, what to look for…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
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

// Follow-ups / "to-investigate" list — a running backlog of open questions, kept
// separate from findings. Work the list down before publishing; opt any one into
// the customer report's "Recommended for further evaluation" section.
function FollowupsPanel({ followups, onAdd, onPatch, onRemove }) {
  const [adding, setAdding] = useState(false)
  const [note, setNote] = useState('')
  const [reason, setReason] = useState('research')
  const [onReport, setOnReport] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const open = openCount(followups)
  const { open: openList, resolved, dismissed } = groupByStatus(followups)
  const closed = [...resolved, ...dismissed]

  async function submit(e) {
    e.preventDefault()
    setError(null)
    if (!note.trim()) return setError('Write what to follow up on.')
    setBusy(true)
    const err = await onAdd({ note, reason, showOnReport: onReport })
    setBusy(false)
    if (err) return setError(err.message)
    setNote('')
    setReason('research')
    setOnReport(false)
    setAdding(false)
  }

  return (
    <section className="insp__followups">
      <div className="insp__sectionhead">
        <h2><ListChecks size={18} aria-hidden="true" /> Follow-ups {open > 0 && <span className="insp__fucount">{open} open</span>}</h2>
      </div>
      <p className="auth__hint">
        Open questions to chase down — “needs research,” “look deeper,” “awaiting records,” “second opinion.”
        Kept separate from your findings. Mark any to show on the report’s “Recommended for further evaluation.”
      </p>

      {followups.length > 0 && (
        <ul className="insp__fulist">
          {[...openList, ...closed].map((f) => (
            <FollowupRow key={f.id} fu={f} onPatch={onPatch} onRemove={onRemove} />
          ))}
        </ul>
      )}

      {adding ? (
        <form className="auth__form insp__additem" onSubmit={submit}>
          <div className="auth__field">
            <label htmlFor="fu-note">Follow-up</label>
            <textarea
              id="fu-note"
              className="insp__summaryinput"
              rows={2}
              placeholder="e.g. Corrosion at the aft bulkhead — get a borescope look before closing."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div className="auth__field">
            <label htmlFor="fu-reason">Reason</label>
            <select id="fu-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
              {FOLLOWUP_REASONS.map((r) => (
                <option key={r.key} value={r.key}>{r.label}</option>
              ))}
            </select>
          </div>
          <label className="insp__ownercheck">
            <input type="checkbox" checked={onReport} onChange={(e) => setOnReport(e.target.checked)} />
            Show on the customer report (“Recommended for further evaluation”)
          </label>
          {error && <div className="auth__error" role="alert">{error}</div>}
          <div className="insp__capture">
            <button type="submit" className="auth__btn" disabled={busy}>{busy ? 'Adding…' : 'Add follow-up'}</button>
            <button type="button" className="auth__btn auth__btn--ghost" onClick={() => { setAdding(false); setError(null) }}>Cancel</button>
          </div>
        </form>
      ) : (
        <button type="button" className="auth__btn auth__btn--ghost insp__walkthrough" onClick={() => setAdding(true)}>
          <Plus size={15} aria-hidden="true" /> Add follow-up
        </button>
      )}
    </section>
  )
}

function FollowupRow({ fu, onPatch, onRemove }) {
  const isOpen = fu.status === 'open'
  return (
    <li className={`insp__furow insp__furow--${fu.status}`}>
      <div className="insp__fumain">
        <span className="insp__fureason">{reasonLabel(fu.reason)}</span>
        <span className="insp__funote">{fu.note}</span>
        <span className="insp__fumeta">
          {fu.status !== 'open' && <span className="insp__fustatus">{fu.status}</span>}
          {fu.show_on_report && <span className="insp__fureport" title="Shows on the customer report">on report</span>}
        </span>
      </div>
      <div className="insp__fuactions">
        <button
          type="button"
          className={`insp__flag ${fu.show_on_report ? 'is-on' : ''}`}
          onClick={() => onPatch(fu, { show_on_report: !fu.show_on_report })}
          aria-pressed={fu.show_on_report}
          title="Show on the customer report"
        >
          <FileText size={14} aria-hidden="true" />
        </button>
        {isOpen ? (
          <>
            <button type="button" className="insp__flag" onClick={() => onPatch(fu, { status: 'resolved' })} aria-label="Resolve" title="Mark resolved">
              <Check size={15} aria-hidden="true" />
            </button>
            <button type="button" className="insp__flag" onClick={() => onPatch(fu, { status: 'dismissed' })} aria-label="Dismiss" title="Dismiss">
              <X size={15} aria-hidden="true" />
            </button>
          </>
        ) : (
          <button type="button" className="auth__toggle" onClick={() => onPatch(fu, { status: 'open' })} title="Reopen">
            Reopen
          </button>
        )}
        <button type="button" className="insp__flag" onClick={() => onRemove(fu)} aria-label="Delete follow-up" title="Delete">
          <Trash2 size={14} aria-hidden="true" />
        </button>
      </div>
    </li>
  )
}
