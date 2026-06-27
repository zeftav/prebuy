// Login + sign-up screen. One form, two modes (toggle). Open self-serve: anyone
// can create an account, then name their shop (→ /app, which routes a brand-new
// user to create-shop). Email/password via Supabase Auth.

import { useState } from 'react'
import { Link, useLocation, useNavigate, Navigate } from 'react-router-dom'
import { Plane } from 'lucide-react'
import { useAuth } from '../lib/auth.jsx'
import Tooltip, { InfoDot } from '../components/Tooltip.jsx'
import './auth.css'

export default function Login() {
  const { session, loading, signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const dest = location.state?.from?.pathname || '/app'

  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  // Already signed in? Skip the form.
  if (!loading && session) return <Navigate to={dest} replace />

  async function onSubmit(e) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      if (mode === 'signup') {
        const { data, error } = await signUp(email, password)
        if (error) throw error
        // If email confirmation is on, there's no session yet.
        if (!data.session) {
          setNotice('Check your email to confirm your account, then sign in.')
          setMode('signin')
          return
        }
      } else {
        const { error } = await signIn(email, password)
        if (error) throw error
      }
      navigate(dest, { replace: true })
    } catch (err) {
      setError(friendlyAuthError(err))
    } finally {
      setBusy(false)
    }
  }

  const isSignup = mode === 'signup'

  return (
    <main className="auth">
      <Link to="/" className="auth__brand">
        <Plane size={24} aria-hidden="true" />
        <span>PreBuy</span>
      </Link>

      <div className="auth__heading">
        <h1>{isSignup ? 'Create your account' : 'Welcome back'}</h1>
        <p>
          {isSignup
            ? 'Sign up, then name your shop — you’ll be its owner.'
            : 'Sign in to your inspection shop.'}
        </p>
      </div>

      {notice && <div className="auth__notice">{notice}</div>}
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

        <div className="auth__field">
          <label htmlFor="password">
            Password
            {isSignup && (
              <Tooltip text="At least 6 characters. Use something you don’t reuse elsewhere.">
                <InfoDot label="Password requirements" />
              </Tooltip>
            )}
          </label>
          <input
            id="password"
            type="password"
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {isSignup && <span className="auth__hint">6+ characters.</span>}
        </div>

        <button type="submit" className="auth__btn" disabled={busy}>
          {busy ? 'Working…' : isSignup ? 'Create account' : 'Sign in'}
        </button>
      </form>

      {!isSignup && (
        <Link to="/forgot" className="auth__toggle">
          Forgot your password?
        </Link>
      )}

      <button
        type="button"
        className="auth__toggle"
        onClick={() => {
          setMode(isSignup ? 'signin' : 'signup')
          setError(null)
          setNotice(null)
        }}
      >
        {isSignup
          ? 'Already have an account? Sign in'
          : 'New to PreBuy? Create an account'}
      </button>

      <p className="auth__footer-link">
        Need a hand? See <Link to="/help">Help &amp; FAQ</Link>.
      </p>
    </main>
  )
}

// Map Supabase auth errors to something a shop owner can act on.
function friendlyAuthError(err) {
  const msg = (err?.message || '').toLowerCase()
  if (msg.includes('invalid login')) return 'Email or password is incorrect.'
  if (msg.includes('already registered')) return 'That email already has an account — try signing in.'
  if (msg.includes('password')) return err.message
  return err?.message || 'Something went wrong. Please try again.'
}
