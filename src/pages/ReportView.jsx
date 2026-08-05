// Public customer-facing report (no login). Fetches a published inspection by its
// share token via the `report` edge fn and renders it read-only as a professional
// two-part document:
//   Part 1 — Aircraft profile: narrative summary, spec & currency cards, damage
//            callout, dated maintenance timeline, categorized equipment, photos.
//   Part 2 — Inspection findings: risk-ordered discrepancies / monitors / cleared.
// Part 1 blocks render only when they have data, so legacy reports (no profile)
// degrade to just the findings. "Print / Save PDF" uses the browser print dialog.

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Plane, Ship, Printer, AlertTriangle, Eye, Check, ShieldCheck, Wrench, Paperclip, Search } from 'lucide-react'
import { fetchReport, reportSummary } from '../lib/report.js'
import { reasonLabel } from '../lib/followups.js'
import { normalizeGearRig, isGearRigEmpty, gearRigStats, GEAR_RIG_GROUPS } from '../lib/gearrig.js'
import { normalizeCompliance, complianceRows, statusLabel } from '../lib/compliance.js'
import { normalizeCompression, cylinderStatus, isCompressionEmpty, isCompressionItem, cylTag } from '../lib/compression.js'
import { orderByFinancialRisk, riskBand } from '../lib/risk.js'
import {
  normalizeProfile,
  isProfileEmpty,
  fieldRows,
  currencyStatus,
  engineLabel,
} from '../lib/profile.js'
import { profileSchema } from '../lib/verticals.js'
import { categoryLabel } from '../lib/logbooks.js'
import './report.css'

const STATUS_LABEL = { discrepancy: 'Discrepancy', monitor: 'Monitor', ok: 'OK', na: 'N/A', pending: 'Not inspected' }

const fmtEventDate = (d) => {
  if (!d) return ''
  const t = Date.parse(d.length === 7 ? `${d}-01` : d)
  if (Number.isNaN(t)) return d
  return new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', ...(d.length > 7 ? { day: 'numeric' } : {}) })
}

