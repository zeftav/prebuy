// Marketing / landing page (the app's public front door at `/`). Positioning:
// PreBuy is a condition-report tool for the whole sale/acquisition lifecycle —
// create a listing, run the pre-purchase inspection/survey, hand the buyer a
// clean report — across many industries. The credibility hook is its origin in
// aviation, the most exacting, documentation-heavy pre-purchase world.

import {
  Plane, Ship, Car, Home as HomeIcon, Search, ListChecks, Mic, Camera, FileText,
  Sparkles, BookOpen, ShieldCheck, ArrowRight, Tag, ClipboardCheck, UserCheck,
} from 'lucide-react'
import { Link } from 'react-router-dom'

const AUDIENCE = [
  { icon: Tag, title: 'Sellers & brokers', body: 'Spin up a polished listing / spec-sheet in minutes — start the file before it sells, and hand it to an inspector when it does.' },
  { icon: ClipboardCheck, title: 'Inspectors & surveyors', body: 'Work faster in the field — guided checklist, voice notes, photos, records audit — and deliver a report that builds trust.' },
  { icon: UserCheck, title: 'Buyers', body: 'Know what you’re buying: an independent, documented condition report before you commit the money.' },
]

const STEPS = [
  { icon: Search, title: 'Identify', body: 'Enter the identifier — N-number, VIN, HIN, address — and we pull what’s on record.' },
  { icon: ListChecks, title: 'Assemble', body: 'A checklist tailored to the asset, ordered by financial risk so the big-dollar items come first.' },
  { icon: Mic, title: 'Inspect', body: 'Mark each item and dictate your notes — AI turns them into clean, customer-ready findings.' },
  { icon: Camera, title: 'Document', body: 'Guided photos, a records/logbook audit, and document attachments — all in one place.' },
  { icon: FileText, title: 'Report', body: 'A clean, shareable report — or a sales listing spec-sheet — as a link or PDF.' },
]

const FEATURES = [
  { icon: Search, title: 'Identifier lookup', body: 'Pull the basics from the registry — no retyping.' },
  { icon: ListChecks, title: 'Risk-ordered checklists', body: 'Work the costliest, deal-killing items first.' },
  { icon: Mic, title: 'Voice findings + AI', body: 'Dictate; we write the professional finding.' },
  { icon: BookOpen, title: 'Records & logbook audit', body: 'Track history, flag gaps, scan to import.' },
  { icon: FileText, title: 'Profile + report', body: 'A spec-sheet and findings report buyers trust.' },
  { icon: Sparkles, title: 'AI write-up', body: 'A balanced, broker-style summary from your data.' },
]

const INDUSTRIES = [
  { icon: Plane, label: 'Aviation' },
  { icon: Ship, label: 'Marine' },
  { icon: Car, label: 'Automotive & RV' },
  { icon: HomeIcon, label: 'Real estate' },
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
        <h1>Trusted condition reports for anything worth buying.</h1>
        <p>
          PreBuy guides a thorough pre-purchase inspection — or a sharp sales listing — and turns it into
          a clean, shareable report. Built to aviation’s exacting standard, useful anywhere a deal depends
          on knowing the real condition.
        </p>
        <div className="home__ctarow">
          <Link to="/login" className="home__cta home__cta--primary">
            Create your shop <ArrowRight size={17} aria-hidden="true" />
          </Link>
          <a href="#how" className="home__cta home__cta--ghost">See how it works</a>
        </div>
        <p className="home__note">Free to start · aviation, marine, automotive &amp; RV, real estate — more on the way.</p>
      </section>

      {/* Who it's for */}
      <section className="home__section">
        <h2>Useful at every step of the deal</h2>
        <div className="home__features">
          {AUDIENCE.map((a) => (
            <div key={a.title} className="home__feature">
              <span className="home__featicon" aria-hidden="true"><a.icon size={18} /></span>
              <div>
                <h3>{a.title}</h3>
                <p>{a.body}</p>
              </div>
            </div>
          ))}
        </div>
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

      {/* Industries */}
      <section className="home__section">
        <h2>One platform, many assets</h2>
        <div className="home__industries">
          {INDUSTRIES.map((v) => (
            <span key={v.label} className="home__industry">
              <v.icon size={18} aria-hidden="true" /> {v.label}
            </span>
          ))}
          <span className="home__industry home__industry--more">&amp; more</span>
        </div>
      </section>

      {/* Origin story / credibility */}
      <section className="home__origin">
        <ShieldCheck size={22} aria-hidden="true" />
        <p>
          <strong>Forged in aviation.</strong> Aircraft pre-buys are among the most exacting,
          paperwork-heavy purchases there are — logbooks, airworthiness directives, dollar-ranked
          findings. PreBuy was built to that standard, then opened up to anything valuable that changes
          hands.
        </p>
      </section>

      <section className="home__cta-band">
        <h2>Make your next deal a documented one.</h2>
        <Link to="/login" className="home__cta home__cta--primary">
          Create your shop <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </section>
    </main>
  )
}
