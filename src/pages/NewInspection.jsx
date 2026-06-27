// Create a draft inspection. The vertical comes from the SHOP (set at shop
// creation) — not chosen here — so the identifier field + labels are fixed to
// what this shop inspects. Lands the user back on the dashboard list.

import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Plane, Ship } from 'lucide-react'
import { useAuth } from '../lib/auth.jsx'
import { fetchMemberships, pickActiveOrg } from '../lib/shops.js'
import { createInspection } from '../lib/inspections.js'
import { getVertical, validateIdentifier } from '../lib/verticals.js'
import Tooltip, { InfoDot } from '../components/Tooltip.jsx'
import './auth.css'
import './inspections.css'

export default function NewInspection() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const wantedOrg = params.get('org')

  // Resolve the shop (and therefore the vertical) before showing the form.
  const [shop, setShop] = useState(null) // { org_id, vertical, name }
  const [shopReady, setShopReady] = useState(false)

  const [identifier, setIdentifier] = useState('')
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [year, setYear] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    fetchMemberships().then(({ data }) => {
      if (!active) return
      const m = (wantedOrg && data.find((x) => x.org_id === wantedOrg)) || pickActiveOrg(data)
      setShop(m ? { org_id: m.org_id, vertical: m.orgs?.vertical || 'aviation', name: m.orgs?.name } : null)
      setShopReady(true)
    })
    return () => {
      active = false
    }
  }, [wantedOrg])

  const cfg = getVertical(shop?.vertical) ?? getVertical('aviation')
  const idCheck = useMemo(
    () => validateIdentifier(shop?.vertical ?? 'aviation', identifier),
    [shop, identifier],
  )

  async function onSubmit(e) {
    e.preventDefault()
    setError(null)
    if (!shop?.org_id) {
      setError('No shop selected. Go back and pick a shop.')
      return
    }
    if (!idCheck.valid) {
      setError(idCheck.error)
      return
    }
    setBusy(true)
    const { error } = await createInspection(
      shop.org_id,
      { vertical: shop.vertical, identifier, make, model, year, customerName, customerEmail },
      user?.id,
    )
    setBusy(false)
    if (error) {
      setError(error.message)
      return
    }
    navigate('/app', { replace: true })
  }

  if (shopReady && !shop) {
    return (
      <main className="auth">
        <div className="auth__notice">
          You don’t have a shop yet. <Link to="/app/create-shop">Create one first</Link>.
        </div>
      </main>
    )
  }

  return (
    <main className="auth">
      <span className="auth__brand">
        {cfg.key === 'marine' ? <Ship size={22} aria-hidden="true" /> : <Plane size={22} aria-hidden="true" />}
        PreBuy
      </span>

      <div className="auth__heading">
        <h1>New {cfg.noun} inspection</h1>
        <p>
          {shop?.name ? `${shop.name} · ` : ''}Enter the {cfg.identifierLabel} to start a draft.
        </p>
      </div>

      {error && (
        <div className="auth__error" role="alert">
          {error}
        </div>
      )}

      <form className="auth__form" onSubmit={onSubmit}>
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
