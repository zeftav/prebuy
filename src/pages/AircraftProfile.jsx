// Aircraft Profile editor — the "spec sheet" that becomes Part 1 of the customer
// report. Captures the broker-listing blocks: a narrative summary, spec & currency
// values, a damage callout, and a categorized equipment list. Saved into
// inspections.attributes.profile (no migration — attributes is a JSONB bag).
//
// The dated maintenance chronology is NOT entered here — it's the logbook events
// (Logbook audit page) and is woven into the report automatically.

import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, FileText, Plus, Trash2, Check } from 'lucide-react'
import { getInspection } from '../lib/checklist.js'
import { normalizeProfile, saveProfile, SPEC_FIELDS, CURRENCY_FIELDS } from '../lib/profile.js'
import { InfoDot } from '../components/Tooltip.jsx'
import './auth.css'
import './inspections.css'

const SPEC_PLACEHOLDER = {
  total_time: '4200',
  engine_smoh: '850',
  engine_notes: 'RAM to new limits, new cams (2019)',
  prop_since: '320',
  prop_notes: 'SNEW, 3-blade (2018)',
  mgtow: '3650',
  empty_weight: '2350',
  useful_load: '1300',
  fuel_capacity: '80',
}

export default function AircraftProfile() {
  const { id } = useParams()
  const [inspection, setInspection] = useState(null)
  const [profile, setProfile] = useState(null)
  const [state, setState] = useState('loading')
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data: insp, error } = await getInspection(id)
      if (!active) return
      if (error || !insp) return setState(error ? 'error' : 'notfound')
      setInspection(insp)
      setProfile(normalizeProfile(insp.attributes?.profile))
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

      {/* Narrative summary */}
      <section className="insp__section">
        <div className="insp__sectionhead">
          <h2>Summary <InfoDot label="A short overview a buyer reads first — overall condition, standout points, anything notable. One short paragraph." /></h2>
        </div>
        <textarea
          className="insp__summaryinput"
          rows={3}
          placeholder="e.g. A well-maintained, hangared A36 with mid-time engine, recent avionics upgrade, and no damage history."
          value={profile.summary}
          onChange={setSummary}
        />
      </section>

      {/* Specs */}
      <section className="insp__section">
        <div className="insp__sectionhead"><h2>Specifications &amp; times</h2></div>
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
