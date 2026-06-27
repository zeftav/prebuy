// New inspection — Identify-first. The vertical comes from the shop. Step 1 is the
// identifier; for aviation we look it up in the FAA registry and prepopulate
// make/model/year/serial (the inspector confirms/edits). Then customer details →
// create a draft. (Marine has no public decoder yet, so it's manual.)

import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Plane, Ship, Search, CheckCircle2 } from 'lucide-react'
import { useAuth } from '../lib/auth.jsx'
import { fetchMemberships, pickActiveOrg } from '../lib/shops.js'
import { createInspection } from '../lib/inspections.js'
import { getVertical, validateIdentifier } from '../lib/verticals.js'
import { lookupAircraft } from '../lib/aircraft.js'
import Tooltip, { InfoDot } from '../components/Tooltip.jsx'
import './auth.css'
import './inspections.css'

export default function NewInspection() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const wantedOrg = params.get('org')

  const [shop, setShop] = useState(null) // { org_id, vertical, name }
  const [shopReady, setShopReady] = useState(false)

  const [identifier, setIdentifier] = useState('')
  const [make, setMake] = useState('')
  const [model, setModel] = useState('')
  const [year, setYear] = useState('')
  const [serial, setSerial] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [inspectorName, setInspectorName] = useState('')
  const [location, setLocation] = useState('')
  const [inspectionDate, setInspectionDate] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  // Lookup (Identify) state.
  const [lookup, setLookup] = useState({ status: 'idle' }) // idle|busy|found|notfound|error

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

  async function onLookup() {
    setError(null)
    if (!idCheck.valid) {
      setLookup({ status: 'idle' })
      setError(idCheck.error)
      return
    }
    setLookup({ status: 'busy' })
    const { data, error } = await lookupAircraft(identifier)
    if (error) {
      setLookup({ status: 'error' })
      return
    }
    if (!data) {
      setLookup({ status: 'notfound' })
      return
    }
    // Prefill from the registry (inspector can still edit).
    if (data.make) setMake(data.make)
    if (data.model) setModel(data.model)
    if (data.year) setYear(String(data.year))
    if (data.serial) setSerial(data.serial)
    setLookup({ status: 'found', summary: [data.year, data.make, data.model].filter(Boolean).join(' '), serial: data.serial })
  }

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
      { vertical: shop.vertical, identifier, make, model, year, serial, customerName, customerEmail, inspectorName, location, inspectionDate },
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

  const canLookup = cfg.hasLookup

  return (
    <main className="auth">
      <span className="auth__brand">
        {cfg.key === 'marine' ? <Ship size={22} aria-hidden="true" /> : <Plane size={22} aria-hidden="true" />}
        PreBuy
      </span>

      <div className="auth__heading">
        <h1>New {cfg.noun} inspection</h1>
        <p>
          {shop?.name ? `${shop.name} · ` : ''}
          {canLookup
            ? `Enter the ${cfg.identifierLabel} — we’ll look it up and fill in what we can.`
            : `Enter the ${cfg.identifierLabel} to start a draft.`}
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
          <div className="insp__lookup">
            <input
              id="identifier"
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              placeholder={cfg.identifierPlaceholder}
              required
              value={identifier}
              onChange={(e) => {
                setIdentifier(e.target.value)
                if (lookup.status !== 'idle') setLookup({ status: 'idle' })
              }}
            />
            {canLookup && (
              <button
                type="button"
                className="auth__btn auth__btn--ghost insp__lookupbtn"
                onClick={onLookup}
                disabled={lookup.status === 'busy' || !idCheck.valid}
              >
                <Search size={15} aria-hidden="true" />
                {lookup.status === 'busy' ? 'Looking…' : 'Look up'}
              </button>
            )}
          </div>
          {identifier && !idCheck.valid && <span className="auth__hint">{idCheck.error}</span>}
          {lookup.status === 'found' && (
            <span className="insp__found">
              <CheckCircle2 size={15} aria-hidden="true" />
              Found: {lookup.summary}
              {lookup.serial ? ` · S/N ${lookup.serial}` : ''}
            </span>
          )}
          {lookup.status === 'notfound' && (
            <span className="auth__hint">No FAA match — enter the details manually below.</span>
          )}
          {lookup.status === 'error' && (
            <span className="auth__hint">Lookup unavailable right now — you can still enter details manually.</span>
          )}
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

        {cfg.key === 'aviation' && (
          <div className="auth__field">
            <label htmlFor="serial">Serial number</label>
            <input id="serial" type="text" placeholder="E-212" value={serial} onChange={(e) => setSerial(e.target.value)} />
          </div>
        )}

        <div className="auth__field">
          <label htmlFor="customerName">Customer name</label>
          <input id="customerName" type="text" autoComplete="name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
        </div>
        <div className="auth__field">
          <label htmlFor="customerEmail">Customer email</label>
          <input id="customerEmail" type="email" autoComplete="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
        </div>

        <div className="insp__row2">
          <div className="auth__field">
            <label htmlFor="inspector">Inspector</label>
            <input id="inspector" type="text" placeholder="Your name / A&P #" value={inspectorName} onChange={(e) => setInspectorName(e.target.value)} />
          </div>
          <div className="auth__field insp__year">
            <label htmlFor="idate">Date</label>
            <input id="idate" type="date" value={inspectionDate} onChange={(e) => setInspectionDate(e.target.value)} />
          </div>
        </div>
        <div className="auth__field">
          <label htmlFor="location">Location</label>
          <input id="location" type="text" placeholder="e.g. KPKV, Port Lavaca TX" value={location} onChange={(e) => setLocation(e.target.value)} />
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
