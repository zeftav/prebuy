// Platform-owner ("super admin") dashboard. One component, a `view` prop selects
// the section (the router passes view="customers" etc.). Everything here is gated
// by <SuperAdminRoute> and backed by the admin-orgs / admin-ai-cost edge functions
// (service role, super-admin re-checked server-side).
//
// Sections: Customers (orgs + engagement), Engagement (who to call), AI cost,
// Super admins (roster). Financial is intentionally a placeholder until billing
// (Stripe) exists — see docs/backlog.md.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ShieldCheck, ArrowLeft, AlertTriangle, Trash2, Pencil, Plus, X, Eye, ExternalLink } from 'lucide-react'
import { useAuth } from '../lib/auth.jsx'
import {
  fetchAdminOrgs, fetchAiCost, fetchOrgDetail, addSuperAdmin, removeSuperAdmin, renameOrg, deleteOrg,
  formatUsd, formatCount, relativeTime, engagementFlag,
} from '../lib/admin.js'
import Tooltip, { InfoDot } from '../components/Tooltip.jsx'
import { getVertical } from '../lib/verticals.js'
import './auth.css'
import './inspections.css'
import './admin.css'

const TABS = [
  { key: 'customers', label: 'Customers', to: '/admin' },
  { key: 'engagement', label: 'Engagement', to: '/admin/engagement' },
  { key: 'ai-cost', label: 'AI cost', to: '/admin/ai-cost' },
  { key: 'financial', label: 'Financial', to: '/admin/financial' },
  { key: 'super-admins', label: 'Super admins', to: '/admin/super-admins' },
]

export default function Admin({ view = 'customers' }) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const { id: orgParam } = useParams()
  const [data, setData] = useState(null) // { orgs, totals, super_admins }
  const [loadError, setLoadError] = useState(null)

  const load = useCallback(() => {
    setLoadError(null)
    fetchAdminOrgs().then(({ data, error }) => {
      if (error) setLoadError(error)
      else setData(data)
    })
  }, [])

  const needsOrgList = view === 'customers' || view === 'engagement' || view === 'super-admins'
  useEffect(() => {
    if (needsOrgList) load()
  }, [load, needsOrgList])

  async function onSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <main className="admin">
      <div className="admin__topbar">
        <span className="auth__brand">
          <ShieldCheck size={22} aria-hidden="true" />
          PreBuy <span className="admin__badge">Platform</span>
        </span>
        <span className="insp__user">
          {user?.email}
          <Link to="/app" className="auth__toggle">
            <ArrowLeft size={14} aria-hidden="true" /> Back to app
          </Link>
          <button className="auth__toggle" onClick={onSignOut}>
            Sign out
          </button>
        </span>
      </div>

      <nav className="admin__tabs" aria-label="Platform sections">
        {TABS.map((t) => (
          <Link key={t.key} to={t.to} className={`admin__tab ${view === t.key ? 'is-active' : ''}`}>
            {t.label}
          </Link>
        ))}
      </nav>

      {loadError && view !== 'ai-cost' && view !== 'financial' && (
        <div className="auth__error" role="alert">
          Couldn’t load platform data. {loadError.message || ''}{' '}
          <button className="auth__toggle" onClick={load}>Retry</button>
        </div>
      )}

      {view === 'customers' && <CustomersView data={data} onChanged={load} />}
      {view === 'engagement' && <EngagementView data={data} />}
      {view === 'ai-cost' && <AiCostView />}
      {view === 'financial' && <FinancialView />}
      {view === 'super-admins' && <SuperAdminsView data={data} onChanged={load} />}
      {view === 'org' && <OrgView orgId={orgParam} />}
    </main>
  )
}

