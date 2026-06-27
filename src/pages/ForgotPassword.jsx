// Request a password reset. We always show the same success notice whether or
// not the email exists — not leaking which addresses have accounts.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plane } from 'lucide-react'
import { useAuth } from '../lib/auth.jsx'
import './auth.css'

export default function ForgotPassword() {
  const { sendPasswordReset } = useAuth()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)

  async function onSubmit(e) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    const { error } = await sendPasswordReset(email)
    setBusy(false)
    // Don't reveal account existence: show the same confirmation either way.
    // (A real send error — bad email format, transport down — still surfaces.)
    if (error && /invalid|format/i.test(error.message)) {
      setError(error.message)
      return
    }
    setSent(true)
  }

  return (
    <main className="auth">
      <Link to="/" className="auth__brand">
        <Plane size={24} aria-hidden="true" />
        <span>PreBuy</span>
      </Link>

      <div className="auth__heading">
        <h1>Reset your password</h1>
        <p>Enter your email and we’ll send you a reset link.</p>
      </div>

      {sent ? (
        <>
          <div className="auth__notice">
            If an account exists for <strong>{email}</strong>, a reset link is on its way. Check your
            inbox (and spam), then follow the link to set a new password.
          </div>
          <Link to="/login" className="auth__toggle">
            ← Back to sign in
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
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <button type="submit" className="auth__btn" disabled={busy}>
              {busy ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
          <Link to="/login" className="auth__toggle">
            ← Back to sign in
          </Link>
        </>
      )}

      <p className="auth__footer-link">
        Need a hand? See <Link to="/help">Help &amp; FAQ</Link>.
      </p>
    </main>
  )
}
