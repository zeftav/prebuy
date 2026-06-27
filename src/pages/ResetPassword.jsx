// Set-a-new-password screen. The reset email links here; supabase-js detects the
// recovery token in the URL and establishes a session (surfaced via useAuth).
// With a session present we show the form; without one the link was bad/expired.

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plane } from 'lucide-react'
import { useAuth } from '../lib/auth.jsx'
import { validatePassword, passwordsMatch } from '../lib/password.js'
import Tooltip, { InfoDot } from '../components/Tooltip.jsx'
import './auth.css'

export default function ResetPassword() {
  const { session, loading, updatePassword } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function onSubmit(e) {
    e.preventDefault()
    setError(null)
    const check = validatePassword(password)
    if (!check.valid) {
      setError(check.error)
      return
    }
    if (!passwordsMatch(password, confirm)) {
      setError('Passwords don’t match.')
      return
    }
    setBusy(true)
    const { error } = await updatePassword(password)
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    // Now signed in with the new password — go straight to the app.
    navigate('/app', { replace: true })
  }

  return (
    <main className="auth">
      <span className="auth__brand">
        <Plane size={24} aria-hidden="true" />
        <span>PreBuy</span>
      </span>

      <div className="auth__heading">
        <h1>Choose a new password</h1>
      </div>

      {loading ? (
        <p className="auth__hint">Verifying your reset link…</p>
      ) : !session ? (
        <>
          <div className="auth__error" role="alert">
            This reset link is invalid or has expired.
          </div>
          <Link to="/forgot" className="auth__toggle">
            Request a new reset link
          </Link>
        </>
      ) : (
        <>
          {error && (
            <div className="auth__error" role="alert">
              {error}
            </div>
          )}
          <form className="auth__form" onSubmit={onSubmit}>
            <div className="auth__field">
              <label htmlFor="password">
                New password
                <Tooltip text="At least 6 characters. Use something you don’t reuse elsewhere.">
                  <InfoDot label="Password requirements" />
                </Tooltip>
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="auth__field">
              <label htmlFor="confirm">Confirm new password</label>
              <input
                id="confirm"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            <button type="submit" className="auth__btn" disabled={busy}>
              {busy ? 'Saving…' : 'Save new password'}
            </button>
          </form>
        </>
      )}

      <p className="auth__footer-link">
        Need a hand? See <Link to="/help">Help &amp; FAQ</Link>.
      </p>
    </main>
  )
}
