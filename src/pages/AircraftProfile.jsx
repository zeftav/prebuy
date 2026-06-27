// Aircraft Profile editor — the "spec sheet" that becomes Part 1 of the customer
// report. Captures the broker-listing blocks: a narrative summary, spec & currency
// values, a damage callout, and a categorized equipment list. Saved into
// inspections.attributes.profile (no migration — attributes is a JSONB bag).
//
// The dated maintenance chronology is NOT entered here — it's the logbook events
// (Logbook audit page) and is woven into the report automatically.

import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, FileText, Plus, Trash2, Check, ScanLine, Sparkles } from 'lucide-react'
import { getInspection, listInspectionItems } from '../lib/checklist.js'
import { listEvents } from '../lib/logbooks.js'
import {
  normalizeProfile,
  saveProfile,
  extractProfile,
  mergeProfileDraft,
  buildSummaryContext,
  generateNarrative,
  engineLabel,
  propLabel,
  MAX_ENGINES,
  SPEC_FIELDS,
  ENGINE_FIELDS,
  PROP_FIELDS,
  CURRENCY_FIELDS,
} from '../lib/profile.js'
import { uploadMedia, signedUrlsFor } from '../lib/media.js'
import { InfoDot } from '../components/Tooltip.jsx'
import PhotoPicker from '../components/PhotoPicker.jsx'
import './auth.css'
import './inspections.css'

const SPEC_PLACEHOLDER = {
  total_time: '4200',
  mgtow: '3650',
  empty_weight: '2350',
  useful_load: '1300',
  fuel_capacity: '80',
}
const ENGINE_PLACEHOLDER = { smoh: '850', notes: 'RAM to new limits, new cams (2019)' }
const PROP_PLACEHOLDER = { since: '320', notes: 'SNEW, 3-blade (2018)' }

