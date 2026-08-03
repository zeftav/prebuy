// Shop checklist library. Upload an inspection-checklist PDF (e.g. Savvy's
// Beechcraft prebuy) → AI-parse into phase-tagged items → review → save as a
// reusable, shop-owned template. When you start an inspection whose make/model
// matches, that template is used automatically (checklist.js findTemplateFor).

import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, Upload, FileText, Trash2, Check, X } from 'lucide-react'
import { fetchMemberships, pickActiveOrg, accountTypeLabel } from '../lib/shops.js'
import { uploadAndParseChecklist, saveShopTemplate, listShopTemplates, deleteTemplate, groupByPhase, phaseLabel } from '../lib/templates.js'
import { getVertical } from '../lib/verticals.js'
import './auth.css'
import './inspections.css'

export default function Checklists() {
  const [memberships, setMemberships] = useState(null)
  const [orgId, setOrgId] = useState(null)

  useEffect(() => {
    fetchMemberships().then(({ data }) => {
      setMemberships(data)
      const m = pickActiveOrg(data)
      setOrgId(m?.org_id ?? null)
    })
  }, [])

  if (memberships === null) return <main className="auth-pending" aria-busy="true"><p>Loading…</p></main>
  if (!orgId) return (
    <main className="auth">
      <div className="auth__notice">Create a shop first. <Link to="/app/create-shop">Create one</Link>.</div>
    </main>
  )
  const active = memberships.find((m) => m.org_id === orgId) ?? memberships[0]
  const vertical = active?.orgs?.vertical || 'aviation'

  return (
    <main className="insp">
      <Link to="/app" className="auth__toggle"><ChevronLeft size={15} aria-hidden="true" /> Dashboard</Link>
      <div className="auth__heading">
        <h1><FileText size={20} aria-hidden="true" /> Checklist library</h1>
        <p>
          Upload your own inspection checklist (PDF) and we’ll turn it into a reusable, phase-aware template.
          It’s used automatically when you start an inspection whose make/model matches.
        </p>
      </div>

      {memberships.length > 1 && (
        <div className="insp__shopbar">
          <label className="insp__shopselect">
            <span>Shop</span>
            <select value={orgId} onChange={(e) => setOrgId(e.target.value)}>
              {memberships.map((m) => (
                <option key={m.org_id} value={m.org_id}>{m.orgs?.name || 'Shop'} · {accountTypeLabel(m.orgs?.org_type)}</option>
              ))}
            </select>
          </label>
        </div>
      )}

      <UploadChecklist orgId={orgId} vertical={vertical} onSaved={() => setOrgId((v) => v)} key={`up-${orgId}`} />
      <TemplateList orgId={orgId} vertical={vertical} key={`list-${orgId}`} />
    </main>
  )
}

