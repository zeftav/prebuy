// In-app Help / FAQ (PREB-24). Seeded with onboarding/auth content; this page is
// maintained alongside every feature thereafter (help-from-the-onset standing
// rule). Public route — reachable before login.

import { Link } from 'react-router-dom'
import { Plane } from 'lucide-react'
import './help.css'

// Q&A content lives as data so adding an entry per feature is a one-liner.
const FAQ = [
  {
    q: 'What is a "shop"?',
    a: 'Your business workspace in PreBuy. Inspections, checklists, team members, and reports all live under your shop. When you sign up you create one and become its owner.',
  },
  {
    q: 'How do I sign up?',
    a: 'Anyone can self-serve: create an account with your email and a password, then name your shop. No invite needed to start.',
  },
  {
    q: 'I signed up but didn’t get a session — what now?',
    a: 'If email confirmation is enabled, check your inbox for a confirmation link, then come back and sign in. Otherwise you’ll be taken straight into your shop.',
  },
  {
    q: 'Can I have more than one shop?',
    a: 'Yes. From your dashboard you can create additional shops — handy if you run separate businesses. You’re the owner of any shop you create.',
  },
  {
    q: 'Who can see my data?',
    a: 'Only members of your shop. PreBuy is multi-tenant with row-level security, so shops are isolated from each other. Customer reports are shared by a private link you control.',
  },
  {
    q: 'I forgot my password.',
    a: 'Password reset is coming shortly. For now, contact support and we’ll help you get back in.',
  },
]

export default function Help() {
  return (
    <main className="help">
      <Link to="/" className="auth__brand">
        <Plane size={22} aria-hidden="true" />
        <span>PreBuy</span>
      </Link>

      <div className="auth__heading">
        <h1>Help &amp; FAQ</h1>
        <p>Answers to common questions. More will appear here as features ship.</p>
      </div>

      <div className="help__list">
        {FAQ.map((item) => (
          <details key={item.q} className="help__item">
            <summary>{item.q}</summary>
            <p>{item.a}</p>
          </details>
        ))}
      </div>

      <p className="auth__footer-link">
        Still stuck? Email <a href="mailto:support@prebuy.app">support@prebuy.app</a>.
      </p>

      <p className="auth__footer-link">
        <Link to="/">← Back to home</Link>
      </p>
    </main>
  )
}
