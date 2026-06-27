// Self-serve "create your shop" onboarding (PREB-22). Names the org and makes
// the current user its owner via the `signup` edge function. Mobile-friendly.

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plane } from 'lucide-react'
import { useAuth } from '../lib/auth.jsx'
import { createShop, validateShopName, slugifyShopName } from '../lib/shops.js'
import Tooltip, { InfoDot } from '../components/Tooltip.jsx'
import './auth.css'

export default function CreateShop() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const check = validateShopName(name)
  const slug = slugifyShopName(name)

  async function onSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!check.valid) {
      setError(check.error)
      return
    }
    setBusy(true)
    const { error } = await createShop(name)
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    navigate('/app', { replace: true })
  }

  return (
    <main className="auth">
      <span className="auth__brand">
        <Plane size={22} aria-hidden="true" />
        PreBuy
      </span>

      <div className="auth__heading">
        <h1>Create your shop</h1>
        <p>
          This is your workspace{user?.email ? ` (${user.email})` : ''}. You’ll be the owner and can
          invite your team later.
        </p>
      </div>

      {error && (
        <div className="auth__error" role="alert">
          {error}
        </div>
      )}

      <form className="auth__form" onSubmit={onSubmit}>
        <div className="auth__field">
          <label htmlFor="shop">
            Shop name
            <Tooltip text="Your business name — shown to your team and on customer reports. You can change it later.">
              <InfoDot label="What is a shop?" />
            </Tooltip>
          </label>
          <input
            id="shop"
            type="text"
            autoComplete="organization"
            placeholder="e.g. Zefting Aviation"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          {slug && (
            <span className="auth__hint">
              Web address preview: prebuy.app/{slug}
            </span>
          )}
        </div>

        <button type="submit" className="auth__btn" disabled={busy || !check.valid}>
          {busy ? 'Creating…' : 'Create shop'}
        </button>
      </form>

      <Link to="/app" className="auth__toggle">
        ← Back
      </Link>

      <p className="auth__footer-link">
        Not sure what to put? See <Link to="/help">Help &amp; FAQ</Link>.
      </p>
    </main>
  )
}
