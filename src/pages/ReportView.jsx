// Public customer-facing report (no login). Fetches a published inspection by its
// share token via the `report` edge fn and renders it read-only. "Print / Save
// PDF" uses the browser's print-to-PDF (print styles in report.css).

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Plane, Ship, Printer, AlertTriangle, Eye, Check } from 'lucide-react'
import { fetchReport, reportSummary } from '../lib/report.js'
import { orderByFinancialRisk, riskBand } from '../lib/risk.js'
import './report.css'

const STATUS_LABEL = { discrepancy: 'Discrepancy', monitor: 'Monitor', ok: 'OK', na: 'N/A', pending: 'Not inspected' }

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

  const { shop, inspection, items, overview } = data
  const ordered = orderByFinancialRisk(items)
  const discrepancies = ordered.filter((i) => i.status === 'discrepancy')
  const monitors = ordered.filter((i) => i.status === 'monitor')
  const cleared = ordered.filter((i) => i.status === 'ok' || i.status === 'na')
  const counts = reportSummary(items)
  const asset = [inspection.year, inspection.make, inspection.model].filter(Boolean).join(' ')
  const isMarine = inspection.vertical === 'marine'
  const published = inspection.published_at ? new Date(inspection.published_at).toLocaleDateString() : ''
  // Prefer the recorded inspection date; fall back to the publish date.
  const inspected = inspection.inspection_date
    ? new Date(inspection.inspection_date + 'T00:00:00').toLocaleDateString()
    : published

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
        <h1>Pre-Purchase Inspection Report</h1>
        <div className="report__meta">
          <div>
            <span className="report__metalabel">{isMarine ? 'Vessel' : 'Aircraft'}</span>
            <span className="report__metaval">{asset || '—'}</span>
          </div>
          <div>
            <span className="report__metalabel">Identifier</span>
            <span className="report__metaval">{inspection.identifier}</span>
          </div>
          {inspection.serial && (
            <div>
              <span className="report__metalabel">Serial</span>
              <span className="report__metaval">{inspection.serial}</span>
            </div>
          )}
          {inspection.customer_name && (
            <div>
              <span className="report__metalabel">Prepared for</span>
              <span className="report__metaval">{inspection.customer_name}</span>
            </div>
          )}
          {inspection.inspector_name && (
            <div>
              <span className="report__metalabel">Inspected by</span>
              <span className="report__metaval">{inspection.inspector_name}</span>
            </div>
          )}
          {inspection.location && (
            <div>
              <span className="report__metalabel">Location</span>
              <span className="report__metaval">{inspection.location}</span>
            </div>
          )}
          {inspected && (
            <div>
              <span className="report__metalabel">Inspection date</span>
              <span className="report__metaval">{inspected}</span>
            </div>
          )}
        </div>
      </header>

      <section className="report__summary">
        <Stat n={counts.discrepancy} label="Discrepancies" tone="bad" icon={<AlertTriangle size={16} />} />
        <Stat n={counts.monitor} label="To monitor" tone="warn" icon={<Eye size={16} />} />
        <Stat n={counts.ok + counts.na} label="Checked OK" tone="good" icon={<Check size={16} />} />
      </section>

      {discrepancies.length > 0 && (
        <ReportSection title="Discrepancies" items={discrepancies} showPhotos />
      )}
      {monitors.length > 0 && <ReportSection title="Items to monitor" items={monitors} showPhotos />}

      {cleared.length > 0 && (
        <section className="report__section">
          <h2>Items checked — no findings</h2>
          <ul className="report__clearedlist">
            {cleared.map((i) => (
              <li key={i.id}>
                <span>{i.title}</span>
                <span className="report__clearedstatus">{STATUS_LABEL[i.status]}</span>
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
                {o.url && <img src={o.url} alt={o.caption || 'overview'} loading="lazy" />}
                {o.caption && <figcaption>{o.caption}</figcaption>}
              </figure>
            ))}
          </div>
        </section>
      )}

      <footer className="report__foot">
        <span>Prepared with PreBuy</span>
        {published && <span>{published}</span>}
      </footer>
    </main>
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
            {showPhotos && i.photos?.length > 0 && (
              <div className="report__gallery report__gallery--small">
                {i.photos.map((url, idx) => (
                  <figure key={idx} className="report__figure">
                    <img src={url} alt={`${i.title} photo ${idx + 1}`} loading="lazy" />
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
