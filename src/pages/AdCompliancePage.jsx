// AD compliance chart — the full, sortable summary the Logbook audit links to.
// Every AD read off the scans, de-duplicated by number, with recurring status,
// last-complied, NEXT DUE (from an AD compliance report), source, a page hotlink to
// the scanned PDF, and the report-vs-logbooks cross-check advisories.

import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronLeft, ShieldCheck, AlertTriangle, Check, FileText } from 'lucide-react'
import { getInspection } from '../lib/checklist.js'
import { listEvents, listLogbooks } from '../lib/logbooks.js'
import { listMediaByPurpose } from '../lib/media.js'
import { compileAdCompliance, adStats } from '../lib/ad.js'
import './auth.css'
import './inspections.css'

const today = () => new Date().toISOString().slice(0, 10)

// Simple due status for an AD's next-due date/hours. Pure-ish (takes today + tach).
function dueOf(ad, asOf, currentTach) {
  const d = ad.next_due_date
  const h = ad.next_due_hours
  if (!d && h == null) return { status: ad.recurring ? 'unknown' : 'na', text: ad.recurring ? 'next due unknown' : '—' }
  const bits = []
  let status = 'ok'
  if (d) {
    bits.push(d)
    const days = Math.round((Date.parse(`${d}T00:00:00Z`) - Date.parse(`${asOf}T00:00:00Z`)) / 86400000)
    if (Number.isFinite(days)) status = days < 0 ? 'overdue' : days <= 60 ? 'due-soon' : 'ok'
  }
  if (h != null) {
    bits.push(`${h.toFixed(1)} hrs`)
    if (currentTach != null) {
      const left = h - currentTach
      const hs = left < 0 ? 'overdue' : left <= 25 ? 'due-soon' : 'ok'
      if (hs === 'overdue' || (hs === 'due-soon' && status !== 'overdue')) status = hs
    }
  }
  return { status, text: bits.join(' · ') }
}

const STATUS_LABEL = { overdue: 'Overdue', 'due-soon': 'Due soon', ok: 'Current', unknown: 'Unknown', na: '' }

export default function AdCompliancePage() {
  const { id } = useParams()
  const [inspection, setInspection] = useState(null)
  const [events, setEvents] = useState([])
  const [logbooks, setLogbooks] = useState([])
  const [pdfByLogbook, setPdfByLogbook] = useState(new Map())
  const [state, setState] = useState('loading')

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data: insp, error } = await getInspection(id)
      if (!active) return
      if (error || !insp) return setState('error')
      setInspection(insp)
      const [{ data: ev }, { data: lb }, { data: pdfs }] = await Promise.all([
        listEvents(insp.id), listLogbooks(insp.id), listMediaByPurpose(insp.id, 'logbook_pdf'),
      ])
      if (!active) return
      setEvents(ev)
      setLogbooks(lb)
      setPdfByLogbook(new Map((pdfs ?? []).filter((m) => m.logbook_id && m.url).map((m) => [m.logbook_id, m.url])))
      setState('ready')
    })()
    return () => { active = false }
  }, [id])

  const adc = useMemo(() => compileAdCompliance(events, logbooks), [events, logbooks])
  const stats = adStats(adc.ads)
  const currentTach = inspection?.attributes?.profile?.specs?.total_time ?? null
  const asOf = today()

  if (state === 'loading') return <main className="auth-pending" aria-busy="true"><p>Loading…</p></main>
  if (state === 'error') return (
    <main className="auth"><div className="auth__error">Couldn’t load this inspection.</div><Link to="/app" className="auth__toggle">← Back</Link></main>
  )

  const rows = adc.ads.map((ad) => ({ ...ad, due: dueOf(ad, asOf, currentTach) }))
  const rank = { overdue: 0, 'due-soon': 1, unknown: 2, ok: 3, na: 4 }
  rows.sort((a, b) => (rank[a.due.status] - rank[b.due.status]) || String(a.ad_number ?? a.title).localeCompare(String(b.ad_number ?? b.title), undefined, { numeric: true }))

  return (
    <main className="insp">
      <Link to={`/app/inspections/${id}/logbooks`} className="auth__toggle">
        <ChevronLeft size={15} aria-hidden="true" /> Logbook audit
      </Link>
      <div className="auth__heading">
        <h1><ShieldCheck size={20} aria-hidden="true" /> AD compliance</h1>
        <p>{stats.total} AD{stats.total === 1 ? '' : 's'} read off the scans{stats.recurring ? ` · ${stats.recurring} recurring` : ''}. A starting cross-check — always verify against the records.</p>
      </div>

      {adc.ads.length === 0 ? (
        <p className="auth__hint">No ADs read yet. Scan the logbooks (and an AD compliance report) to build this list.</p>
      ) : (
        <>
          {/* Cross-check advisories */}
          {adc.hasReport ? (
            adc.issues.length > 0 ? (
              <ul className="lb__issues">
                {adc.issues.map((iss) => (
                  <li key={iss.key} className={`lb__issue lb__issue--${iss.type === 'unverified' ? 'gap' : 'coverage'}`}>
                    <AlertTriangle size={14} aria-hidden="true" /> {iss.message}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="auth__hint"><Check size={13} aria-hidden="true" /> Every AD on the compliance report was also found in the logbooks.</p>
            )
          ) : (
            <p className="auth__hint">Scan an <strong>AD compliance report</strong> (pick “AD compliance report” when you scan a logbook) to cross-check it against the logbooks and pull next-due dates.</p>
          )}

          <div className="report__tablewrap" style={{ overflowX: 'auto' }}>
            <table className="report__grtable ad__table">
              <thead>
                <tr><th>AD</th><th>Subject</th><th>Last complied</th><th>Next due</th><th>Status</th><th>Source</th></tr>
              </thead>
              <tbody>
                {rows.map((ad) => (
                  <tr key={ad.key} className={`ad__row ad__row--${ad.due.status}`}>
                    <td className="ad__num">
                      {ad.ad_number || '—'}
                      {ad.recurring && <span className="lb__adtag lb__adtag--recurring">recurring</span>}
                    </td>
                    <td>{ad.ad_number ? ad.title : (ad.title || '—')}</td>
                    <td>{[ad.latest_date, ad.latest_tach != null ? `${ad.latest_tach.toFixed(1)} hrs` : null].filter(Boolean).join(' · ') || '—'}</td>
                    <td>{ad.due.text}</td>
                    <td>{STATUS_LABEL[ad.due.status] ? <span className={`report__compstatus report__compstatus--${ad.due.status}`}>{STATUS_LABEL[ad.due.status]}</span> : '—'}</td>
                    <td className="ad__src">
                      {ad.ref && pdfByLogbook.get(ad.ref.logbook_id) && (
                        <a className="lb__pagelink" href={`${pdfByLogbook.get(ad.ref.logbook_id)}#page=${ad.ref.page}`} target="_blank" rel="noreferrer" title={`Open the PDF at page ${ad.ref.page}`}>
                          <FileText size={12} aria-hidden="true" /> p.{ad.ref.page}
                        </a>
                      )}
                      {ad.sources.report && <span className="lb__adchip lb__adchip--report">Report</span>}
                      {ad.sources.logbook && <span className="lb__adchip">Logbook</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  )
}
