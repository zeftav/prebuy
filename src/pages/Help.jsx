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
    a: 'Open an inspection and tap “Logbook audit”, then “Scan a logbook.” Pick what it is — airframe, engine, propeller (and which engine/prop on a twin) — and snap the pages in order. When you’re done we compile a PDF copy of that book and read the dates, times and notable events (ADs, 337s, overhauls, prop strikes, damage) right off the pages. Each logbook is its own scan, so you build them up one at a time. We then reconcile the times across books and flag gaps (a possible missing logbook) or overlaps (possibly duplicated time). Because logs are handwritten, always double-check the read-back — every time and event stays editable, and you can add an event by hand.',
  },
  {
    q: 'Can I make a PDF copy of each logbook?',
    a: 'Yes — it happens automatically when you scan. Each logbook gets its own PDF, compiled from the pages you snapped, stored with the inspection. Flip “Show on report” on a logbook to include its PDF as a download link for the buyer. On a logbook’s card you can “Add pages” to append more later (it re-compiles and reads the new pages), or “Manage pages” to rotate a sideways page, reorder, or remove one and re-compile. Large books (80–100 pages) are fine — pages are shrunk and added one at a time so it builds on your phone.',
  },
  {
    q: 'How do I capture a whole logbook quickly?',
    a: 'When scanning, tap “Open camera” for the in-app camera — it stays open so you can shoot page after page without jumping in and out for each one. Or use “Add pages” to select many at once from your camera roll (handy if you photographed the book ahead of time). Picked the wrong type? Open the logbook and tap “Change type” to switch it (airframe ↔ engine ↔ prop / position) — we relabel its PDF and re-tag its events. You can also scan AD compliance reports and Form 337s as their own records; we read each AD/337 out as a dated event. Deleting a page, a PDF, or a whole logbook always asks you to confirm first, so it’s hard to lose a scan by a mis-tap.',
  },
  {
    q: 'How do I send the report to my customer?',
    a: 'Open the inspection and tap “Publish report”. You’ll get a private share link you can copy and send — your customer opens it in any browser, no login needed, and can save it as a PDF. The link only works once you’ve published; tap “Unpublish” to turn it off again.',
  },
  {
    q: 'How do I delete an inspection or its report?',
    a: 'Open the inspection and scroll to the bottom — owners and admins see “Delete this inspection.” You’ll be asked to type the identifier (N-number / HIN / address) to confirm. Deleting permanently removes the inspection and everything in it — items, photos, documents and logbooks — and takes any published report offline. It can’t be undone, so to just hide a report instead, use “Unpublish.”',
  },
  {
    q: 'What is the profile, and what shows on the report?',
    a: 'The profile (tap it on an inspection) is the “spec sheet” half of the report, and it matches your industry: an aircraft profile has airframe times, engines/props, and FAA currency dates; a vessel profile has LOA/beam/draft, engine hours, and documentation/haul-out dates; a property profile has square footage, year built, and system ages. All of them also take a summary, a damage/history callout, and a categorized equipment list. The customer report is a two-part document — the profile first, then your inspection findings — and anything you leave blank is simply left off. The report also builds a dated maintenance timeline automatically from your logbook events.',
  },
  {
    q: 'Can AI look up the specs for me?',
    a: 'Yes (beta). On the profile, tap “Research with AI” — we look up the make/model’s published specifications from the web and propose the spec sheet (dimensions, weights, capacities, engines, typical equipment) plus a short summary and the sources we used. These are typical-for-the-model figures, so treat them as a draft to verify against the actual asset. Tick what to keep; we never overwrite anything you’ve already entered. Works for aircraft, boats and homes. Add the make/model (or look up the identifier) first.',
  },
  {
    q: 'Can I fill the profile from photos instead of typing?',
    a: 'Yes (beta), for aircraft today. On an aircraft profile, tap “Scan to pre-fill” and photograph records — a weight & balance / equipment list, an avionics placard, or logbook pages. We propose specs, currency dates, and equipment for you to review and tick. We never overwrite anything you’ve already entered; picked fields drop into the form for you to check before saving. Scan support for boats and homes is on the way.',
  },
  {
    q: 'Can PreBuy write the report summary for me?',
    a: 'Yes. On the Aircraft profile, tap “Write with AI” and we’ll draft a balanced, professional overview from your profile, logbook events, and inspection findings — original prose grounded only in your own data, never copied from a listing. It lands in the Summary box for you to edit; always review before saving.',
  },
  {
    q: 'Can I customize the checklist for a job?',
    a: 'Yes. On an inspection, tap “Add item” to add your own checks (with a High/Medium/Low priority). Use the flag button on any item to mark it an owner-requested priority — those float to the top of the list so you hit them first. Customizations apply to that inspection only; the starter checklist stays intact.',
  },
  {
    q: 'Can I attach a document, like oil-analysis results?',
    a: 'Yes. Open the checklist item (e.g. the engine’s oil-analysis check) and tap “Attach file” to upload a PDF or photo — lab results, receipts, a 337, etc. Attachments are stored privately to your shop and appear with that item on the customer report. Use “Add photo” for inspection photos and “Attach file” for documents.',
  },
  {
    q: 'How do I add photos?',
    a: 'Two ways. On any checklist item, tap “Add photo” to attach discrepancy photos to that finding. For big-picture documentation, open an inspection and tap “Photo walkthrough.” There you can tap “Start guided walkthrough” to be stepped through the standard shots one at a time — take the photo and it saves and advances to the next shot automatically (no extra confirm). Tap “Take another” to add more angles to the same shot, “← Back” to revisit one, or remove a photo and reshoot — or capture any single shot from the list. (Aircraft, boats and similar run the full list; homes run the exterior shots and you add interior/system photos as you go.) Photos are stored privately to your shop.',
  },
  {
    q: 'Can I dictate my findings instead of typing?',
    a: 'Yes. Open a checklist item and tap “Dictate”, then speak your note — it transcribes live. Tap “Clean up with AI” and we’ll rewrite your spoken note into a clear, customer-ready finding and suggest a severity and status, which you can adjust. Dictation uses your browser’s speech recognition; if it isn’t available, just type. No audio is stored.',
  },
  {
    q: 'Can I dictate the whole walk-around at once?',
    a: 'Yes — open an inspection and tap “Dictate walk-around.” Talk through the entire walk-around in one pass, the way you’d normally work it (“left main tire worn, nose strut a little low, small oil weep at the left valve cover, prop looks good…”). We split it into individual findings and map each to the right checklist item, writing a clean note and suggesting a status and severity for each. Then you review everything before it’s applied — fix the wording, change a status, re-map a finding to a different item, or untick it; low-confidence matches are flagged. Anything you didn’t mention is listed afterward as “fill in the blanks,” highest financial risk first. If dictation isn’t available on your browser, type or paste the walk-around instead.',
  },
  {
    q: 'What are follow-ups, and how are they different from findings?',
    a: 'A finding is a conclusion about a checklist item (OK, monitor, or a discrepancy). A follow-up is an open question — something you noticed that needs more work before you can conclude: “needs research,” “look deeper,” “awaiting records,” or “second opinion.” Open an inspection and use the Follow-ups list to jot these as you go (or tap the magnifier on any checklist item to flag it). Work the list down before publishing — the publish bar reminds you when follow-ups are still open. You can mark any follow-up to appear on the customer report under “Recommended for further evaluation,” which buyers value as an honest list of areas to look into more closely.',
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
