// Authenticated home = the active shop's inspection list.
//   - no membership → create-shop (onboarding)
//   - has shop(s)   → list that shop's inspections, with a switcher if >1 shop
// Rendered inside <ProtectedRoute>, so a session is guaranteed.

import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Plane, LogOut, Plus, Ship } from 'lucide-react'
import { useAuth } from '../lib/auth.jsx'
import { fetchMemberships, pickActiveOrg } from '../lib/shops.js'
import { listInspectionsForOrg } from '../lib/inspections.js'
import { getVertical } from '../lib/verticals.js'
import './auth.css'
import './inspections.css'

const ACTIVE_ORG_KEY = 'prebuy:activeOrg'

export default function Dashboard() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [memberships, setMemberships] = useState(null) // null = loading
  const [activeOrgId, setActiveOrgId] = useState(null)
  const [loadError, setLoadError] = useState(null)

  // Load memberships once, then choose an active org (remembered or best pick).
  useEffect(() => {
    let active = true
    fetchMemberships().then(({ data, error }) => {
      if (!active) return
      if (error) {
        setLoadError(error)
        setMemberships([])
        return
      }
      setMemberships(data)
      if (data.length) {
        const remembered = safeGet(ACTIVE_ORG_KEY)
        const valid = data.some((m) => m.org_id === remembered)
        setActiveOrgId(valid ? remembered : pickActiveOrg(data)?.org_id ?? null)
      }
    })
    return () => {
      active = false
    }
  }, [])

  function chooseOrg(id) {
    setActiveOrgId(id)
    safeSet(ACTIVE_ORG_KEY, id)
  }

  async function onSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  if (memberships === null) {
    return (
      <main className="auth-pending" aria-busy="true">
        <p>Loading…</p>
      </main>
    )
  }

  if (loadError) {
    return (
      <main className="auth">
        <div className="auth__error" role="alert">
          Couldn’t load your shops. {loadError.message || ''}
        </div>
        <button className="auth__btn auth__btn--ghost" onClick={() => window.location.reload()}>
          Retry
        </button>
      </main>
    )
  }

  if (memberships.length === 0) return <Navigate to="/app/create-shop" replace />

  const activeMembership = memberships.find((m) => m.org_id === activeOrgId) ?? memberships[0]

  return (
    <main className="insp">
      <div className="dash__topbar">
        <span className="auth__brand">
          <Plane size={22} aria-hidden="true" />
          PreBuy
        </span>
        <span className="insp__user">
          {user?.email}
          <button className="auth__toggle" onClick={onSignOut}>
            <LogOut size={14} aria-hidden="true" /> Sign out
          </button>
        </span>
      </div>

      <div className="insp__shopbar">
        {memberships.length > 1 ? (
          <label className="insp__shopselect">
            <span>Shop</span>
            <select value={activeMembership.org_id} onChange={(e) => chooseOrg(e.target.value)}>
              {memberships.map((m) => (
                <option key={m.org_id} value={m.org_id}>
                  {m.orgs?.name || 'Unnamed shop'}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <h1 className="insp__shopname">{activeMembership.orgs?.name || 'Your shop'}</h1>
        )}
        <Link to="/app/create-shop" className="auth__toggle">
          + New shop
        </Link>
      </div>

      <InspectionList orgId={activeMembership.org_id} />

      <p className="auth__footer-link">
        Need a hand? See <Link to="/help">Help &amp; FAQ</Link>.
      </p>
    </main>
  )
}

function InspectionList({ orgId }) {
  const [state, setState] = useState({ status: 'loading', rows: [] })

  useEffect(() => {
    let active = true
    setState({ status: 'loading', rows: [] })
    listInspectionsForOrg(orgId).then(({ data, error }) => {
      if (!active) return
      setState({ status: error ? 'error' : 'ready', rows: data, error })
    })
    return () => {
      active = false
    }
  }, [orgId])

  return (
    <section className="insp__section">
      <div className="insp__sectionhead">
        <h2>Inspections</h2>
        <Link to={`/app/inspections/new?org=${orgId}`} className="auth__btn insp__new">
          <Plus size={15} aria-hidden="true" /> New inspection
        </Link>
      </div>

      {state.status === 'loading' && <p className="auth__hint">Loading inspections…</p>}

      {state.status === 'error' && (
        <div className="auth__error" role="alert">
          Couldn’t load inspections. {state.error?.message || ''}
        </div>
      )}

      {state.status === 'ready' && state.rows.length === 0 && (
        <div className="insp__empty">
          <p>No inspections yet.</p>
          <p className="auth__hint">
            Start your first — pick aircraft or boat, enter its identifier, and you’re off.
          </p>
        </div>
      )}

      {state.status === 'ready' && state.rows.length > 0 && (
        <ul className="insp__list">
          {state.rows.map((row) => (
            <li key={row.id}>
              <Link to={`/app/inspections/${row.id}`} className="insp__row insp__rowlink">
                <span className="insp__icon" aria-hidden="true">
                  {row.vertical === 'marine' ? <Ship size={18} /> : <Plane size={18} />}
                </span>
                <span className="insp__main">
                  <span className="insp__id">
                    {row.identifier}
                    {row.mode === 'listing' && <span className="insp__modetag">Listing</span>}
                  </span>
                  <span className="insp__sub">
                    {[getVertical(row.vertical)?.label, [row.make, row.model].filter(Boolean).join(' '), row.customer_name]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <span className={`insp__status insp__status--${row.status}`}>{row.status}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function safeGet(k) {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
function safeSet(k, v) {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* ignore */
  }
}
