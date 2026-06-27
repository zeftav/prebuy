import { Plane } from 'lucide-react'

// eslint-disable-next-line no-undef
const BUILD_SHA = typeof __BUILD_SHA__ !== 'undefined' ? __BUILD_SHA__ : 'dev'

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

      <footer className="home__build">build {BUILD_SHA}</footer>
    </main>
  )
}
