// Marketing / landing page (the app's public front door at `/`, served for both
// prebuy.app and app.prebuy.app until a separate apex site exists). What PreBuy is,
// how the workflow runs, the headline features, and a clear CTA into sign-up.

import { Plane, Search, ListChecks, Mic, Camera, FileText, Sparkles, BookOpen, ShieldCheck, ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'

const STEPS = [
  { icon: Search, title: 'Identify', body: 'Enter the N-number — we pull make, model, year and serial from the FAA registry (single or multi-engine).' },
  { icon: ListChecks, title: 'Assemble', body: 'Get a model-specific checklist (or a thorough general one), ordered by financial risk so the big-dollar items come first.' },
  { icon: Mic, title: 'Inspect', body: 'Mark each item OK / monitor / discrepancy and dictate your notes — AI cleans them into customer-ready findings.' },
  { icon: Camera, title: 'Document', body: 'Photograph discrepancies and a guided walkthrough, and audit the logbooks — scan the pages to import them.' },
  { icon: FileText, title: 'Report', body: 'Publish a professional two-part report — aircraft profile + findings — as a share link or PDF.' },
]

const FEATURES = [
  { icon: Search, title: 'FAA N-number lookup', body: 'The full registry, on tap — no retyping the basics.' },
  { icon: ListChecks, title: 'Risk-ordered checklists', body: 'Work the costliest, deal-killing items first.' },
  { icon: Mic, title: 'Voice findings + AI', body: 'Dictate; we write the clean, professional finding.' },
  { icon: BookOpen, title: 'Logbook audit + OCR', body: 'Track time across books, flag gaps, scan to import.' },
  { icon: FileText, title: 'Aircraft profile + report', body: 'A spec-sheet and findings report buyers trust.' },
  { icon: Sparkles, title: 'AI write-up', body: 'A balanced, broker-style summary from your data.' },
]

export default function Home() {
  return (
    <main className="home">
      <header className="home__brand">
        <Plane size={28} aria-hidden="true" />
        <span>PreBuy</span>
        <nav className="home__nav">
          <a href="#how" className="home__navhow">How it works</a>
          <Link to="/help">Help</Link>
          <Link to="/login" className="home__signin">Sign in</Link>
        </nav>
      </header>

      <section className="home__hero">
        <h1>Pre-purchase inspections, from N-number to customer report.</h1>
        <p>
          PreBuy walks your shop through the entire pre-buy — pull the aircraft, work the checklist in
          financial-risk order, capture findings by voice and camera, audit the logbooks, and publish a
          clean, professional report your buyer can trust.
        </p>
        <div className="home__ctarow">
          <Link to="/login" className="home__cta home__cta--primary">
            Create your shop <ArrowRight size={17} aria-hidden="true" />
          </Link>
          <a href="#how" className="home__cta home__cta--ghost">See how it works</a>
        </div>
        <p className="home__note">Free to start · aviation first, more inspection types on the way.</p>
      </section>

      <section className="home__section" id="how">
        <h2>How it works</h2>
        <ol className="home__steps">
          {STEPS.map((s, i) => (
            <li key={s.title} className="home__step">
              <span className="home__stepnum" aria-hidden="true">{i + 1}</span>
              <span className="home__stepicon" aria-hidden="true"><s.icon size={18} /></span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="home__section">
        <h2>Everything the job needs</h2>
        <div className="home__features">
          {FEATURES.map((f) => (
            <div key={f.title} className="home__feature">
              <span className="home__featicon" aria-hidden="true"><f.icon size={18} /></span>
              <div>
                <h3>{f.title}</h3>
                <p>{f.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="home__who">
        <ShieldCheck size={22} aria-hidden="true" />
        <p>
          Built for <strong>inspection shops and brokers</strong>. Aviation is the lead vertical; the
          same engine extends to marine, automotive and home inspections — one platform, many assets.
        </p>
      </section>

      <section className="home__cta-band">
        <h2>Run your next pre-buy in PreBuy.</h2>
        <Link to="/login" className="home__cta home__cta--primary">
          Create your shop <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </section>
    </main>
  )
}
