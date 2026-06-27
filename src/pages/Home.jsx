import { Plane } from 'lucide-react'
import { Link } from 'react-router-dom'
import WhatsNew from '../components/WhatsNew.jsx'
import { APP_VERSION, BUILD_SHA } from '../lib/version.js'

export default function Home() {
  return (
    <main className="home">
      <header className="home__brand">
        <Plane size={28} aria-hidden="true" />
        <span>PreBuy</span>
        <nav className="home__nav">
          <Link to="/help">Help</Link>
          <Link to="/login" className="home__signin">
            Sign in
          </Link>
        </nav>
      </header>

      <section className="home__hero">
        <h1>Pre-purchase inspections, start to report.</h1>
        <p>
          Enter an N-number, work the make/model checklist in financial-risk order, capture findings
          by voice and camera, and hand your customer a clean report.
        </p>
        <p>
          <Link to="/login" className="home__cta">
            Create your shop →
          </Link>
        </p>
        <p className="home__status">
          Scaffolding in place — auth, the inspection flow, and the report view are next.
        </p>
      </section>

      <footer className="home__footer">
        <span className="home__build">
          v{APP_VERSION} · build {BUILD_SHA}
        </span>
        <WhatsNew />
      </footer>
    </main>
  )
}
