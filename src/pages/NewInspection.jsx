// Create a draft inspection. Pick the vertical (aircraft / boat); the identifier
// field + labels adapt to it. Lands the user back on the dashboard list.

import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Plane, Ship } from 'lucide-react'
import { useAuth } from '../lib/auth.jsx'
import { fetchMemberships, pickActiveOrg } from '../lib/shops.js'
import { createInspection } from '../lib/inspections.js'
import { VERTICAL_OPTIONS, getVertical, validateIdentifier } from '../lib/verticals.js'
import Tooltip, { InfoDot } from '../components/Tooltip.jsx'
import './auth.css'
import './inspections.css'

export default function NewInspection() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const [orgId, setOrgId] = useState(params.get('org') || null)
  const [orgReady, setOrgReady] = useState(Boolean(params.get('org')))

  const [vertical, setVertical] = useState('aviation')
  const [identifier, setIdentifier] = useState('')
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [year, setYear] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  // If we weren't handed an org in the URL, resolve the user's active one.
  useEffect(() => {
    if (orgId) return
    let active = true
    fetchMemberships().then(({ data }) => {
      if (!active) return
      setOrgId(pickActiveOrg(data)?.org_id ?? null)
      setOrgReady(true)
    })
    return () => {
      active = false
    }
  }, [orgId])

  const cfg = getVertical(vertical)
  const idCheck = useMemo(() => validateIdentifier(vertical, identifier), [vertical, identifier])

  async function onSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!orgId) {
      setError('No shop selected. Go back and pick a shop.')
      return
    }
    if (!idCheck.valid) {
      setError(idCheck.error)
      return
    }
    setBusy(true)
    const { error } = await createInspection(
      orgId,
      { vertical, identifier, make, model, year, customerName, customerEmail },
      user?.id,
    )
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
        <h1>New inspection</h1>
        <p>Pick what you’re inspecting, then enter its identifier.</p>
      </div>

      {orgReady && !orgId && (
        <div className="auth__notice">
          You don’t have a shop yet. <Link to="/app/create-shop">Create one first</Link>.
        </div>
      )}

      {error && (
        <div className="auth__error" role="alert">
          {error}
        </div>
      )}

      <form className="auth__form" onSubmit={onSubmit}>
        <div className="auth__field">
          <span className="insp__fieldlabel">What are you inspecting?</span>
          <div className="insp__verticals" role="radiogroup" aria-label="Vertical">
            {VERTICAL_OPTIONS.map((v) => (
              <button
                key={v.key}
                type="button"
                role="radio"
                aria-checked={vertical === v.key}
                className={`insp__verticalbtn ${vertical === v.key ? 'is-active' : ''}`}
                onClick={() => {
                  setVertical(v.key)
                  setError(null)
                }}
              >
                {v.key === 'marine' ? <Ship size={18} aria-hidden="true" /> : <Plane size={18} aria-hidden="true" />}
                {v.label}
              </button>
            ))}
          </div>
        </div>

        <div className="auth__field">
          <label htmlFor="identifier">
            {cfg.identifierLabel}
            <Tooltip text={cfg.identifierHint}>
              <InfoDot label={`What is a ${cfg.identifierLabel}?`} />
            </Tooltip>
          </label>
          <input
            id="identifier"
            type="text"
            autoComplete="off"
            autoCapitalize="characters"
            placeholder={cfg.identifierPlaceholder}
            required
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
          />
          {identifier && !idCheck.valid && <span className="auth__hint">{idCheck.error}</span>}
        </div>

        <div className="insp__row2">
          <div className="auth__field">
            <label htmlFor="make">{cfg.makeLabel}</label>
            <input id="make" type="text" placeholder={cfg.makePlaceholder} value={make} onChange={(e) => setMake(e.target.value)} />
          </div>
          <div className="auth__field">
            <label htmlFor="model">{cfg.modelLabel}</label>
            <input id="model" type="text" placeholder={cfg.modelPlaceholder} value={model} onChange={(e) => setModel(e.target.value)} />
          </div>
          <div className="auth__field insp__year">
            <label htmlFor="year">Year</label>
            <input id="year" type="number" inputMode="numeric" placeholder="2004" value={year} onChange={(e) => setYear(e.target.value)} />
          </div>
        </div>

        <div className="auth__field">
          <label htmlFor="customerName">Customer name</label>
          <input id="customerName" type="text" autoComplete="name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
        </div>
        <div className="auth__field">
          <label htmlFor="customerEmail">Customer email</label>
          <input id="customerEmail" type="email" autoComplete="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
        </div>

        <button type="submit" className="auth__btn" disabled={busy || (Boolean(identifier) && !idCheck.valid)}>
          {busy ? 'Creating…' : 'Create inspection'}
        </button>
      </form>

      <Link to="/app" className="auth__toggle">
        ← Back to inspections
      </Link>
    </main>
  )
}