function StatCards({ totals }) {
  if (!totals) return null
  const cards = [
    { label: 'Shops', value: formatCount(totals.orgs) },
    { label: 'Users', value: formatCount(totals.users) },
    { label: 'Inspections', value: formatCount(totals.inspections) },
    { label: 'Listings', value: formatCount(totals.listings) },
    { label: 'Published', value: formatCount(totals.published) },
    { label: 'New shops (30d)', value: formatCount(totals.signups_30d) },
  ]
  return (
    <div className="admin__stats">
      {cards.map((c) => (
        <div key={c.label} className="admin__stat">
          <span className="admin__statnum">{c.value}</span>
          <span className="admin__statlabel">{c.label}</span>
        </div>
      ))}
    </div>
  )
}

function FlagPill({ org }) {
  const f = engagementFlag(org)
  return <span className={`admin__flag admin__flag--${f.level}`}>{f.reason}</span>
}

function CustomersView({ data, onChanged }) {
  const [editing, setEditing] = useState(null) // org being renamed
  const [deleting, setDeleting] = useState(null) // org being deleted

  if (!data) return <p className="auth__hint">Loading…</p>
  const orgs = data.orgs ?? []

  return (
    <section className="admin__section">
      <StatCards totals={data.totals} />
      <h2 className="admin__h2">All shops <span className="admin__count">({orgs.length})</span></h2>

      {orgs.length === 0 && <p className="auth__hint">No shops yet.</p>}

      <div className="admin__orggrid">
        {orgs.map((o) => (
          <div key={o.id} className="admin__orgcard">
            <div className="admin__orgcardhead">
              <div>
                <span className="admin__orgname">{o.name || 'Unnamed shop'}</span>
                <span className="admin__orgmeta">
                  {getVertical(o.vertical)?.label || o.vertical} · created {relativeTime(o.created_at)}
                </span>
              </div>
              <FlagPill org={o} />
            </div>
            <div className="admin__orgstats">
              <span><strong>{formatCount(o.member_count)}</strong> {o.member_count === 1 ? 'member' : 'members'}</span>
              <span><strong>{formatCount(o.inspection_count)}</strong> inspections</span>
              <span><strong>{formatCount(o.inspections_30d)}</strong> in 30d</span>
              <span><strong>{formatCount(o.listing_count)}</strong> listings</span>
              <span><strong>{formatCount(o.published_count)}</strong> published</span>
              <span>active {relativeTime(o.last_active)}</span>
            </div>
            <div className="admin__orgactions">
              <Link className="auth__toggle" to={`/admin/orgs/${o.id}`}>
                <Eye size={13} aria-hidden="true" /> Open
              </Link>
              <button className="auth__toggle" onClick={() => setEditing(o)}>
                <Pencil size={13} aria-hidden="true" /> Rename
              </button>
              <button className="auth__toggle admin__danger" onClick={() => setDeleting(o)}>
                <Trash2 size={13} aria-hidden="true" /> Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <RenameModal
          org={editing}
          onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); onChanged() }}
        />
      )}
      {deleting && (
        <DeleteModal
          org={deleting}
          onClose={() => setDeleting(null)}
          onDone={() => { setDeleting(null); onChanged() }}
        />
      )}
    </section>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div className="admin__modalwrap" role="dialog" aria-modal="true" aria-label={title}>
      <div className="admin__modal">
        <div className="admin__modalhead">
          <h3>{title}</h3>
          <button className="auth__toggle" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function RenameModal({ org, onClose, onDone }) {
  const [name, setName] = useState(org.name || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  async function save() {
    setBusy(true); setError(null)
    const { error } = await renameOrg(org.id, name)
    setBusy(false)
    if (error) return setError(error.message)
    onDone()
  }
  return (
    <Modal title="Rename shop" onClose={onClose}>
      {error && <div className="auth__error" role="alert">{error}</div>}
      <input className="admin__input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <div className="admin__modalactions">
        <button className="auth__btn auth__btn--ghost" onClick={onClose}>Cancel</button>
        <button className="auth__btn" onClick={save} disabled={busy || !name.trim()}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Modal>
  )
}

function DeleteModal({ org, onClose, onDone }) {
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const ready = confirm.trim() === (org.name || '').trim() && (org.name || '').trim().length > 0
  async function remove() {
    setBusy(true); setError(null)
    const { error } = await deleteOrg(org.id)
    setBusy(false)
    if (error) return setError(error.message)
    onDone()
  }
  return (
    <Modal title="Delete shop" onClose={onClose}>
      <div className="admin__warn">
        <AlertTriangle size={16} aria-hidden="true" />
        <p>
          This permanently deletes <strong>{org.name}</strong> and all its inspections, items,
          media records, logbooks and memberships. This cannot be undone. (User accounts are kept.)
        </p>
      </div>
      {error && <div className="auth__error" role="alert">{error}</div>}
      <label className="admin__label">Type the shop name to confirm</label>
      <input className="admin__input" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder={org.name} autoFocus />
      <div className="admin__modalactions">
        <button className="auth__btn auth__btn--ghost" onClick={onClose}>Cancel</button>
        <button className="auth__btn admin__btndanger" onClick={remove} disabled={busy || !ready}>
          {busy ? 'Deleting…' : 'Delete shop'}
        </button>
      </div>
    </Modal>
  )
}

function EngagementView({ data }) {
  const flagged = useMemo(() => {
    const orgs = data?.orgs ?? []
    return orgs
      .map((o) => ({ org: o, flag: engagementFlag(o) }))
      .filter((x) => x.flag.level !== 'ok')
      .sort((a, b) => (a.flag.level === 'risk' ? -1 : 1) - (b.flag.level === 'risk' ? -1 : 1))
  }, [data])

  if (!data) return <p className="auth__hint">Loading…</p>

  return (
    <section className="admin__section">
      <h2 className="admin__h2">Needs attention <span className="admin__count">({flagged.length})</span></h2>
      <p className="auth__hint">Shops that are new-but-empty, gone quiet, or never activated — your outreach list.</p>
      {flagged.length === 0 && <p className="auth__hint">Everyone’s active. 🎉</p>}
      <ul className="admin__risklist">
        {flagged.map(({ org, flag }) => (
          <li key={org.id} className="admin__riskrow">
            <span className={`admin__flag admin__flag--${flag.level}`}>{flag.reason}</span>
            <span className="admin__riskname">{org.name || 'Unnamed shop'}</span>
            <span className="admin__riskmeta">
              {formatCount(org.member_count)} members · {formatCount(org.inspection_count)} inspections · active {relativeTime(org.last_active)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

const COST_GLOSSARY = {
  cost: 'Estimated USD spend on Anthropic API calls, computed from token counts × per-model rates. Rates are estimates set in the admin-ai-cost function.',
  calls: 'Number of AI edge-function calls in the window (finding clean-up, logbook/record scans, AI summaries).',
  unattributed: 'Calls whose originating shop wasn’t recorded (older calls before org tagging, or calls made outside an inspection).',
}

function AiCostView() {
  const [days, setDays] = useState(30)
  const [state, setState] = useState({ status: 'loading' })

  useEffect(() => {
    let active = true
    setState({ status: 'loading' })
    fetchAiCost(days).then(({ data, error }) => {
      if (!active) return
      setState(error ? { status: 'error', error } : { status: 'ready', data })
    })
    return () => { active = false }
  }, [days])

  return (
    <section className="admin__section">
      <div className="admin__sectionhead">
        <h2 className="admin__h2">AI cost</h2>
        <label className="insp__shopselect">
          <span>Window</span>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
            <option value={365}>Last year</option>
          </select>
        </label>
      </div>

      {state.status === 'loading' && <p className="auth__hint">Loading usage…</p>}
      {state.status === 'error' && (
        <div className="auth__error" role="alert">Couldn’t load AI cost. {state.error?.message || ''}</div>
      )}

      {state.status === 'ready' && (
        <>
          <div className="admin__stats">
            <div className="admin__stat">
              <span className="admin__statnum">{formatUsd(state.data.totals.cost)}</span>
              <span className="admin__statlabel">
                Est. spend <Tooltip text={COST_GLOSSARY.cost}><InfoDot label="How cost is estimated" /></Tooltip>
              </span>
            </div>
            <div className="admin__stat">
              <span className="admin__statnum">{formatCount(state.data.totals.calls)}</span>
              <span className="admin__statlabel">
                AI calls <Tooltip text={COST_GLOSSARY.calls}><InfoDot label="What counts as a call" /></Tooltip>
              </span>
            </div>
            <div className="admin__stat">
              <span className="admin__statnum">{formatCount(state.data.totals.input_tokens)}</span>
              <span className="admin__statlabel">Input tokens</span>
            </div>
            <div className="admin__stat">
              <span className="admin__statnum">{formatCount(state.data.totals.output_tokens)}</span>
              <span className="admin__statlabel">Output tokens</span>
            </div>
          </div>

          <div className="admin__costcols">
            <div>
              <h3 className="admin__h3">By feature</h3>
              <CostTable rows={state.data.by_function} labelKey="function_name" />
            </div>
            <div>
              <h3 className="admin__h3">
                By shop <Tooltip text={COST_GLOSSARY.unattributed}><InfoDot label="About unattributed" /></Tooltip>
              </h3>
              <CostTable rows={state.data.by_org} labelKey="name" />
            </div>
          </div>

          {state.data.by_day.length > 0 && (
            <>
              <h3 className="admin__h3">Daily</h3>
              <DayBars rows={state.data.by_day} />
            </>
          )}
        </>
      )}
    </section>
  )
}

function CostTable({ rows, labelKey }) {
  if (!rows?.length) return <p className="auth__hint">No usage in this window.</p>
  return (
    <table className="admin__table">
      <thead>
        <tr><th>{labelKey === 'name' ? 'Shop' : 'Feature'}</th><th>Calls</th><th>Cost</th></tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r[labelKey] || i}>
            <td>{r[labelKey]}</td>
            <td>{formatCount(r.calls)}</td>
            <td>{formatUsd(r.cost)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function DayBars({ rows }) {
  const max = Math.max(...rows.map((r) => r.cost), 0.0001)
  return (
    <div className="admin__daybars">
      {rows.map((r) => (
        <div key={r.date} className="admin__daybar" title={`${r.date}: ${formatUsd(r.cost)}`}>
          <div className="admin__daybarfill" style={{ height: `${Math.max(2, (r.cost / max) * 100)}%` }} />
          <span className="admin__daybarlabel">{r.date.slice(5)}</span>
        </div>
      ))}
    </div>
  )
}

function FinancialView() {
  return (
    <section className="admin__section">
      <h2 className="admin__h2">Financial</h2>
      <div className="admin__placeholder">
        <p><strong>Coming with billing.</strong></p>
        <p className="auth__hint">
          MRR/ARR, ARPA, gross margin, CAC/payback and monthly snapshots will live here once
          Stripe subscriptions are wired up. AI cost (the COGS side) is already tracked under the
          AI cost tab. See <code>docs/backlog.md</code> → Financial.
        </p>
      </div>
    </section>
  )
}

function OrgView({ orgId }) {
  const [state, setState] = useState({ status: 'loading' })

  useEffect(() => {
    let active = true
    setState({ status: 'loading' })
    fetchOrgDetail(orgId).then(({ data, error }) => {
      if (!active) return
      setState(error ? { status: 'error', error } : { status: 'ready', data })
    })
    return () => { active = false }
  }, [orgId])

  if (state.status === 'loading') return <p className="auth__hint">Loading shop…</p>
  if (state.status === 'error') {
    return <div className="auth__error" role="alert">Couldn’t load this shop. {state.error?.message || ''}</div>
  }

  const { org, members, inspections } = state.data
  const reportOrigin = typeof window !== 'undefined' ? window.location.origin : ''

  return (
    <section className="admin__section">
      <Link to="/admin" className="auth__toggle"><ArrowLeft size={14} aria-hidden="true" /> All shops</Link>
      <h2 className="admin__h2" style={{ marginTop: '0.75rem' }}>
        {org.name} <span className="admin__count">· {getVertical(org.vertical)?.label || org.vertical}</span>
      </h2>
      <p className="auth__hint">Read-only support view. Created {relativeTime(org.created_at)}.</p>

      <h3 className="admin__h3">Team <span className="admin__count">({members.length})</span></h3>
      <table className="admin__table">
        <thead><tr><th>Email</th><th>Role</th><th>Joined</th><th>Last sign-in</th></tr></thead>
        <tbody>
          {members.map((m) => (
            <tr key={m.user_id}>
              <td>{m.email || '(unknown)'}</td>
              <td>{m.role}</td>
              <td>{relativeTime(m.joined)}</td>
              <td>{relativeTime(m.last_sign_in)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 className="admin__h3">Inspections <span className="admin__count">({inspections.length})</span></h3>
      {inspections.length === 0 && <p className="auth__hint">No inspections yet.</p>}
      {inspections.length > 0 && (
        <table className="admin__table">
          <thead><tr><th>Identifier</th><th>Asset</th><th>Type</th><th>Status</th><th>Updated</th><th>Report</th></tr></thead>
          <tbody>
            {inspections.map((i) => (
              <tr key={i.id}>
                <td>{i.identifier}</td>
                <td>{[i.year, i.make, i.model].filter(Boolean).join(' ') || '—'}</td>
                <td>{i.mode === 'listing' ? 'Listing' : 'Inspection'}</td>
                <td><span className={`insp__status insp__status--${i.status}`}>{i.status}</span></td>
                <td>{relativeTime(i.updated_at)}</td>
                <td>
                  {i.status === 'published' && i.share_token ? (
                    <a href={`${reportOrigin}/r/${i.share_token}`} target="_blank" rel="noreferrer" className="auth__toggle">
                      <ExternalLink size={13} aria-hidden="true" /> Open
                    </a>
                  ) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

function SuperAdminsView({ data, onChanged }) {
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  if (!data) return <p className="auth__hint">Loading…</p>
  const roster = data.super_admins ?? []

  async function add() {
    setBusy(true); setError(null)
    const { error } = await addSuperAdmin(email)
    setBusy(false)
    if (error) return setError(error.message)
    setEmail('')
    onChanged()
  }
  async function remove(e) {
    setError(null)
    const { error } = await removeSuperAdmin(e)
    if (error) return setError(error.message)
    onChanged()
  }

  return (
    <section className="admin__section">
      <h2 className="admin__h2">Super admins</h2>
      <p className="auth__hint">Platform owners can see and manage every shop. Founders are permanent and can’t be removed.</p>

      {error && <div className="auth__error" role="alert">{error}</div>}

      <ul className="admin__roster">
        {roster.map((r) => (
          <li key={r.email} className="admin__rosterrow">
            <span>{r.email}</span>
            {r.founder ? (
              <span className="admin__flag admin__flag--ok">Founder</span>
            ) : (
              <button className="auth__toggle admin__danger" onClick={() => remove(r.email)}>
                <Trash2 size={13} aria-hidden="true" /> Remove
              </button>
            )}
          </li>
        ))}
      </ul>

      <div className="admin__addrow">
        <input
          className="admin__input"
          type="email"
          placeholder="new-admin@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button className="auth__btn" onClick={add} disabled={busy || !email.includes('@')}>
          <Plus size={15} aria-hidden="true" /> {busy ? 'Adding…' : 'Add'}
        </button>
      </div>
    </section>
  )
}