export default function AircraftProfile() {
  const { id } = useParams()
  const [inspection, setInspection] = useState(null)
  const [profile, setProfile] = useState(null)
  const [state, setState] = useState('loading')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [genBusy, setGenBusy] = useState(false)
  const [genError, setGenError] = useState(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data: insp, error } = await getInspection(id)
      if (!active) return
      if (error || !insp) return setState(error ? 'error' : 'notfound')
      setInspection(insp)
      // Seed engine count from the FAA-derived attributes when the profile hasn't set it yet.
      const stored = insp.attributes?.profile
      let np = normalizeProfile(stored)
      if (!stored?.engine_count && insp.attributes?.engine_count > 1) {
        np = normalizeProfile({ ...np, engine_count: insp.attributes.engine_count })
      }
      setProfile(np)
      setState('ready')
    })()
    return () => {
      active = false
    }
  }, [id])

  const isMarine = inspection?.vertical === 'marine'
  const subtitle = useMemo(
    () => [inspection?.year, inspection?.make, inspection?.model].filter(Boolean).join(' '),
    [inspection],
  )

  // Dirty-tracking: any edit clears the "saved" flash.
  const edit = (fn) => {
    setSaved(false)
    setProfile((p) => {
      const next = structuredClone(p)
      fn(next)
      return next
    })
  }
  const setSpec = (k) => (e) => edit((p) => { p.specs[k] = e.target.value })
  const setCurrency = (k) => (e) => edit((p) => { p.currency[k] = e.target.value })
  const setSummary = (e) => edit((p) => { p.summary = e.target.value })
  const setEngine = (i, k) => (e) => edit((p) => { p.engines[i][k] = e.target.value })
  const setProp = (i, k) => (e) => edit((p) => { p.props[i][k] = e.target.value })
  const setLayout = (e) => edit((p) => { p.layout = e.target.value })
  // Changing the count re-normalizes so the engine/prop arrays resize to match.
  const setEngineCount = (n) => {
    setSaved(false)
    setProfile((p) => normalizeProfile({ ...p, engine_count: n }))
  }

  // Merge a reviewed scan draft into the in-progress form (user still Saves).
  function applyScan(filteredDraft) {
    setSaved(false)
    setProfile((p) => mergeProfileDraft(p, filteredDraft))
  }

  // Draft a broker-style narrative from the structured data into the summary field.
  async function onGenerate() {
    setGenBusy(true)
    setGenError(null)
    const [{ data: items }, { data: events }] = await Promise.all([
      listInspectionItems(inspection.id),
      listEvents(inspection.id),
    ])
    const ctx = buildSummaryContext(inspection, profile, events, items)
    const { data, error } = await generateNarrative(ctx)
    setGenBusy(false)
    if (error) return setGenError(error.message)
    edit((p) => { p.summary = data.summary })
  }

  async function onSave() {
    setBusy(true)
    setError(null)
    const { data, error } = await saveProfile(inspection.id, inspection.attributes, profile)
    setBusy(false)
    if (error) return setError(error.message)
    setInspection((p) => ({ ...p, attributes: data }))
    setProfile(normalizeProfile(data.profile))
    setSaved(true)
  }

  if (state === 'loading') {
    return (
      <main className="auth-pending" aria-busy="true"><p>Loading profile…</p></main>
    )
  }
  if (state === 'notfound' || state === 'error') {
    return (
      <main className="auth">
        <div className="auth__error">{state === 'error' ? 'Could not load this inspection.' : 'Inspection not found.'}</div>
        <Link to="/app" className="auth__toggle">← Back to inspections</Link>
      </main>
    )
  }

  return (
    <main className="insp">
      <Link to={`/app/inspections/${id}`} className="auth__toggle">
        <ChevronLeft size={15} aria-hidden="true" /> Back to inspection
      </Link>

      <div className="insp__detailhead">
        <span className="insp__icon" aria-hidden="true"><FileText size={22} /></span>
        <div>
          <h1 className="insp__detailid">{isMarine ? 'Vessel' : 'Aircraft'} profile</h1>
          <p className="insp__detailsub">{[inspection.identifier, subtitle].filter(Boolean).join(' · ')}</p>
        </div>
      </div>

      <p className="auth__hint insp__profileintro">
        This becomes the first half of the customer report — the spec sheet. Fill in what
        you can confirm; blank fields are simply left off the report. The dated maintenance
        timeline comes from the <Link to={`/app/inspections/${id}/logbooks`} className="auth__inlinelink">logbook audit</Link>.
      </p>

      <ScanPrefill inspection={inspection} onApply={applyScan} />

      {/* Narrative summary */}
      <section className="insp__section">
        <div className="insp__sectionhead">
          <h2>Summary <InfoDot label="The overview a buyer reads first — overall condition, standout points, open items. Write it yourself, or draft it from your data with AI and edit." /></h2>
          <button type="button" className="auth__btn auth__btn--ghost insp__genbtn" onClick={onGenerate} disabled={genBusy}>
            <Sparkles size={15} aria-hidden="true" /> {genBusy ? 'Writing…' : 'Write with AI'}
          </button>
        </div>
        <textarea
          className="insp__summaryinput"
          rows={5}
          placeholder="e.g. A well-maintained, hangared A36 with mid-time engine, recent avionics upgrade, and no damage history."
          value={profile.summary}
          onChange={setSummary}
        />
        <p className="auth__hint">
          “Write with AI” drafts a balanced overview from this profile, the logbook events, and the
          inspection findings — original prose grounded only in your data. Always review before saving.
        </p>
        {genError && <div className="auth__error" role="alert">{genError}</div>}
      </section>

      {/* Airframe specs */}
      <section className="insp__section">
        <div className="insp__sectionhead"><h2>Airframe — specifications &amp; times</h2></div>
        <div className="insp__profilegrid">
          {SPEC_FIELDS.map((f) => (
            <div className="auth__field" key={f.key}>
              <label>{f.label}</label>
              <input
                type="text"
                placeholder={SPEC_PLACEHOLDER[f.key] || ''}
                value={profile.specs[f.key]}
                onChange={setSpec(f.key)}
              />
            </div>
          ))}
        </div>
      </section>

      {/* Engines & props (per position) */}
      <section className="insp__section">
        <div className="insp__sectionhead">
          <h2>Engines &amp; propellers <InfoDot label="Single or multi-engine. Convention: #1 is the left engine, #2 the right. Push-pull centerline twins (e.g. Cessna 337) are #1 front / #2 rear." /></h2>
        </div>
        <div className="insp__row2">
          <div className="auth__field">
            <label htmlFor="engcount">Number of engines</label>
            <select id="engcount" value={profile.engine_count} onChange={(e) => setEngineCount(Number(e.target.value))}>
              {Array.from({ length: MAX_ENGINES }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          {profile.engine_count >= 2 && (
            <div className="auth__field">
              <label htmlFor="englayout">Layout</label>
              <select id="englayout" value={profile.layout} onChange={setLayout}>
                <option value="conventional">Conventional (left / right)</option>
                <option value="centerline">Centerline — front / rear (e.g. C337)</option>
              </select>
            </div>
          )}
        </div>
        {profile.engines.map((eng, i) => (
          <div className="insp__enginecard" key={i}>
            <h3 className="insp__enginehead">
              {engineLabel(i, profile.engine_count, profile.layout)}
              {profile.engine_count > 1 && <span className="insp__enginesub"> &amp; {propLabel(i, profile.engine_count, profile.layout)}</span>}
            </h3>
            <div className="insp__profilegrid">
              {ENGINE_FIELDS.map((f) => (
                <div className="auth__field" key={`e${f.key}`}>
                  <label>{f.label === 'Notes' ? 'Engine notes' : f.label}</label>
                  <input type="text" placeholder={ENGINE_PLACEHOLDER[f.key] || ''} value={eng[f.key]} onChange={setEngine(i, f.key)} />
                </div>
              ))}
              {PROP_FIELDS.map((f) => (
                <div className="auth__field" key={`p${f.key}`}>
                  <label>{f.label === 'Notes' ? 'Prop notes' : `Prop ${f.label.toLowerCase()}`}</label>
                  <input type="text" placeholder={PROP_PLACEHOLDER[f.key] || ''} value={profile.props[i]?.[f.key] ?? ''} onChange={setProp(i, f.key)} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* Currency / inspections due */}
      <section className="insp__section">
        <div className="insp__sectionhead">
          <h2>Currency &amp; due dates <InfoDot label="When required inspections/checks come due. Accepts a month (2026-04) or a full date. Overdue and due-soon items are flagged on the report." /></h2>
        </div>
        <div className="insp__profilegrid">
          {CURRENCY_FIELDS.map((f) => (
            <div className="auth__field" key={f.key}>
              <label>{f.label}</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="2026-04"
                value={profile.currency[f.key]}
                onChange={setCurrency(f.key)}
              />
            </div>
          ))}
        </div>
      </section>

      {/* Damage history */}
      <RowEditor
        title="Damage history"
        info="Brokers always state damage explicitly: what happened, when, and what was / was not affected. Leave empty for a clean 'no damage history' callout."
        rows={profile.damage}
        columns={[
          { key: 'date', label: 'Date', placeholder: '2018-06', width: 'narrow' },
          { key: 'summary', label: 'What happened', placeholder: 'Bird strike to RH cowl nose' },
          { key: 'affected', label: 'Affected / not affected', placeholder: 'Cowl replaced; prop & engine not impacted' },
        ]}
        addLabel="Add damage entry"
        onAdd={() => edit((p) => p.damage.push({ date: '', summary: '', affected: '' }))}
        onChange={(i, k, v) => edit((p) => { p.damage[i][k] = v })}
        onRemove={(i) => edit((p) => p.damage.splice(i, 1))}
      />

      {/* Equipment — avionics */}
      <RowEditor
        title="Avionics"
        info="GPS/nav/comm, autopilot + modes, audio panel, transponder/ADS-B, engine monitor, radar, stormscope… Add a condition note where relevant."
        rows={profile.equipment.avionics}
        columns={[
          { key: 'name', label: 'Item', placeholder: 'Garmin GTN 750Xi' },
          { key: 'notes', label: 'Condition / notes', placeholder: 'WAAS, current databases' },
        ]}
        addLabel="Add avionics item"
        onAdd={() => edit((p) => p.equipment.avionics.push({ name: '', notes: '' }))}
        onChange={(i, k, v) => edit((p) => { p.equipment.avionics[i][k] = v })}
        onRemove={(i) => edit((p) => p.equipment.avionics.splice(i, 1))}
      />

      {/* Equipment — additional */}
      <RowEditor
        title="Additional equipment"
        info="Non-avionics extras: FIKI/known-ice, GAMIjectors, oxygen, air conditioning, winglets/VGs, long-range fuel, useful-load mods…"
        rows={profile.equipment.additional}
        columns={[
          { key: 'name', label: 'Item', placeholder: 'TKS known-ice (FIKI)' },
          { key: 'notes', label: 'Condition / notes', placeholder: 'Full system, recently serviced' },
        ]}
        addLabel="Add equipment item"
        onAdd={() => edit((p) => p.equipment.additional.push({ name: '', notes: '' }))}
        onChange={(i, k, v) => edit((p) => { p.equipment.additional[i][k] = v })}
        onRemove={(i) => edit((p) => p.equipment.additional.splice(i, 1))}
      />

      {error && <div className="auth__error" role="alert">{error}</div>}
      <div className="insp__profilesave">
        <button type="button" className="auth__btn" onClick={onSave} disabled={busy}>
          {busy ? 'Saving…' : 'Save profile'}
        </button>
        {saved && (
          <span className="insp__savedflash" role="status">
            <Check size={15} aria-hidden="true" /> Saved
          </span>
        )}
      </div>
    </main>
  )
}

// Scan records (weight & balance, equipment lists, placards, logbook pages) →
// Claude vision → review proposed specs/currency/equipment → merge into the form.
function ScanPrefill({ inspection, onApply }) {
  const [phase, setPhase] = useState('idle') // idle | working | review
  const [draft, setDraft] = useState(null)
  const [error, setError] = useState(null)
  const [pick, setPick] = useState({ specs: new Set(), engine: new Set(), prop: new Set(), currency: new Set(), avionics: new Set(), additional: new Set() })

  async function onPick(files) {
    const list = Array.from(files ?? [])
    if (!list.length) return
    setError(null)
    setPhase('working')
    const paths = []
    for (const f of list) {
      const { data, error } = await uploadMedia({ orgId: inspection.org_id, inspectionId: inspection.id, purpose: 'logbook', file: f })
      if (!error && data) paths.push(data.storage_path)
    }
    const urls = await signedUrlsFor(paths)
    if (!urls.length) {
      setError('Couldn’t upload the photos. Try again.')
      return setPhase('idle')
    }
    const { data, error } = await extractProfile(urls)
    if (error) {
      setError(error.message)
      return setPhase('idle')
    }
    setDraft(data)
    setPick({
      specs: new Set(SPEC_FIELDS.map((f) => f.key).filter((k) => data.specs[k])),
      engine: new Set(ENGINE_FIELDS.map((f) => f.key).filter((k) => data.engine?.[k])),
      prop: new Set(PROP_FIELDS.map((f) => f.key).filter((k) => data.prop?.[k])),
      currency: new Set(CURRENCY_FIELDS.map((f) => f.key).filter((k) => data.currency[k])),
      avionics: new Set(data.equipment.avionics.map((_, i) => i)),
      additional: new Set(data.equipment.additional.map((_, i) => i)),
    })
    setPhase('review')
  }

  function toggle(group, key) {
    setPick((p) => {
      const next = new Set(p[group])
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return { ...p, [group]: next }
    })
  }

  const count = pick.specs.size + pick.engine.size + pick.prop.size + pick.currency.size + pick.avionics.size + pick.additional.size

  function apply() {
    const filtered = {
      specs: Object.fromEntries([...pick.specs].map((k) => [k, draft.specs[k]])),
      engine: Object.fromEntries([...pick.engine].map((k) => [k, draft.engine[k]])),
      prop: Object.fromEntries([...pick.prop].map((k) => [k, draft.prop[k]])),
      currency: Object.fromEntries([...pick.currency].map((k) => [k, draft.currency[k]])),
      equipment: {
        avionics: [...pick.avionics].map((i) => draft.equipment.avionics[i]),
        additional: [...pick.additional].map((i) => draft.equipment.additional[i]),
      },
    }
    onApply(filtered)
    setPhase('idle')
    setDraft(null)
  }

  const specLabel = (k) => SPEC_FIELDS.find((f) => f.key === k)?.label ?? k
  const engLabel = (k) => (ENGINE_FIELDS.find((f) => f.key === k)?.label === 'Notes' ? 'Engine notes' : ENGINE_FIELDS.find((f) => f.key === k)?.label ?? k)
  const prLabel = (k) => (k === 'notes' ? 'Prop notes' : `Prop ${PROP_FIELDS.find((f) => f.key === k)?.label.toLowerCase() ?? k}`)
  const curLabel = (k) => CURRENCY_FIELDS.find((f) => f.key === k)?.label ?? k

  return (
    <section className="insp__section lb__scan">
      <div className="insp__sectionhead">
        <h2><ScanLine size={18} aria-hidden="true" /> Scan to pre-fill <span className="lb__beta">beta</span></h2>
      </div>

      {phase === 'idle' && (
        <>
          <p className="auth__hint">
            Photograph records — a weight &amp; balance / equipment list, avionics placard, or logbook
            pages — and we’ll propose specs, currency, and equipment for you to review. We never
            overwrite anything you’ve already filled in.
          </p>
          <PhotoPicker
            onPick={onPick}
            multiple
            takeLabel="Scan records"
            uploadLabel="Upload files"
            takeIcon={ScanLine}
            className="auth__btn auth__btn--ghost insp__walkthrough"
          />
          {error && <div className="auth__error" role="alert">{error}</div>}
        </>
      )}

      {phase === 'working' && <p className="auth__hint">Reading the records…</p>}

      {phase === 'review' && draft && (
        <div className="lb__review">
          {count === 0 && pick.specs.size + pick.currency.size + draft.equipment.avionics.length + draft.equipment.additional.length === 0 && (
            <p className="auth__hint">Nothing legible found. Try clearer, well-lit photos.</p>
          )}

          {SPEC_FIELDS.some((f) => draft.specs[f.key]) && (
            <ReviewGroup
              title="Airframe specs & times"
              items={SPEC_FIELDS.filter((f) => draft.specs[f.key]).map((f) => ({ key: f.key, label: specLabel(f.key), value: draft.specs[f.key] }))}
              isOn={(it) => pick.specs.has(it.key)}
              onToggle={(it) => toggle('specs', it.key)}
            />
          )}

          {ENGINE_FIELDS.some((f) => draft.engine?.[f.key]) && (
            <ReviewGroup
              title="Engine (→ engine #1)"
              items={ENGINE_FIELDS.filter((f) => draft.engine[f.key]).map((f) => ({ key: f.key, label: engLabel(f.key), value: draft.engine[f.key] }))}
              isOn={(it) => pick.engine.has(it.key)}
              onToggle={(it) => toggle('engine', it.key)}
            />
          )}

          {PROP_FIELDS.some((f) => draft.prop?.[f.key]) && (
            <ReviewGroup
              title="Propeller (→ prop #1)"
              items={PROP_FIELDS.filter((f) => draft.prop[f.key]).map((f) => ({ key: f.key, label: prLabel(f.key), value: draft.prop[f.key] }))}
              isOn={(it) => pick.prop.has(it.key)}
              onToggle={(it) => toggle('prop', it.key)}
            />
          )}

          {[...CURRENCY_FIELDS].some((f) => draft.currency[f.key]) && (
            <ReviewGroup
              title="Currency & due dates"
              items={CURRENCY_FIELDS.filter((f) => draft.currency[f.key]).map((f) => ({ key: f.key, label: curLabel(f.key), value: draft.currency[f.key] }))}
              isOn={(it) => pick.currency.has(it.key)}
              onToggle={(it) => toggle('currency', it.key)}
            />
          )}

          {draft.equipment.avionics.length > 0 && (
            <ReviewGroup
              title="Avionics"
              items={draft.equipment.avionics.map((r, i) => ({ key: i, label: r.name, value: r.notes }))}
              isOn={(it) => pick.avionics.has(it.key)}
              onToggle={(it) => toggle('avionics', it.key)}
            />
          )}

          {draft.equipment.additional.length > 0 && (
            <ReviewGroup
              title="Additional equipment"
              items={draft.equipment.additional.map((r, i) => ({ key: i, label: r.name, value: r.notes }))}
              isOn={(it) => pick.additional.has(it.key)}
              onToggle={(it) => toggle('additional', it.key)}
            />
          )}

          <div className="insp__capture">
            <button type="button" className="auth__btn" disabled={count === 0} onClick={apply}>
              Add {count} to profile
            </button>
            <button type="button" className="auth__btn auth__btn--ghost" onClick={() => { setPhase('idle'); setDraft(null) }}>Discard</button>
          </div>
          <p className="auth__hint">Added fields drop into the form below — review them, then Save.</p>
        </div>
      )}
    </section>
  )
}

function ReviewGroup({ title, items, isOn, onToggle }) {
  return (
    <>
      <h3 className="lb__reviewh">{title}</h3>
      <ul className="insp__list">
        {items.map((it) => (
          <li key={it.key} className="lb__pick" onClick={() => onToggle(it)}>
            <span className={`lb__check ${isOn(it) ? 'is-on' : ''}`}>{isOn(it) && <Check size={13} />}</span>
            <span className="insp__main">
              <span className="insp__id">{it.label}</span>
              {it.value && <span className="insp__sub">{it.value}</span>}
            </span>
          </li>
        ))}
      </ul>
    </>
  )
}

function RowEditor({ title, info, rows, columns, addLabel, onAdd, onChange, onRemove }) {
  return (
    <section className="insp__section">
      <div className="insp__sectionhead">
        <h2>{title} <InfoDot label={info} /></h2>
      </div>
      {rows.length === 0 && <p className="auth__hint">None added.</p>}
      {rows.map((row, i) => (
        <div className="insp__rowedit" key={i}>
          {columns.map((c) => (
            <div className={`auth__field${c.width === 'narrow' ? ' insp__rowedit--narrow' : ''}`} key={c.key}>
              <label>{c.label}</label>
              <input
                type="text"
                placeholder={c.placeholder}
                value={row[c.key] ?? ''}
                onChange={(e) => onChange(i, c.key, e.target.value)}
              />
            </div>
          ))}
          <button
            type="button"
            className="insp__flag insp__rowdel"
            aria-label={`Remove ${title} row ${i + 1}`}
            onClick={() => onRemove(i)}
          >
            <Trash2 size={15} aria-hidden="true" />
          </button>
        </div>
      ))}
      <button type="button" className="auth__btn auth__btn--ghost insp__walkthrough" onClick={onAdd}>
        <Plus size={15} aria-hidden="true" /> {addLabel}
      </button>
    </section>
  )
}
