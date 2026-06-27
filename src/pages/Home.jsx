import { Plane } from 'lucide-react'
import WhatsNew from '../components/WhatsNew.jsx'
import { APP_VERSION, BUILD_SHA } from '../lib/version.js'

export default function Home() {
  return (
    <main className="home">
      <header className="home__brand">
        <Plane size={28} aria-hidden="true" />
        <span>PreBuy</span>
      </header>

      <section className="home__hero">
        <h1>Pre-purchase inspections, start to report.</h1>
        <p>
          Enter an N-number, work the make/model checklist in financial-risk order, capture findings
          by voice and camera, and hand your customer a clean report.
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
