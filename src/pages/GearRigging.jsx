// Landing-gear rigging data record (Beech). A structured measurement form: for
// each rigging parameter, the spec is shown and the tech records the measured
// value, marks Pass/Fail, and adds remarks. Stored on the inspection's attributes;
// appears on the report. Offered from the inspection tools for Beech aircraft.

import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, Wrench, Check } from 'lucide-react'
import { getInspection } from '../lib/checklist.js'
import {
  GEAR_RIG_HEADER, GEAR_RIG_GROUPS, GEAR_RIG_SIGNOFF,
  normalizeGearRig, gearRigStats, saveGearRigging,
} from '../lib/gearrig.js'
import './auth.css'
import './inspections.css'

export default function GearRigging() {
  const { id } = useParams()
  const [inspection, setInspection] = useState(null)
  const [rec, setRec] = useState(null)
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
      const r = normalizeGearRig(insp.attributes?.gear_rigging)
      // Prefill identity from the inspection where blank.
      r.header.model = r.header.model || [insp.make, insp.model].filter(Boolean).join(' ')
      r.header.serial = r.header.serial || insp.attributes?.serial || ''
      r.header.registration = r.header.registration || insp.identifier || ''
      setRec(r)
      setState('ready')
    })()
    return () => { active = false }
  }, [id])

  const stats = useMemo(() => (rec ? gearRigStats(rec) : { pass: 0, fail: 0, done: 0, total: 0 }), [rec])

  function setHeader(k, v) { setRec((p) => ({ ...p, header: { ...p.header, [k]: v } })); setSaved(false) }
  function setSign(k, v) { setRec((p) => ({ ...p, signoff: { ...p.signoff, [k]: v } })); setSaved(false) }
  function setRow(k, patch) { setRec((p) => ({ ...p, rows: { ...p.rows, [k]: { ...p.rows[k], ...patch } } })); setSaved(false) }

  async function save() {
    setSaving(true)
    const { error } = await saveGearRigging(inspection, rec)
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
        <h1><Wrench size={20} aria-hidden="true" /> Landing gear rigging</h1>
        <p>Beech gear rigging data record. Record each measured value against the spec and mark Pass/Fail.</p>
      </div>

      <div className="insp__progress">
        <span>{stats.done} of {stats.total} recorded</span>
        <span className="auth__hint">{stats.pass} pass · {stats.fail} fail</span>
      </div>

      {/* Identity */}
      <section className="insp__section">
        <div className="gr__headgrid">
          {GEAR_RIG_HEADER.map((f) => (
            <div key={f.key} className="auth__field">
              <label>{f.label}</label>
              {f.type === 'voltage' ? (
                <div className="insp__verticals" role="radiogroup" aria-label="System voltage">
                  {['14', '28'].map((v) => (
                    <button key={v} type="button" role="radio" aria-checked={rec.header.voltage === v}
                      className={`insp__verticalbtn ${rec.header.voltage === v ? 'is-active' : ''}`} onClick={() => setHeader('voltage', v)}>
                      {v} VDC
                    </button>
                  ))}
                </div>
              ) : (
                <input type="text" value={rec.header[f.key] ?? ''} onChange={(e) => setHeader(f.key, e.target.value)} />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Parameters */}
      {GEAR_RIG_GROUPS.map((g) => (
        <section key={g.title} className="insp__section">
          <div className="insp__sectionhead"><h2>{g.title}</h2></div>
          <ul className="gr__rows">
            {g.rows.map((r) => {
              const row = rec.rows[r.key]
              return (
                <li key={r.key} className={`gr__row ${row.status === 'F' ? 'gr__row--fail' : row.status === 'P' ? 'gr__row--pass' : ''}`}>
                  <div className="gr__rowhead">
                    <span className="gr__label">{r.label}</span>
                    <div className="gr__pf" role="group" aria-label={`Status for ${r.label}`}>
                      <button type="button" className={`gr__pfbtn ${row.status === 'P' ? 'is-pass' : ''}`} onClick={() => setRow(r.key, { status: row.status === 'P' ? '' : 'P' })}>P</button>
                      <button type="button" className={`gr__pfbtn ${row.status === 'F' ? 'is-fail' : ''}`} onClick={() => setRow(r.key, { status: row.status === 'F' ? '' : 'F' })}>F</button>
                    </div>
                  </div>
                  <div className="gr__spec">{r.spec.map((s, i) => <span key={i} className="gr__specline">{s}</span>)}</div>
                  <div className="insp__row2">
                    <div className="auth__field">
                      <label>Measured</label>
                      <input type="text" value={row.measured} onChange={(e) => setRow(r.key, { measured: e.target.value })} />
                    </div>
                    <div className="auth__field">
                      <label>Remarks</label>
                      <input type="text" placeholder={r.remark} value={row.remarks} onChange={(e) => setRow(r.key, { remarks: e.target.value })} />
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      {/* Sign-off */}
      <section className="insp__section">
        <div className="insp__sectionhead"><h2>Sign-off</h2></div>
        <div className="gr__headgrid">
          {GEAR_RIG_SIGNOFF.map((f) => (
            <div key={f.key} className="auth__field">
              <label>{f.label}</label>
              <input type={f.type === 'date' ? 'date' : 'text'} value={rec.signoff[f.key] ?? ''} onChange={(e) => setSign(f.key, e.target.value)} />
            </div>
          ))}
        </div>
      </section>

      <div className="insp__savebar">
        <button type="button" className="auth__btn" onClick={save} disabled={saving}>
          <Check size={15} aria-hidden="true" /> {saving ? 'Saving…' : saved ? 'Saved' : 'Save rigging record'}
        </button>
      </div>
    </main>
  )
}