function UploadChecklist({ orgId, vertical, onSaved }) {
  const [phase, setPhase] = useState('idle') // idle | parsing | review
  const [error, setError] = useState(null)
  const [parsed, setParsed] = useState(null) // { name, two_phase, items }
  const [meta, setMeta] = useState({ name: '', make: '', model: '' })
  const [items, setItems] = useState([])
  const [saving, setSaving] = useState(false)
  const cfg = getVertical(vertical) ?? getVertical('aviation')

  async function onFile(file) {
    if (!file) return
    setError(null)
    setPhase('parsing')
    const { data, error } = await uploadAndParseChecklist(file, orgId)
    if (error) { setError(error.message); setPhase('idle'); return }
    setParsed(data)
    setMeta({ name: data.name || 'Uploaded checklist', make: '', model: '' })
    setItems(data.items.map((it, i) => ({ ...it, _id: `i${i}` })))
    setPhase('review')
  }

  function patch(id, p) { setItems((prev) => prev.map((it) => (it._id === id ? { ...it, ...p } : it))) }
  function remove(id) { setItems((prev) => prev.filter((it) => it._id !== id)) }

  async function save() {
    setSaving(true)
    setError(null)
    const { error } = await saveShopTemplate({ orgId, vertical, make: meta.make, model: meta.model, name: meta.name, items })
    setSaving(false)
    if (error) return setError(error.message)
    setPhase('idle')
    setParsed(null)
    setItems([])
    onSaved()
  }

  const grouped = useMemo(() => groupByPhase(items), [items])

  return (
    <section className="insp__section lb__scan">
      <div className="insp__sectionhead"><h2><Upload size={18} aria-hidden="true" /> Upload a checklist</h2></div>

      {error && <div className="auth__error" role="alert">{error}</div>}

      {phase === 'idle' && (
        <>
          <p className="auth__hint">Upload a PDF of your inspection checklist. We read every item, tag its phase, and group it by section.</p>
          <label className="auth__btn auth__btn--ghost insp__walkthrough">
            <Upload size={15} aria-hidden="true" /> Choose checklist PDF
            <input type="file" accept="application/pdf" hidden onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
        </>
      )}

      {phase === 'parsing' && <p className="auth__hint" aria-busy="true">Reading the checklist… this can take up to a minute for a long one.</p>}

      {phase === 'review' && (
        <div className="lb__review">
          <p className="auth__hint">
            Review the parsed items{parsed?.two_phase ? ' (two-phase checklist detected)' : ''}. Fix the name and set which
            {' '}{cfg.noun} it applies to, then save. Leave <strong>Model</strong> blank to use it for any {cfg.makeLabel.toLowerCase()} of that make.
          </p>
          <div className="auth__field">
            <label>Template name</label>
            <input type="text" value={meta.name} onChange={(e) => setMeta((m) => ({ ...m, name: e.target.value }))} />
          </div>
          <div className="insp__row2">
            <div className="auth__field">
              <label>{cfg.makeLabel} (applies to)</label>
              <input type="text" placeholder="Beechcraft" value={meta.make} onChange={(e) => setMeta((m) => ({ ...m, make: e.target.value }))} />
            </div>
            <div className="auth__field">
              <label>{cfg.modelLabel} (optional)</label>
              <input type="text" placeholder="A36TC — or blank for all" value={meta.model} onChange={(e) => setMeta((m) => ({ ...m, model: e.target.value }))} />
            </div>
          </div>

          <p className="auth__hint">{items.length} items · {grouped.map((g) => `${phaseLabel(g.phase) || 'Unphased'}: ${g.items.length}`).join(' · ')}</p>

          {grouped.map((g) => (
            <div key={g.phase} className="lb__reviewgroup">
              <h3 className="lb__reviewh">{phaseLabel(g.phase) || 'Unphased'}</h3>
              <ul className="insp__list">
                {g.items.map((it) => (
                  <li key={it._id} className="insp__row">
                    <span className="insp__main">
                      <span className="insp__id">{it.category}</span>
                      <input className="ck__titleinput" type="text" value={it.title} onChange={(e) => patch(it._id, { title: e.target.value })} />
                    </span>
                    <select className="ck__phasesel" value={it.phase} onChange={(e) => patch(it._id, { phase: Number(e.target.value) })} aria-label="Phase">
                      <option value={1}>P1</option>
                      <option value={2}>P2</option>
                      <option value={0}>—</option>
                    </select>
                    <button type="button" className="insp__flag" onClick={() => remove(it._id)} aria-label="Remove item"><X size={15} aria-hidden="true" /></button>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="insp__capture">
            <button type="button" className="auth__btn" onClick={save} disabled={saving || items.length === 0 || !meta.name.trim()}>
              <Check size={15} aria-hidden="true" /> {saving ? 'Saving…' : `Save template (${items.length} items)`}
            </button>
            <button type="button" className="auth__btn auth__btn--ghost" onClick={() => { setPhase('idle'); setParsed(null); setItems([]) }}>Discard</button>
          </div>
        </div>
      )}
    </section>
  )
}

function TemplateList({ orgId, vertical }) {
  const [templates, setTemplates] = useState(null)

  async function refresh() {
    const { data } = await listShopTemplates(orgId)
    setTemplates((data ?? []).filter((t) => (t.vertical || 'aviation') === vertical))
  }
  useEffect(() => { refresh() }, [orgId]) // eslint-disable-line react-hooks/exhaustive-deps

  async function remove(t) {
    setTemplates((prev) => prev.filter((x) => x.id !== t.id))
    await deleteTemplate(t.id)
  }

  if (templates === null) return null
  return (
    <section className="insp__section">
      <div className="insp__sectionhead"><h2>Your templates</h2></div>
      {templates.length === 0 ? (
        <p className="auth__hint">No uploaded templates yet. Upload one above.</p>
      ) : (
        <ul className="insp__list">
          {templates.map((t) => (
            <li key={t.id} className="insp__row">
              <span className="insp__main">
                <span className="insp__id">{t.name}</span>
                <span className="insp__sub">
                  {[t.make, t.model].filter(Boolean).join(' ') || 'Any make/model'} · {t.item_count} items
                </span>
              </span>
              <button type="button" className="insp__flag" onClick={() => remove(t)} aria-label="Delete template"><Trash2 size={15} aria-hidden="true" /></button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
