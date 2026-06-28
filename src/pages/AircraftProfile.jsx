// Aircraft Profile editor — the "spec sheet" that becomes Part 1 of the customer
// report. Captures the broker-listing blocks: a narrative summary, spec & currency
// values, a damage callout, and a categorized equipment list. Saved into
// inspections.attributes.profile (no migration — attributes is a JSONB bag).
//
// The dated maintenance chronology is NOT entered here — it's the logbook events
// (Logbook audit page) and is woven into the report automatically.

import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, FileText, Plus, Trash2, Check, ScanLine, Sparkles, Globe, ExternalLink } from 'lucide-react'
import { getInspection, listInspectionItems } from '../lib/checklist.js'
import { listEvents } from '../lib/logbooks.js'
import {
  normalizeProfile,
  saveProfile,
  extractProfile,
  mergeProfileDraft,
  researchAsset,
  mergeResearchDraft,
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
import { profileSchema } from '../lib/verticals.js'
import { uploadMedia, signedUrlsFor } from '../lib/media.js'
import { InfoDot } from '../components/Tooltip.jsx'
import PhotoPicker from '../components/PhotoPicker.jsx'
import './auth.css'
import './inspections.css'

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
      let np = normalizeProfile(stored, insp.vertical)
      if (!stored?.engine_count && insp.attributes?.engine_count > 1) {
        np = normalizeProfile({ ...np, engine_count: insp.attributes.engine_count }, insp.vertical)
      }
      setProfile(np)
      setState('ready')
    })()
    return () => {
      active = false
    }
  }, [id])

  const schema = profileSchema(inspection?.vertical)
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
    setProfile((p) => normalizeProfile({ ...p, engine_count: n }, inspection.vertical))
  }

  // Merge a reviewed scan draft into the in-progress form (user still Saves).
  function applyScan(filteredDraft) {
    setSaved(false)
    setProfile((p) => mergeProfileDraft(p, filteredDraft))
  }

  // Merge a reviewed AI-research draft into the in-progress form.
  function applyResearch(filteredDraft) {
    setSaved(false)
    setProfile((p) => mergeResearchDraft(p, filteredDraft, inspection.vertical))
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
    const { data, error } = await generateNarrative(ctx, inspection.org_id)
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
    setProfile(normalizeProfile(data.profile, inspection.vertical))
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
          <h1 className="insp__detailid">{schema.noun} profile</h1>
          <p className="insp__detailsub">{[inspection.identifier, subtitle].filter(Boolean).join(' · ')}</p>
        </div>
      </div>

      <p className="auth__hint insp__profileintro">
        This becomes the first half of the customer report — the spec sheet. Fill in what
        you can confirm; blank fields are simply left off the report. The dated maintenance
        timeline comes from the <Link to={`/app/inspections/${id}/logbooks`} className="auth__inlinelink">logbook audit</Link>.
      </p>

      <ResearchPrefill inspection={inspection} schema={schema} onApply={applyResearch} />

      {schema.canScan && <ScanPrefill inspection={inspection} onApply={applyScan} />}

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
          placeholder={schema.summaryPlaceholder}
          value={profile.summary}
          onChange={setSummary}
        />
        <p className="auth__hint">
          “Write with AI” drafts a balanced overview from this profile, the logbook events, and the
          inspection findings — original prose grounded only in your data. Always review before saving.
        </p>
        {genError && <div className="auth__error" role="alert">{genError}</div>}
      </section>

      {/* Specifications */}
      <section className="insp__section">
        <div className="insp__sectionhead"><h2>{schema.specTitle}</h2></div>
        <div className="insp__profilegrid">
          {schema.specFields.map((f) => (
            <div className="auth__field" key={f.key}>
              <label>{f.label}</label>
              <input
                type="text"
                placeholder={f.placeholder || ''}
                value={profile.specs[f.key] ?? ''}
                onChange={setSpec(f.key)}
              />
            </div>
          ))}
        </div>
      </section>

      {/* Engines & props (per position) — only for verticals that have engines */}
      {schema.hasEngines && (
        <section className="insp__section">
          <div className="insp__sectionhead">
            <h2>{schema.enginesTitle} <InfoDot label={schema.enginesInfo} /></h2>
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
                {profile.engine_count > 1 && schema.propFields.length > 0 && <span className="insp__enginesub"> &amp; {propLabel(i, profile.engine_count, profile.layout)}</span>}
              </h3>
              <div className="insp__profilegrid">
                {schema.engineFields.map((f) => (
                  <div className="auth__field" key={`e${f.key}`}>
                    <label>{f.label === 'Notes' ? 'Engine notes' : f.label}</label>
                    <input type="text" placeholder={f.placeholder || ''} value={eng[f.key] ?? ''} onChange={setEngine(i, f.key)} />
                  </div>
                ))}
                {schema.propFields.map((f) => (
                  <div className="auth__field" key={`p${f.key}`}>
                    <label>{f.label === 'Notes' ? 'Prop notes' : `Prop ${f.label.toLowerCase()}`}</label>
                    <input type="text" placeholder={f.placeholder || ''} value={profile.props[i]?.[f.key] ?? ''} onChange={setProp(i, f.key)} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {/* Currency / due dates */}
      {schema.currencyFields.length > 0 && (
        <section className="insp__section">
          <div className="insp__sectionhead">
            <h2>{schema.currencyTitle} <InfoDot label={schema.currencyInfo} /></h2>
          </div>
          <div className="insp__profilegrid">
            {schema.currencyFields.map((f) => (
              <div className="auth__field" key={f.key}>
                <label>{f.label}</label>
                <input
                  type="text"
                  placeholder={schema.currencyPlaceholder || ''}
                  value={profile.currency[f.key] ?? ''}
                  onChange={setCurrency(f.key)}
                />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Damage / history */}
      <RowEditor
        title={schema.damageTitle}
        info={schema.damageInfo}
        rows={profile.damage}
        columns={schema.damageColumns}
        addLabel="Add entry"
        onAdd={() => edit((p) => p.damage.push({ date: '', summary: '', affected: '' }))}
        onChange={(i, k, v) => edit((p) => { p.damage[i][k] = v })}
        onRemove={(i) => edit((p) => p.damage.splice(i, 1))}
      />

      {/* Equipment groups (relabeled per vertical; stored as avionics / additional) */}
      {schema.equipmentGroups.map((g) => (
        <RowEditor
          key={g.key}
          title={g.title}
          info={g.info}
          rows={profile.equipment[g.key]}
          columns={[
            { key: 'name', label: 'Item', placeholder: g.itemPlaceholder },
            { key: 'notes', label: 'Condition / notes', placeholder: g.notesPlaceholder },
          ]}
          addLabel={g.addLabel}
          onAdd={() => edit((p) => p.equipment[g.key].push({ name: '', notes: '' }))}
          onChange={(i, k, v) => edit((p) => { p.equipment[g.key][i][k] = v })}
          onRemove={(i) => edit((p) => p.equipment[g.key].splice(i, 1))}
        />
      ))}

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

// Research the asset's spec sheet from year/make/model (Claude + web search) →
// review proposed specs/currency/engines/equipment/summary → merge into the form.
// Works for any vertical (uses the vertical's profile schema); needs make/model.
function ResearchPrefill({ inspection, schema, onApply }) {
  const [phase, setPhase] = useState('idle') // idle | working | review | error
  const [draft, setDraft] = useState(null)
  const [error, setError] = useState(null)
  const [pick, setPick] = useState({ specs: new Set(), currency: new Set(), engines: new Set(), avionics: new Set(), additional: new Set(), summary: true })

  const canRun = Boolean(inspection.make || inspection.model || inspection.identifier)

  async function run() {
    setError(null)
    setPhase('working')
    const { data, error } = await researchAsset(inspection, inspection.org_id)
    if (error) {
      setError(error.message)
      return setPhase('idle')
    }
    setDraft(data)
    setPick({
      specs: new Set(schema.specFields.map((f) => f.key).filter((k) => data.specs?.[k])),
      currency: new Set((schema.currencyFields ?? []).map((f) => f.key).filter((k) => data.currency?.[k])),
      engines: new Set((data.engines ?? []).map((_, i) => i)),
      avionics: new Set((data.equipment?.avionics ?? []).map((_, i) => i)),
      additional: new Set((data.equipment?.additional ?? []).map((_, i) => i)),
      summary: Boolean(data.summary),
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

  function apply() {
    const eng = (draft.engines ?? []).map((e, i) => (pick.engines.has(i) ? e : {}))
    const prp = (draft.props ?? []).map((p, i) => (pick.engines.has(i) ? p : {}))
    onApply({
      summary: pick.summary ? draft.summary : '',
      specs: Object.fromEntries([...pick.specs].map((k) => [k, draft.specs[k]])),
      currency: Object.fromEntries([...pick.currency].map((k) => [k, draft.currency?.[k]])),
      engines: eng,
      props: prp,
      equipment: {
        avionics: [...pick.avionics].map((i) => draft.equipment.avionics[i]),
        additional: [...pick.additional].map((i) => draft.equipment.additional[i]),
      },
    })
    setPhase('idle')
    setDraft(null)
  }

  const specLabel = (k) => schema.specFields.find((f) => f.key === k)?.label ?? k
  const curLabel = (k) => (schema.currencyFields ?? []).find((f) => f.key === k)?.label ?? k
  const engineValue = (i) =>
    [...schema.engineFields.map((f) => draft.engines?.[i]?.[f.key]), ...schema.propFields.map((f) => draft.props?.[i]?.[f.key])]
      .filter(Boolean)
      .join(' · ')
  const count =
    pick.specs.size + pick.currency.size + pick.engines.size + pick.avionics.size + pick.additional.size + (pick.summary && draft?.summary ? 1 : 0)

  return (
    <section className="insp__section lb__scan">
      <div className="insp__sectionhead">
        <h2><Globe size={18} aria-hidden="true" /> Research with AI <span className="lb__beta">beta</span></h2>
      </div>

      {phase !== 'review' && (
        <>
          <p className="auth__hint">
            Look up this {schema.noun.toLowerCase()}’s published specs from the make/model and pre-fill the
            profile. These are <strong>typical for the model</strong> — a draft to verify against the actual
            {' '}{schema.noun.toLowerCase()}, with sources. We never overwrite anything you’ve filled in.
          </p>
          <button type="button" className="auth__btn auth__btn--ghost insp__walkthrough" onClick={run} disabled={!canRun || phase === 'working'}>
            <Globe size={15} aria-hidden="true" /> {phase === 'working' ? 'Researching…' : 'Research with AI'}
          </button>
          {phase === 'working' && <p className="auth__hint">Searching the web and compiling specs — this can take up to a minute.</p>}
          {!canRun && <p className="auth__hint">Add a make/model (or look up the identifier) first.</p>}
          {error && <div className="auth__error" role="alert">{error}</div>}
        </>
      )}

      {phase === 'review' && draft && (
        <div className="lb__review">
          <p className="auth__hint">
            {draft.model_guess ? <>Identified: <strong>{draft.model_guess}</strong>{draft.confidence ? ` (${draft.confidence} confidence)` : ''}. </> : null}
            Tick what to keep — picked fields fill blanks in the form below; review, then Save.
          </p>

          {draft.summary && (
            <ReviewGroup
              title="Summary"
              items={[{ key: 'summary', label: draft.summary, value: '' }]}
              isOn={() => pick.summary}
              onToggle={() => setPick((p) => ({ ...p, summary: !p.summary }))}
            />
          )}

          {schema.specFields.some((f) => draft.specs?.[f.key]) && (
            <ReviewGroup
              title="Specifications"
              items={schema.specFields.filter((f) => draft.specs[f.key]).map((f) => ({ key: f.key, label: specLabel(f.key), value: draft.specs[f.key] }))}
              isOn={(it) => pick.specs.has(it.key)}
              onToggle={(it) => toggle('specs', it.key)}
            />
          )}

          {(schema.currencyFields ?? []).some((f) => draft.currency?.[f.key]) && (
            <ReviewGroup
              title={schema.currencyTitle}
              items={schema.currencyFields.filter((f) => draft.currency?.[f.key]).map((f) => ({ key: f.key, label: curLabel(f.key), value: draft.currency[f.key] }))}
              isOn={(it) => pick.currency.has(it.key)}
              onToggle={(it) => toggle('currency', it.key)}
            />
          )}

          {(draft.engines ?? []).length > 0 && (
            <ReviewGroup
              title={schema.enginesTitle ?? 'Engines'}
              items={draft.engines.map((_, i) => ({ key: i, label: engineLabel(i, draft.engines.length, 'conventional'), value: engineValue(i) }))}
              isOn={(it) => pick.engines.has(it.key)}
              onToggle={(it) => toggle('engines', it.key)}
            />
          )}

          {(draft.equipment?.avionics ?? []).length > 0 && (
            <ReviewGroup
              title={schema.equipmentGroups?.[0]?.title ?? 'Avionics'}
              items={draft.equipment.avionics.map((r, i) => ({ key: i, label: r.name, value: r.notes }))}
              isOn={(it) => pick.avionics.has(it.key)}
              onToggle={(it) => toggle('avionics', it.key)}
            />
          )}

          {(draft.equipment?.additional ?? []).length > 0 && (
            <ReviewGroup
              title={schema.equipmentGroups?.[1]?.title ?? 'Additional equipment'}
              items={draft.equipment.additional.map((r, i) => ({ key: i, label: r.name, value: r.notes }))}
              isOn={(it) => pick.additional.has(it.key)}
              onToggle={(it) => toggle('additional', it.key)}
            />
          )}

          {Array.isArray(draft.sources) && draft.sources.length > 0 && (
            <>
              <h3 className="lb__reviewh">Sources</h3>
              <ul className="insp__list">
                {draft.sources.map((s, i) => (
                  <li key={i} className="insp__sub">
                    <a href={s.url} target="_blank" rel="noreferrer" className="auth__inlinelink">
                      <ExternalLink size={12} aria-hidden="true" /> {s.title || s.url}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="insp__capture">
            <button type="button" className="auth__btn" disabled={count === 0} onClick={apply}>
              Add {count} to profile
            </button>
            <button type="button" className="auth__btn auth__btn--ghost" onClick={() => { setPhase('idle'); setDraft(null) }}>Discard</button>
          </div>
          <p className="auth__hint">AI-suggested and typical for the model — always confirm against the actual {schema.noun.toLowerCase()} before publishing.</p>
        </div>
      )}
    </section>
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
