// Guided inspection detail. Loads the inspection, instantiates its checklist from
// the matching global template on first open, and walks the items in financial-
// risk order (risk.js). Each item: mark ok/monitor/discrepancy/na, dictate a note
// (Web Speech), and "Clean up with AI" → the structure-finding edge fn (Claude)
// turns the raw dictation into a customer-facing finding + suggested severity/status.

import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { Plane, Ship, ChevronLeft, Mic, Sparkles, Images, X, Flag, Plus, Trash2, Share2, Copy, ExternalLink, BookOpen, FileText, Paperclip, ClipboardCheck, Send } from 'lucide-react'
import PhotoPicker from '../components/PhotoPicker.jsx'
import { useAuth } from '../lib/auth.jsx'
import {
  getInspection,
  ensureInspectionItems,
  updateInspectionItem,
  addCustomItem,
  deleteInspectionItem,
} from '../lib/checklist.js'
import { orderByFinancialRisk, riskBand } from '../lib/risk.js'
import { getVertical, profileSchema } from '../lib/verticals.js'
import { useDictation } from '../lib/dictation.js'
import { structureFinding } from '../lib/findings.js'
import { uploadMedia, listMedia, deleteMedia } from '../lib/media.js'
import { updateInspectionMeta, startInspectionFromListing, deleteInspection } from '../lib/inspections.js'
import { fetchMemberships } from '../lib/shops.js'
import { createHandoff, listHandoffs, revokeHandoff, handoffUrl } from '../lib/handoff.js'
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
  const navigate = useNavigate()
  const { user } = useAuth()
  const [inspection, setInspection] = useState(null)
  const [items, setItems] = useState([])
  const [media, setMedia] = useState([])
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

      {isListing ? (
        <div className="insp__progress">
          <span>Broker listing</span>
          <span className="auth__hint">Capture-only — profile, photos & logbooks; no checklist.</span>
        </div>
      ) : (
        <div className="insp__progress">
          <span>{reviewed} of {items.length} items reviewed</span>
          <span className="auth__hint">Worked highest financial risk first.</span>
        </div>
      )}

      <InspectionMeta inspection={inspection} onSave={saveMeta} />

      <div className="insp__tools">
        <Link to={`/app/inspections/${inspection.id}/profile`} className="auth__btn auth__btn--ghost insp__walkthrough">
          <FileText size={15} aria-hidden="true" /> {pSchema.noun} profile
        </Link>
        <Link to={`/app/inspections/${inspection.id}/overview`} className="auth__btn auth__btn--ghost insp__walkthrough">
          <Images size={15} aria-hidden="true" /> Photo walkthrough
        </Link>
        <Link to={`/app/inspections/${inspection.id}/logbooks`} className="auth__btn auth__btn--ghost insp__walkthrough">
          <BookOpen size={15} aria-hidden="true" /> Logbook audit
        </Link>
      </div>

      <PublishBar inspection={inspection} onPublish={publish} onUnpublish={unpublish} />

      {isListing ? (
        <>
          <div className="insp__listingactions">
            <p className="auth__hint">
              Build the {pSchema.noun.toLowerCase()} profile, photos and logbooks above,
              then publish the listing — or send it to a shop for a full pre-purchase inspection.
            </p>
            <button type="button" className="auth__btn auth__btn--ghost insp__walkthrough" onClick={startInspection} disabled={handoffBusy}>
              <ClipboardCheck size={15} aria-hidden="true" /> {handoffBusy ? 'Starting…' : 'Start inspection in this shop'}
            </button>
          </div>
          <HandoffPanel inspection={inspection} userId={user?.id} />
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
        </>
      )}

      {inspection.source_inspection_id && (
        <p className="auth__hint insp__sourcenote">Started from a broker listing.</p>
      )}

      {(role === 'owner' || role === 'admin') && (
        <DangerZone inspection={inspection} isListing={isListing} onDelete={removeInspection} />
      )}
    </main>
  )
}

function DangerZone({ inspection, isListing, onDelete }) {
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const noun = isListing ? 'listing' : 'inspection'
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

function ItemRow({ item, media, inspection, onStatus, onPatch, onRemove, onMediaChange }) {
  const [open, setOpen] = useState(false)
  const [findings, setFindings] = useState(item.findings ?? '')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [docBusy, setDocBusy] = useState(false)
  const dict = useDictation()
  const band = riskBand(item)
  const isDiscrepancy = item.status === 'discrepancy'
  // Photos render as thumbnails; documents (PDF lab reports, etc.) as download links.
  const photos = media.filter((m) => m.kind !== 'document')
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
                  {m.url && <img className="insp__thumb" src={m.url} alt="finding" loading="lazy" />}
                  <button type="button" className="insp__thumbdel" onClick={() => removePhoto(m)} aria-label="Remove photo">
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
