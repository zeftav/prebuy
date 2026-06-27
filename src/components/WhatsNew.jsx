import { useEffect, useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import { releases } from '../lib/releases.js'
import { APP_VERSION, hasUnseenRelease } from '../lib/version.js'
import './WhatsNew.css'

const STORAGE_KEY = 'prebuy:lastSeenVersion'
const LATEST = releases[0]?.version ?? APP_VERSION

function readLastSeen() {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null // private mode / storage disabled — just don't nag
  }
}

function writeLastSeen(version) {
  try {
    localStorage.setItem(STORAGE_KEY, version)
  } catch {
    /* ignore */
  }
}

/**
 * Self-contained "What's new" control: a footer button (with an unseen-release
 * dot) that opens a panel of friendly release notes. Drop <WhatsNew /> anywhere.
 */
export default function WhatsNew() {
  const [open, setOpen] = useState(false)
  const [unseen, setUnseen] = useState(false)

  // Defer the localStorage read to mount so SSR/prerender stays safe.
  useEffect(() => {
    setUnseen(hasUnseenRelease(LATEST, readLastSeen()))
  }, [])

  // Close on Escape while open.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  function openPanel() {
    setOpen(true)
    setUnseen(false)
    writeLastSeen(LATEST)
  }

  return (
    <>
      <button type="button" className="whatsnew__trigger" onClick={openPanel}>
        <Sparkles size={14} aria-hidden="true" />
        What’s new
        {unseen && <span className="whatsnew__dot" aria-label="unread updates" />}
      </button>

      {open && (
        <div
          className="whatsnew__backdrop"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            className="whatsnew__panel"
            role="dialog"
            aria-modal="true"
            aria-label="What’s new in PreBuy"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="whatsnew__header">
              <h2>What’s new</h2>
              <button
                type="button"
                className="whatsnew__close"
                onClick={() => setOpen(false)}
                aria-label="Close"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="whatsnew__body">
              {releases.map((r) => (
                <section key={r.version} className="whatsnew__release">
                  <div className="whatsnew__release-head">
                    <span className="whatsnew__version">v{r.version}</span>
                    <span className="whatsnew__date">{r.date}</span>
                  </div>
                  {r.title && <h3>{r.title}</h3>}
                  <ul>
                    {r.items.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
