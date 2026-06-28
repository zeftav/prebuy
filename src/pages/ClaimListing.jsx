// Claim a broker handoff into one of your shops. The broker sends a /claim/:token
// link; the recipient (signed in) previews the listing and claims it, which copies
// it into their chosen shop as a full pre-purchase inspection (via the
// claim-listing edge fn). Renders inside ProtectedRoute, so the user is signed in.

import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { Plane, Ship, Home as HomeIcon, ChevronLeft, ClipboardCheck } from 'lucide-react'
import { previewHandoff, claimHandoff } from '../lib/handoff.js'
import { fetchMemberships } from '../lib/shops.js'
import './auth.css'
import './inspections.css'

export default function ClaimListing() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [state, setState] = useState('loading') // loading | ready | notfound | claimed
  const [preview, setPreview] = useState(null)
  const [shops, setShops] = useState([])
  const [orgId, setOrgId] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      const [{ data, error }, { data: ms }] = await Promise.all([previewHandoff(token), fetchMemberships()])
      if (!active) return
      if (error || !data) return setState('notfound')
      if (data.status && data.status !== 'pending') return setState('claimed')
      setPreview(data)
      setShops(ms ?? [])
      setOrgId(ms?.[0]?.org_id ?? '')
      setState('ready')
    })()
    return () => {
      active = false
    }
  }, [token])

  async function claim() {
    setBusy(true)
    setError(null)
    const { data, error } = await claimHandoff(token, orgId)
    setBusy(false)
    if (error) return setError(error.message)
    navigate(`/app/inspections/${data.inspection_id}`)
  }

  if (state === 'loading') {
    return <main className="auth-pending" aria-busy="true"><p>Loading handoff…</p></main>
  }
  if (state === 'notfound') {
    return (
      <main className="auth">
        <div className="auth__error">This handoff link is invalid or no longer available.</div>
        <Link to="/app" className="auth__toggle">← Go to your inspections</Link>
      </main>
    )
  }
  if (state === 'claimed') {
    return (
      <main className="auth">
        <div className="auth__notice">This listing has already been claimed (or the link was revoked).</div>
        <Link to="/app" className="auth__toggle">← Go to your inspections</Link>
      </main>
    )
  }

  const Icon = preview.vertical === 'marine' ? Ship : preview.vertical === 'home' ? HomeIcon : Plane

  return (
    <main className="insp">
      <Link to="/app" className="auth__toggle">
        <ChevronLeft size={15} aria-hidden="true" /> Inspections
      </Link>

      <div className="auth__heading">
        <h1><ClipboardCheck size={20} aria-hidden="true" /> Claim a listing</h1>
        <p><strong>{preview.from_shop}</strong> sent you a listing to inspect.</p>
      </div>

      <div className="insp__detailhead">
        <span className="insp__icon" aria-hidden="true"><Icon size={22} /></span>
        <div>
          <h2 className="insp__detailid">{preview.identifier}</h2>
          <p className="insp__detailsub">{preview.asset || '—'}{preview.has_profile ? ' · profile included' : ''}</p>
        </div>
      </div>

      <p className="auth__hint">
        Claiming copies this listing into your shop as a full pre-purchase inspection — the profile,
        photos and logbooks come with it, and the checklist is added so you can start inspecting.
      </p>

      {shops.length === 0 ? (
        <div className="auth__notice">
          You need a shop first. <Link to="/app/create-shop" className="auth__inlinelink">Create one</Link>, then reopen this link.
        </div>
      ) : (
        <div className="insp__listingactions">
          <div className="auth__field">
            <label htmlFor="claim-shop">Claim into</label>
            <select id="claim-shop" value={orgId} onChange={(e) => setOrgId(e.target.value)}>
              {shops.map((m) => (
                <option key={m.org_id} value={m.org_id}>{m.orgs?.name || 'Your shop'}</option>
              ))}
            </select>
          </div>
          {error && <div className="auth__error" role="alert">{error}</div>}
          <button type="button" className="auth__btn" onClick={claim} disabled={busy || !orgId}>
            <ClipboardCheck size={15} aria-hidden="true" /> {busy ? 'Claiming…' : 'Claim & start inspection'}
          </button>
        </div>
      )}
    </main>
  )
}