export default function ReportView() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [state, setState] = useState('loading')

  useEffect(() => {
    let active = true
    fetchReport(token).then(({ data, error }) => {
      if (!active) return
      if (error || !data) return setState('notfound')
      setData(data)
      setState('ready')
    })
    return () => {
      active = false
    }
  }, [token])

  if (state === 'loading') {
    return (
      <main className="report report--center" aria-busy="true">
        <p>Loading report…</p>
      </main>
    )
  }
  if (state === 'notfound') {
    return (
      <main className="report report--center">
        <h1>Report not available</h1>
        <p>This report link is invalid, or the report hasn’t been published.</p>
      </main>
    )
  }

  const { shop, inspection, items, overview, events = [], followups = [], documents = [], parts = [], revision = null } = data
  const ordered = orderByFinancialRisk(items)
  const discrepancies = ordered.filter((i) => i.status === 'discrepancy')
  const monitors = ordered.filter((i) => i.status === 'monitor')
  const cleared = ordered.filter((i) => i.status === 'ok' || i.status === 'na')
  const counts = reportSummary(items)
  const asset = [inspection.year, inspection.make, inspection.model].filter(Boolean).join(' ')
  const isMarine = inspection.vertical === 'marine'
  const schema = profileSchema(inspection.vertical)
  const assetWord = schema.noun
  const published = inspection.published_at ? new Date(inspection.published_at).toLocaleDateString() : ''
  const inspected = inspection.inspection_date
    ? new Date(inspection.inspection_date + 'T00:00:00').toLocaleDateString()
    : published

  const isListing = inspection.mode === 'listing'
  const profile = normalizeProfile(inspection.profile, inspection.vertical)
  const hasProfile = !isProfileEmpty(profile, inspection.vertical)
  const specRows = fieldRows(profile.specs, schema.specFields)
  const currencyRows = fieldRows(profile.currency, schema.currencyFields)
  // Per-position engine + prop cards (each engine paired with its prop).
  const engineBlocks = (schema.hasEngines ? profile.engines : [])
    .map((eng, i) => {
      const rows = [
        ...fieldRows(eng, schema.engineFields).map((r) => ({ ...r, key: `e${r.key}` })),
        ...fieldRows(profile.props[i] || {}, schema.propFields).map((r) => ({
          ...r,
          key: `p${r.key}`,
          label: r.label === 'Notes' ? 'Prop notes' : `Prop ${r.label.toLowerCase()}`,
        })),
      ]
      return { i, title: engineLabel(i, profile.engine_count, profile.layout), rows }
    })
    .filter((b) => b.rows.length)
  // Part 1 is worth a header if there's any profile data, a maintenance timeline, or photos.
  const hasPart1 = hasProfile || events.length > 0 || overview.length > 0 || documents.length > 0 || parts.length > 0

  return (
    <main className="report">
      <div className="report__actions">
        <button type="button" className="report__print" onClick={() => window.print()}>
          <Printer size={16} aria-hidden="true" /> Print / Save PDF
        </button>
      </div>

      <header className="report__head">
        <div className="report__shop">
          {isMarine ? <Ship size={22} aria-hidden="true" /> : <Plane size={22} aria-hidden="true" />}
          <span>{shop.name}</span>
        </div>
        <h1>{isListing ? `${assetWord} Listing` : 'Pre-Purchase Inspection Report'}</h1>
        <div className="report__meta">
          <Meta label={assetWord} value={asset || '—'} />
          <Meta label="Identifier" value={inspection.identifier} />
          {inspection.serial && <Meta label="Serial" value={inspection.serial} />}
          {inspection.customer_name && <Meta label="Prepared for" value={inspection.customer_name} />}
          {inspection.inspector_name && <Meta label="Inspected by" value={inspection.inspector_name} />}
          {inspection.location && <Meta label="Location" value={inspection.location} />}
          {inspected && <Meta label="Inspection date" value={inspected} />}
        </div>
      </header>

      {profile.summary && <p className="report__lede">{profile.summary}</p>}

      {/* ── Part 1 — Aircraft profile ─────────────────────────────────────── */}
      {hasPart1 && (
        <>
          {!isListing && <PartHeader n="1" title={`${assetWord} profile`} />}

          {specRows.length > 0 && (
            <section className="report__section">
              <h2>Specifications</h2>
              <div className="report__cards">
                {specRows.map((r) => (
                  <div className="report__card" key={r.key}>
                    <span className="report__cardlabel">{r.label}</span>
                    <span className="report__cardval">{r.value}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {currencyRows.length > 0 && (
            <section className="report__section">
              <h2>{schema.currencyTitle}</h2>
              <div className="report__cards">
                {currencyRows.map((r) => {
                  const st = currencyStatus(profile.currency[r.key])
                  return (
                    <div className={`report__card report__card--cur${st ? ` report__card--${st}` : ''}`} key={r.key}>
                      <span className="report__cardlabel">{r.label}</span>
                      <span className="report__cardval">
                        {r.value}
                        {st === 'overdue' && <span className="report__curtag report__curtag--bad">Overdue</span>}
                        {st === 'due-soon' && <span className="report__curtag report__curtag--warn">Due soon</span>}
                      </span>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {engineBlocks.length > 0 && (
            <section className="report__section">
              <h2>{schema.enginesTitle}</h2>
              {engineBlocks.map((b) => (
                <div className="report__engineblock" key={b.i}>
                  {profile.engine_count > 1 && <h3 className="report__enginehead">{b.title}</h3>}
                  <div className="report__cards">
                    {b.rows.map((r) => (
                      <div className="report__card" key={r.key}>
                        <span className="report__cardlabel">{r.label}</span>
                        <span className="report__cardval">{r.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          )}

          {/* Damage callout — brokers always state it explicitly. */}
          {hasProfile && (
            <section className="report__section">
              <h2>{schema.damageTitle}</h2>
              {profile.damage.length > 0 ? (
                <div className="report__damage">
                  {profile.damage.map((d, i) => (
                    <div className="report__damagerow" key={i}>
                      <AlertTriangle size={16} aria-hidden="true" className="report__damageicon" />
                      <div>
                        <p className="report__damagesummary">
                          {d.date && <span className="report__damagedate">{fmtEventDate(d.date)} — </span>}
                          {d.summary}
                        </p>
                        {d.affected && <p className="report__damageaffected">{d.affected}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="report__clean">
                  <ShieldCheck size={16} aria-hidden="true" /> No damage history reported.
                </p>
              )}
            </section>
          )}

          {/* Dated maintenance timeline (logbook events). */}
          {events.length > 0 && (
            <section className="report__section">
              <h2>Notable maintenance</h2>
              <ul className="report__timeline">
                {events.map((e, i) => (
                  <li className="report__tlitem" key={i}>
                    <div className="report__tlhead">
                      <Wrench size={14} aria-hidden="true" />
                      <span className="report__tldate">{fmtEventDate(e.event_date) || '—'}</span>
                      <span className="report__tlcat">{categoryLabel(e.category)}</span>
                      {e.position && profile.engine_count > 1 && (
                        <span className="report__tlcat">{engineLabel(e.position - 1, profile.engine_count, profile.layout)}</span>
                      )}
                    </div>
                    <p className="report__tltitle">{e.title}</p>
                    {e.description && <p className="report__tldesc">{e.description}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Notable parts / components replaced (opt-in). */}
          {parts.length > 0 && (
            <section className="report__section">
              <h2>Components &amp; parts</h2>
              <ul className="report__partslist">
                {parts.map((p, i) => (
                  <li key={i} className="report__partitem">
                    <span className="report__partname">{p.part_number || p.description || 'Part'}</span>
                    <span className="report__partmeta">
                      {[p.part_number ? p.description : null, p.event_date, p.tach != null ? `${Number(p.tach).toFixed(1)} hrs` : null].filter(Boolean).join(' · ')}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Categorized equipment (group labels per vertical). */}
          {(profile.equipment.avionics.length > 0 || profile.equipment.additional.length > 0) && (
            <section className="report__section">
              <h2>Equipment</h2>
              {schema.equipmentGroups.map((g) => (
                <EquipmentGroup key={g.key} title={g.title} rows={profile.equipment[g.key]} />
              ))}
            </section>
          )}

          {documents.length > 0 && (
            <section className="report__section">
              <h2>Records</h2>
              <ul className="report__attachments">
                {documents.map((d, i) => (
                  <li key={i}>
                    <Paperclip size={13} aria-hidden="true" />{' '}
                    <a href={d.url} target="_blank" rel="noreferrer">{d.name}</a>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {overview.length > 0 && (
            <section className="report__section">
              <h2>Photo documentation</h2>
              <div className="report__gallery">
                {overview.map((o, i) => (
                  <figure key={i} className="report__figure">
                    {o.url && (o.kind === 'video'
                      ? <video src={o.url} controls playsInline preload="metadata" />
                      : <img src={o.url} alt={o.caption || 'overview'} loading="lazy" />)}
                    {o.caption && <figcaption>{o.caption}</figcaption>}
                  </figure>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* ── Part 2 — Inspection findings (not shown for broker listings) ──── */}
      {!isListing && (
      <>
      {hasPart1 && <PartHeader n="2" title="Inspection findings" />}

      <section className="report__summary">
        <Stat n={counts.discrepancy} label="Discrepancies" tone="bad" icon={<AlertTriangle size={16} />} />
        <Stat n={counts.monitor} label="To monitor" tone="warn" icon={<Eye size={16} />} />
        <Stat n={counts.ok + counts.na} label="Checked OK" tone="good" icon={<Check size={16} />} />
      </section>

      {discrepancies.length > 0 && <ReportSection title="Discrepancies" items={discrepancies} showPhotos />}
      {monitors.length > 0 && <ReportSection title="Items to monitor" items={monitors} showPhotos />}

      {inspection.compression && <CompressionSection items={items} compression={inspection.compression} />}

      {cleared.length > 0 && (
        <section className="report__section">
          <h2>Items checked — no findings</h2>
          <ul className="report__clearedlist">
            {cleared.map((i) => (
              <li key={i.id}>
                <span>
                  {i.title}
                  {i.attachments?.length > 0 && i.attachments.map((a, idx) => (
                    <a key={idx} className="report__clearedfile" href={a.url} target="_blank" rel="noreferrer">
                      <Paperclip size={12} aria-hidden="true" /> {a.name}
                    </a>
                  ))}
                </span>
                <span className="report__clearedstatus">{STATUS_LABEL[i.status]}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {followups.length > 0 && (
        <section className="report__section">
          <h2>Recommended for further evaluation</h2>
          <p className="report__sectionnote">
            Areas the inspector recommends looking into more closely before purchase.
          </p>
          <ul className="report__followups">
            {followups.map((f, i) => (
              <li key={i} className="report__followup">
                <Search size={15} aria-hidden="true" className="report__followupicon" />
                <div>
                  <span className="report__followupreason">{reasonLabel(f.reason)}</span>
                  <p className="report__followupnote">{f.note}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {inspection.compliance && <ComplianceSection inspection={inspection} />}

      {!isGearRigEmpty(inspection.gear_rigging) && (
        <GearRigSection data={inspection.gear_rigging} />
      )}

      </>
      )}

      <footer className="report__foot">
        <span>Prepared with PreBuy</span>
        {(revision || published) && <span>{revision ? `Revision ${revision}` : ''}{revision && published ? ' · ' : ''}{published}</span>}
      </footer>
    </main>
  )
}

function ComplianceSection({ inspection }) {
  const norm = normalizeCompliance({ compliance: inspection.compliance }, { vertical: inspection.vertical, make: inspection.make })
  const asOfDate = new Date().toISOString().slice(0, 10)
  // Only show items the shop recorded (skip 'unknown') and didn't hold back, worst-first.
  const rows = complianceRows(norm.items, { asOfDate, currentTach: norm.current_tach })
    .filter((r) => r.due.status !== 'unknown' && r.show_on_report !== false)
  if (!rows.length) return null
  const dueText = (r) => [r.due.dueDate, r.due.dueTach != null ? `${r.due.dueTach.toFixed(1)} hrs` : null].filter(Boolean).join(' · ') || '—'
  const lastText = (r) => [r.last_date, r.last_tach != null ? `${r.last_tach} hrs` : null].filter(Boolean).join(' · ') || '—'
  return (
    <section className="report__section">
      <h2>Timed items &amp; compliance</h2>
      <p className="report__sectionnote">Recurring inspections and life-limited items, status as of {asOfDate}.</p>
      <div className="report__tablewrap" style={{ overflowX: 'auto' }}>
        <table className="report__grtable">
          <thead>
            <tr><th>Item</th><th>Basis</th><th>Last complied</th><th>Next due</th><th>Status</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td>{r.label}</td>
                <td>{r.basis || '—'}</td>
                <td>{lastText(r)}</td>
                <td>{dueText(r)}</td>
                <td><span className={`report__compstatus report__compstatus--${r.due.status}`}>{statusLabel(r.due.status)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function GearRigSection({ data }) {
  const rec = normalizeGearRig(data)
  const stats = gearRigStats(data)
  const specText = (spec) => (Array.isArray(spec) ? spec.join('; ') : '')
  return (
    <section className="report__section">
      <h2>Landing gear rigging</h2>
      <p className="report__sectionnote">
        Gear rigging measured against factory/ABS tolerances.
        {rec.header.voltage ? ` System: ${rec.header.voltage} VDC.` : ''} {stats.pass} pass · {stats.fail} fail.
      </p>
      <div className="report__tablewrap" style={{ overflowX: 'auto' }}>
        <table className="report__grtable">
          <thead>
            <tr><th>Parameter</th><th>Spec</th><th>Measured</th><th>Result</th><th>Remarks</th></tr>
          </thead>
          <tbody>
            {GEAR_RIG_GROUPS.flatMap((g) => g.rows).map((r) => {
              const row = rec.rows[r.key]
              if (!row.measured.trim() && !row.status && !row.remarks.trim()) return null
              return (
                <tr key={r.key}>
                  <td>{r.label}</td>
                  <td>{specText(r.spec)}</td>
                  <td>{row.measured || '—'}</td>
                  <td>{row.status === 'P' ? <span className="report__grpass">Pass</span> : row.status === 'F' ? <span className="report__grfail">Fail</span> : '—'}</td>
                  <td>{row.remarks || ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Meta({ label, value }) {
  return (
    <div>
      <span className="report__metalabel">{label}</span>
      <span className="report__metaval">{value}</span>
    </div>
  )
}

function PartHeader({ n, title }) {
  return (
    <div className="report__part">
      <span className="report__partnum">Part {n}</span>
      <h2 className="report__parttitle">{title}</h2>
    </div>
  )
}

function EquipmentGroup({ title, rows }) {
  if (!rows.length) return null
  return (
    <div className="report__eqgroup">
      <h3 className="report__eqtitle">{title}</h3>
      <ul className="report__eqlist">
        {rows.map((r, i) => (
          <li key={i}>
            <span className="report__eqname">{r.name}</span>
            {r.notes && <span className="report__eqnotes">{r.notes}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Stat({ n, label, tone, icon }) {
  return (
    <div className={`report__stat report__stat--${tone}`}>
      <span className="report__staticon" aria-hidden="true">{icon}</span>
      <span className="report__statn">{n}</span>
      <span className="report__statlabel">{label}</span>
    </div>
  )
}

function CompressionSection({ items, compression }) {
  const rows = (items ?? [])
    .map((i) => ({ item: i, rec: compression?.[i.id] }))
    .filter((r) => r.rec && isCompressionItem(r.item) && !isCompressionEmpty(r.rec))
  if (!rows.length) return null
  return (
    <section className="report__section">
      <h2>Compression test</h2>
      {rows.map(({ item, rec }) => {
        const n = normalizeCompression(rec)
        // Borescope images tagged to a cylinder (caption `cyl:N`), grouped by number.
        const boreByCyl = new Map()
        for (const ph of item.photos ?? []) {
          const cyl = cylTag(ph.caption)
          if (cyl == null) continue
          if (!boreByCyl.has(cyl)) boreByCyl.set(cyl, [])
          boreByCyl.get(cyl).push(ph)
        }
        const boreCyls = [...boreByCyl.keys()].sort((a, b) => a - b)
        return (
          <div key={item.id} className="report__comp">
            <p className="report__sectionnote">
              {item.title}{n.master_orifice ? ` · master orifice ${n.master_orifice}/80` : ''}
            </p>
            <div className="report__tablewrap" style={{ overflowX: 'auto' }}>
              <table className="report__grtable">
                <thead><tr>{n.cylinders.map((_, i) => <th key={i}>#{i + 1}</th>)}</tr></thead>
                <tbody>
                  <tr>
                    {n.cylinders.map((c, i) => (
                      <td key={i} className={cylinderStatus(c.value, n.master_orifice) === 'low' ? 'report__complow' : ''}>
                        {c.value ? `${c.value}/80` : '—'}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
            {n.notes && <p className="report__findingtext">{n.notes}</p>}
            {boreCyls.map((cyl) => (
              <div key={cyl} className="report__borerow">
                <span className="report__borelabel">Cylinder #{cyl} borescope</span>
                <div className="report__gallery report__gallery--small">
                  {boreByCyl.get(cyl).map((ph, idx) => (
                    <figure key={idx} className="report__figure">
                      {ph.kind === 'video'
                        ? <video src={ph.url} controls playsInline preload="metadata" />
                        : <img src={ph.url} alt={`Cylinder ${cyl} borescope ${idx + 1}`} loading="lazy" />}
                    </figure>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      })}
    </section>
  )
}

function ReportSection({ title, items, showPhotos }) {
  return (
    <section className="report__section">
      <h2>{title}</h2>
      <div className="report__findings">
        {items.map((i) => (
          <article key={i.id} className={`report__finding report__finding--${riskBand(i)}`}>
            <div className="report__findinghead">
              <span className="report__findingcat">{i.category}</span>
              <h3>{i.title}</h3>
            </div>
            {i.findings && <p className="report__findingtext">{i.findings}</p>}
            {i.attachments?.length > 0 && (
              <ul className="report__attachments">
                {i.attachments.map((a, idx) => (
                  <li key={idx}>
                    <Paperclip size={13} aria-hidden="true" />{' '}
                    <a href={a.url} target="_blank" rel="noreferrer">{a.name}</a>
                  </li>
                ))}
              </ul>
            )}
            {showPhotos && i.photos?.filter((ph) => cylTag(ph.caption) == null).length > 0 && (
              <div className="report__gallery report__gallery--small">
                {i.photos.filter((ph) => cylTag(ph.caption) == null).map((ph, idx) => (
                  <figure key={idx} className="report__figure">
                    {ph.kind === 'video'
                      ? <video src={ph.url} controls playsInline preload="metadata" />
                      : <img src={ph.url} alt={`${i.title} photo ${idx + 1}`} loading="lazy" />}
                  </figure>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  )
}
