// Authenticated home = the active shop's inspection list.
//   - no membership → create-shop (onboarding)
//   - has shop(s)   → list that shop's inspections, with a switcher if >1 shop
// Rendered inside <ProtectedRoute>, so a session is guaranteed.

import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Plane, LogOut, Plus, Ship, ShieldCheck, Trash2 } from 'lucide-react'
import { useAuth } from '../lib/auth.jsx'
import { fetchMemberships, pickActiveOrg } from '../lib/shops.js'
import { listInspectionsForOrg, deleteInspection } from '../lib/inspections.js'
import { openFollowupCounts } from '../lib/followups.js'
import { getVertical } from '../lib/verticals.js'
import './auth.css'
import './inspections.css'

const ACTIVE_ORG_KEY = 'prebuy:activeOrg'

export default function Dashboard() {
  const { user, signOut, isSuperAdmin } = useAuth()
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
          {isSuperAdmin && (
            <Link to="/admin" className="auth__toggle">
              <ShieldCheck size={14} aria-hidden="true" /> Platform
            </Link>
          )}
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

      <InspectionList
        orgId={activeMembership.org_id}
        orgType={activeMembership.orgs?.org_type || 'inspector'}
        canManage={activeMembership.role === 'owner' || activeMembership.role === 'admin'}
      />

      <p className="auth__footer-link">
        Need a hand? See <Link to="/help">Help &amp; FAQ</Link>.
      </p>
    </main>
  )
}

function InspectionList({ orgId, orgType = 'inspector', canManage }) {
  const [state, setState] = useState({ status: 'loading', rows: [] })
  const [followCounts, setFollowCounts] = useState({})
  const broker = orgType === 'broker'
  const noun = broker ? 'listing' : 'inspection'
  const heading = broker ? 'Listings' : 'Inspections'

  useEffect(() => {
    let active = true
    setState({ status: 'loading', rows: [] })
    setFollowCounts({})
    listInspectionsForOrg(orgId).then(({ data, error }) => {
      if (!active) return
      setState({ status: error ? 'error' : 'ready', rows: data, error })
    })
    // Open follow-up counts for the whole shop, in one query (badge data).
    openFollowupCounts(orgId).then(({ data }) => {
      if (active) setFollowCounts(data)
    })
    return () => {
      active = false
    }
  }, [orgId])

  function removeRow(id) {
    setState((s) => ({ ...s, rows: s.rows.filter((r) => r.id !== id) }))
  }

  return (
    <section className="insp__section">
      <div className="insp__sectionhead">
        <h2>{heading}</h2>
        <Link to={`/app/inspections/new?org=${orgId}`} className="auth__btn insp__new">
          <Plus size={15} aria-hidden="true" /> New {noun}
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
          <p>No {noun}s yet.</p>
          <p className="auth__hint">
            Start your first — enter the identifier and you’re off.
          </p>
        </div>
      )}

      {state.status === 'ready' && state.rows.length > 0 && (
        <ul className="insp__list">
          {state.rows.map((row) => (
            <li key={row.id} className="insp__listrow">
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
                {followCounts[row.id] > 0 && (
                  <span className="insp__loosebadge" title={`${followCounts[row.id]} open follow-up${followCounts[row.id] === 1 ? '' : 's'}`}>
                    {followCounts[row.id]} {followCounts[row.id] === 1 ? 'loose end' : 'loose ends'}
                  </span>
                )}
                <span className={`insp__status insp__status--${row.status}`}>{row.status}</span>
              </Link>
              {canManage && <RowDelete row={row} onDeleted={() => removeRow(row.id)} />}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

// Per-row delete with a two-step confirm (no accidental taps). Owner/admin only.
function RowDelete({ row, onDeleted }) {
  const [armed, setArmed] = useState(false)
  const [busy, setBusy] = useState(false)

  async function confirm() {
    setBusy(true)
    const { error } = await deleteInspection(row.id)
    if (error) {
      setBusy(false)
      setArmed(false)
      return
    }
    onDeleted()
  }

  if (!armed) {
    return (
      <button
        type="button"
        className="insp__rowdelbtn"
        aria-label={`Delete ${row.identifier}`}
        title="Delete"
        onClick={() => setArmed(true)}
      >
        <Trash2 size={16} aria-hidden="true" />
      </button>
    )
  }
  return (
    <span className="insp__rowconfirm">
      <span>Delete?</span>
      <button type="button" className="insp__rowyes" onClick={confirm} disabled={busy}>
        {busy ? '…' : 'Yes'}
      </button>
      <button type="button" className="insp__rowno" onClick={() => setArmed(false)} disabled={busy}>
        No
      </button>
    </span>
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
