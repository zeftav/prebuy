// Authenticated landing. Loads the user's shop memberships:
//   - none  → send them to create-shop (open self-serve onboarding)
//   - some  → list them (the inspection workspace lands here later)
// Rendered inside <ProtectedRoute>, so a session is guaranteed.

import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { Plane, LogOut } from 'lucide-react'
import { useAuth } from '../lib/auth.jsx'
import { fetchMemberships } from '../lib/shops.js'
import './auth.css'

export default function Dashboard() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [state, setState] = useState({ status: 'loading', memberships: [], error: null })

  useEffect(() => {
    let active = true
    fetchMemberships().then(({ data, error }) => {
      if (!active) return
      if (error) setState({ status: 'error', memberships: [], error })
      else setState({ status: 'ready', memberships: data, error: null })
    })
    return () => {
      active = false
    }
  }, [])

  async function onSignOut() {
    await signOut()
    navigate('/login', { replace: true })
  }

  if (state.status === 'loading') {
    return (
      <main className="auth-pending" aria-busy="true">
        <p>Loading your shops…</p>
      </main>
    )
  }

  if (state.status === 'error') {
    return (
      <main className="auth">
        <div className="auth__error" role="alert">
          Couldn’t load your shops. {state.error?.message || ''}
        </div>
        <button className="auth__btn auth__btn--ghost" onClick={() => window.location.reload()}>
          Retry
        </button>
      </main>
    )
  }

  // No shop yet → onboarding.
  if (state.memberships.length === 0) {
    return <Navigate to="/app/create-shop" replace />
  }

  return (
    <main className="auth">
      <div className="dash__topbar">
        <span className="auth__brand">
          <Plane size={22} aria-hidden="true" />
          PreBuy
        </span>
        <button className="auth__toggle" onClick={onSignOut}>
          <LogOut size={14} aria-hidden="true" /> Sign out
        </button>
      </div>

      <div className="auth__heading">
        <h1>Your shops</h1>
        <p>Signed in as {user?.email}.</p>
      </div>

      <div className="dash__orgs">
        {state.memberships.map((m) => (
          <div className="dash__org" key={m.id}>
            <span className="dash__org-name">{m.orgs?.name || 'Unnamed shop'}</span>
            <span className="dash__role">{m.role}</span>
          </div>
        ))}
      </div>

      <Link to="/app/create-shop" className="auth__toggle">
        + Create another shop
      </Link>

      <p className="auth__footer-link">
        Need a hand? See <Link to="/help">Help &amp; FAQ</Link>.
      </p>
    </main>
  )
}
