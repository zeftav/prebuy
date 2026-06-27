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
    q: 'How do I start an inspection?',
    a: 'From your dashboard, click “New inspection” and enter the identifier — for an aircraft shop that’s the N-number; for a boat shop it’s the HIN. Add make/model and customer details if you have them. It’s saved as a draft you can work through next.',
  },
  {
    q: 'Does PreBuy look up the aircraft for me?',
    a: 'Yes — for aircraft, enter the N-number and click “Look up”. We pull the make, model, year, and serial number from the FAA registry so you don’t have to type them (you can still edit anything). Boats are entered manually for now, since there’s no public hull-number decoder.',
  },
  {
    q: 'How do I work through an inspection?',
    a: 'Open an inspection from your dashboard. We build a checklist matched to the aircraft and order it by financial risk, so the biggest-dollar items come first. Mark each item OK, Monitor, Discrepancy, or N/A, and add notes — your progress saves automatically. Dictation and photos are coming next.',
  },
  {
    q: 'How does the logbook audit work?',
    a: 'Open an inspection and tap “Logbook audit”. Add each physical logbook (airframe, engine, propeller) with its date and tach range — we reconcile the times across books and flag gaps (a possible missing logbook) or overlaps (possibly duplicated time). You can also record notable events like ADs, Form 337s, overhauls, prop strikes, and damage.',
  },
  {
    q: 'Can I scan logbooks instead of typing them?',
    a: 'Yes (beta). In the Logbook audit, tap “Scan logbook pages” and photograph the pages. We read them and propose logbooks and notable events for you to review — tick the ones to keep and import. Because logs are often handwritten, always confirm before importing; you can edit or remove anything afterward.',
  },
  {
    q: 'How do I send the report to my customer?',
    a: 'Open the inspection and tap “Publish report”. You’ll get a private share link you can copy and send — your customer opens it in any browser, no login needed, and can save it as a PDF. The link only works once you’ve published; tap “Unpublish” to turn it off again.',
  },
  {
    q: 'Can I customize the checklist for a job?',
    a: 'Yes. On an inspection, tap “Add item” to add your own checks (with a High/Medium/Low priority). Use the flag button on any item to mark it an owner-requested priority — those float to the top of the list so you hit them first. Customizations apply to that inspection only; the starter checklist stays intact.',
  },
  {
    q: 'How do I add photos?',
    a: 'Two ways. On any checklist item, tap “Add photo” to attach discrepancy photos to that finding. For big-picture documentation, open an inspection and tap “Photo walkthrough” — we’ll prompt you through a standard shot list (exterior angles, panel, engine, logbooks, and so on) so the report has consistent coverage. Photos are stored privately to your shop.',
  },
  {
    q: 'Can I dictate my findings instead of typing?',
    a: 'Yes. Open a checklist item and tap “Dictate”, then speak your note — it transcribes live. Tap “Clean up with AI” and we’ll rewrite your spoken note into a clear, customer-ready finding and suggest a severity and status, which you can adjust. Dictation uses your browser’s speech recognition; if it isn’t available, just type. No audio is stored.',
  },
  {
    q: 'Where does the checklist come from?',
    a: 'Each aircraft model has a starter pre-purchase checklist built into PreBuy, with items weighted by how much they typically cost to fix. The Beech A36 Bonanza is included to start; more models follow. You’ll soon be able to customize and re-prioritize items for your shop or a specific buyer.',
  },
  {
    q: 'Does my shop do aircraft or boats?',
    a: 'Each shop inspects one type, chosen when you create the shop — so the whole app (identifiers, checklists, reports) is tailored to it. If you inspect more than one type, create a separate shop for each; they all share your login and you can switch between them on the dashboard.',
  },
  {
    q: 'Who can see my data?',
    a: 'Only members of your shop. PreBuy is multi-tenant with row-level security, so shops are isolated from each other. Customer reports are shared by a private link you control.',
  },
  {
    q: 'I forgot my password.',
    a: 'On the sign-in screen, click “Forgot your password?”, enter your email, and we’ll send a reset link. Follow it to choose a new password — you’ll be signed in once it’s saved. Check your spam folder if it doesn’t arrive within a few minutes.',
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
