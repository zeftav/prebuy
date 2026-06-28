// User-facing "What's new" log. Newest first. Keep entries friendly and
// non-technical — this is what shop staff read, not the engineering CHANGELOG.
//
// CHANGELOG RULE: when a user-facing change ships, add an entry here AND bump the
// version in package.json. The newest entry's `version` should match package.json.

export const releases = [
  {
    version: '0.30.2',
    date: '2026-06-28',
    title: 'Clearer HIN lookup',
    items: [
      'When you look up a boat HIN, we now tell you where each detail came from: “Builder matched in the USCG database” when the manufacturer code is on file, or a note that the builder code isn’t on file (enter it manually) — and that the model year and serial are read from the HIN itself.',
    ],
  },
  {
    version: '0.30.1',
    date: '2026-06-28',
    title: 'Research with AI — fills more',
    items: [
      'Fixed “Research with AI” coming back empty: it now fills the model’s typical published specs from the web and its own knowledge, instead of leaving fields blank when search results were thin.',
    ],
  },
  {
    version: '0.30.0',
    date: '2026-06-28',
    title: 'Research the profile with AI',
    items: [
      'New on the profile: “Research with AI” looks up the make/model’s published specs from the web and pre-fills the spec sheet — dimensions, weights, capacities, engines, typical equipment, and a short summary — with sources.',
      'These are typical-for-the-model figures (a draft to verify against the actual asset), and we never overwrite anything you’ve already entered. Tick what to keep, then Save.',
      'Works for aircraft, boats and homes.',
    ],
  },
  {
    version: '0.29.2',
    date: '2026-06-28',
    title: 'Boat builder lookup',
    items: [
      'When you look up a boat HIN, we now fill in the builder for recognized manufacturer codes (Hunter to start; the full USCG manufacturer list is being loaded).',
      'Heads up: a HIN encodes the builder, serial and year — not the model — so the Model field is yours to fill in.',
    ],
  },
  {
    version: '0.29.1',
    date: '2026-06-28',
    title: 'Delete from the dashboard',
    items: [
      'Owners and admins can now delete an inspection right from the dashboard list — tap the trash icon, then confirm. (The full delete is still on each inspection’s page too.)',
    ],
  },
  {
    version: '0.29.0',
    date: '2026-06-28',
    title: 'Reports that match your industry',
    items: [
      'The profile and report now fit what you inspect: boats show LOA/beam/draft, engine hours and documentation/haul-out dates; homes show square footage, year built and system ages — no more aircraft-only fields on a boat or home report.',
      'Aircraft reports are unchanged. Engines/props show for aircraft and boats; homes skip them.',
    ],
  },
  {
    version: '0.28.0',
    date: '2026-06-28',
    title: 'Delete an inspection',
    items: [
      'Owners and admins can now delete an inspection or listing — open it and scroll to the bottom.',
      'You’ll type the identifier to confirm; deleting removes everything (items, photos, documents, logbooks) and takes any published report offline. It can’t be undone — to just hide a report, use “Unpublish” instead.',
    ],
  },
  {
    version: '0.27.2',
    date: '2026-06-28',
    title: 'Clearer sign-up',
    items: [
      'If you try to sign up with an email that already has an account, we now tell you right away and point you to sign in (or reset your password) — instead of waiting on a confirmation email that never comes.',
    ],
  },
  {
    version: '0.26.0',
    date: '2026-06-28',
    title: 'Boat HIN lookup',
    items: [
      'Starting a boat inspection? Enter the HIN and tap “Look up” — we read the model year and serial straight from it, and the builder when the manufacturer code is known.',
      'Edit anything before you save, just like the N-number lookup.',
    ],
  },
  {
    version: '0.25.0',
    date: '2026-06-28',
    title: 'Hand a listing to a shop',
    items: [
      'Brokers can now hand a listing to an inspecting shop: create a secure link and send it.',
      'The shop opens the link, picks their PreBuy shop, and claims it — the listing copies in as a full inspection with the profile, photos and logbooks.',
      'Works for any shop already on PreBuy. (Auto-email invites and a searchable shop directory are coming next.)',
    ],
  },
  {
    version: '0.24.0',
    date: '2026-06-28',
    title: 'A bigger story',
    items: [
      'Reworked the landing page to speak to the whole deal — sellers/brokers, inspectors/surveyors, and buyers — across aviation, marine, automotive/RV and real estate.',
      'Leads with the outcome (a clean, trustworthy report) and the origin story: built to aviation’s exacting standard, useful anywhere valuable things change hands.',
    ],
  },
  {
    version: '0.23.0',
    date: '2026-06-28',
    title: 'Broker listings',
    items: [
      'New on the New form: choose “Pre-purchase inspection” or “Broker listing.” A listing is capture-only — profile, photos, logbooks and an AI write-up — and publishes as a clean listing/spec-sheet (no checklist or findings).',
      'Any shop can do both; listings are tagged on your dashboard.',
      'Turn a listing into a full inspection in one tap — “Start inspection from this listing” carries over the profile, photos and logbooks.',
    ],
  },
  {
    version: '0.22.1',
    date: '2026-06-28',
    title: 'Multiple photos per shot',
    items: [
      'You can now take more than one photo for any walkthrough spot — in the guided run, “Keep & add another”; in the list, “Add another.”',
      'Each photo can be removed individually, and all of them show in the report’s photo documentation.',
    ],
  },
  {
    version: '0.22.0',
    date: '2026-06-28',
    title: 'One-button photo walkthrough',
    items: [
      'New “Start guided walkthrough” on the Photo walkthrough: it steps you through each required shot one at a time — take the photo, keep or retake, and it advances automatically. Far fewer taps.',
      'Aircraft and boats run the full shot list; homes run the exterior shots, with interior/system photos added as you go.',
      'The per-shot list is still there if you’d rather grab one shot at a time.',
    ],
  },
  {
    version: '0.21.0',
    date: '2026-06-28',
    title: 'Attach documents (oil analysis & more)',
    items: [
      'Attach a PDF or photo to any checklist item — oil-analysis lab results, receipts, a 337, and so on.',
      'Attachments are private to your shop and show up with that item on the customer report.',
      '“Add photo” is for inspection photos; the new “Attach file” is for documents.',
    ],
  },
  {
    version: '0.20.0',
    date: '2026-06-28',
    title: 'Multi-engine, deeper',
    items: [
      'Logbooks and notable events can now be assigned to a specific engine/prop (#1 left, #2 right; front/rear for centerline twins), and times reconcile per engine.',
      'On a twin, the checklist automatically splits engine and propeller items per engine, so you inspect each one.',
      'The report’s maintenance timeline shows which engine an event belongs to.',
    ],
  },
  {
    version: '0.19.2',
    date: '2026-06-27',
    title: 'Mobile layout fix',
    items: [
      'Fixed the page rendering wider than the screen on phones (no more pinch-to-zoom on load) and removed stray edge lines on mobile.',
    ],
  },
  {
    version: '0.19.1',
    date: '2026-06-27',
    title: 'Landing page on phones',
    items: [
      'Tidied up the landing page on small screens — cleaner top bar, full-width buttons, and better spacing.',
    ],
  },
  {
    version: '0.19.0',
    date: '2026-06-27',
    title: 'Home & boat inspections',
    items: [
      'PreBuy now does home inspections and boat surveys, not just aircraft — pick the type when you create a shop.',
      'Each comes with a thorough, risk-ordered starter checklist (home from the InterNACHI standard; boat from typical pre-purchase survey scope).',
      'Same workflow throughout — identify, work the checklist, capture findings, publish the report.',
    ],
  },
  {
    version: '0.18.0',
    date: '2026-06-27',
    title: 'A proper front page',
    items: [
      'PreBuy has a real landing page now — what it does, how the workflow runs, and the headline features, with a clear path to create your shop.',
    ],
  },
  {
    version: '0.17.0',
    date: '2026-06-27',
    title: 'Multi-engine aircraft',
    items: [
      'Aircraft profiles now handle single- or multi-engine aircraft — set the number of engines and record each engine and prop separately.',
      'Engine #1 is the left engine, #2 the right; centerline push-pull twins (like a Cessna 337) are #1 front / #2 rear.',
      'Engine count is pre-filled from the FAA registry when you look up the N-number, and the report shows each engine.',
    ],
  },
  {
    version: '0.16.0',
    date: '2026-06-27',
    title: 'A checklist for every aircraft',
    items: [
      'No model-specific checklist? PreBuy now starts you on a thorough general aircraft survey instead of a blank inspection — then customize it per job.',
      'Adding your own checklist item now has a “Notes / what to check” field for context or the owner’s concern.',
    ],
  },
  {
    version: '0.15.1',
    date: '2026-06-27',
    title: 'Take a photo or choose one',
    items: [
      'Everywhere you add photos or scan records, you now get two buttons: take a new photo, or upload/choose an existing one.',
      'Works on phone and desktop — on mobile, “take” opens the camera and “upload” opens your photo library.',
    ],
  },
  {
    version: '0.15.0',
    date: '2026-06-27',
    title: 'Let AI write the summary',
    items: [
      'New on the Aircraft profile: “Write with AI” drafts a professional, broker-style overview of the aircraft and the inspection.',
      'It’s built only from your own data — the profile, logbook events, and findings — and never copied from any listing.',
      'The draft lands in the Summary box (and the top of the report) for you to edit. Always review before saving.',
    ],
  },
  {
    version: '0.14.0',
    date: '2026-06-27',
    title: 'Scan records to fill the profile',
    items: [
      'New (beta) on the Aircraft profile: photograph records — a weight & balance / equipment list, an avionics placard, or logbook pages — and we’ll propose specs, currency dates, and equipment.',
      'Review and tick what to keep; we never overwrite anything you’ve already entered.',
      'Picked fields drop straight into the profile form — eyeball them, then Save.',
    ],
  },
  {
    version: '0.13.0',
    date: '2026-06-27',
    title: 'A professional, two-part report',
    items: [
      'New “Aircraft profile” on every inspection — record specs, times, currency/due dates, damage history, and a categorized equipment list.',
      'The customer report is now a polished two-part document: the aircraft profile (spec sheet) first, then your inspection findings.',
      'The report builds a dated maintenance timeline from your logbook events, flags overdue/due-soon items, and states damage history clearly.',
      'Blank profile fields are simply left off — fill in as much or as little as you like.',
    ],
  },
  {
    version: '0.12.1',
    date: '2026-06-27',
    title: 'What’s-new everywhere',
    items: [
      'The version and “What’s new” footer now shows on every page, not just the home screen.',
    ],
  },
  {
    version: '0.12.0',
    date: '2026-06-27',
    title: 'Who, where & when',
    items: [
      'Record the inspector, location, and inspection date on each job.',
      'They now appear at the top of the customer report.',
      'Set them when you create an inspection, or edit them anytime.',
    ],
  },
  {
    version: '0.11.0',
    date: '2026-06-27',
    title: 'Scan your logbooks',
    items: [
      'New (beta): photograph logbook pages and we’ll read them for you.',
      'We propose the logbooks and notable events — review, pick, and import.',
      'Always confirm before importing; handwriting varies.',
    ],
  },
  {
    version: '0.10.0',
    date: '2026-06-27',
    title: 'Logbook audit',
    items: [
      'New logbook audit: enter each logbook’s dates and tach times across the aircraft’s life.',
      'We reconcile the hours and flag gaps (a possible missing logbook) or overlaps.',
      'Record notable events — ADs, 337s, overhauls, prop strikes, damage — in one place.',
    ],
  },
  {
    version: '0.9.0',
    date: '2026-06-27',
    title: 'Publish a customer report',
    items: [
      'Publish any inspection to a clean, read-only report — share by link, no login for your customer.',
      'Findings are grouped by priority, with your photos, and a “Save PDF” button.',
      'Unpublish any time to switch the link off.',
    ],
  },
  {
    version: '0.8.0',
    date: '2026-06-27',
    title: 'Make the checklist yours',
    items: [
      'Add your own checklist items to any inspection.',
      'Flag owner-requested priorities to float them to the top of the list.',
      'Set a priority (High / Medium / Low) so custom items slot into the right place.',
    ],
  },
  {
    version: '0.7.0',
    date: '2026-06-27',
    title: 'Photos — walkthrough & findings',
    items: [
      'New “Photo walkthrough”: we prompt you through a standard shot list to document the whole aircraft.',
      'Attach photos to any discrepancy right on the checklist item.',
      'Your photos are stored privately to your shop.',
    ],
  },
  {
    version: '0.6.0',
    date: '2026-06-27',
    title: 'Dictate your findings',
    items: [
      'Tap the mic on any checklist item and speak your note — no typing.',
      '“Clean up with AI” turns your spoken note into a clear, customer-ready finding.',
      'It also suggests a severity and status so you can confirm and move on.',
    ],
  },
  {
    version: '0.5.0',
    date: '2026-06-27',
    title: 'Guided checklist — work the inspection',
    items: [
      'Open an inspection to get a checklist tailored to the aircraft.',
      'Items are ordered by financial risk — the big-dollar items come first.',
      'Mark each OK / Monitor / Discrepancy / N/A and jot your findings as you go.',
      'Beech A36 Bonanza pre-purchase checklist included to start.',
    ],
  },
  {
    version: '0.4.0',
    date: '2026-06-27',
    title: 'Look up an aircraft by N-number',
    items: [
      'Starting an aircraft inspection? Enter the N-number and tap “Look up”.',
      'We fill in the make, model, year, and serial from the FAA registry — edit anything you like.',
    ],
  },
  {
    version: '0.3.1',
    date: '2026-06-27',
    title: 'Shops have a type',
    items: [
      'When you create a shop, you now pick what it inspects (aircraft or boat).',
      'New inspections use your shop’s type automatically — no need to choose each time.',
      'Run more than one kind of inspection? Create a shop for each and switch between them.',
    ],
  },
  {
    version: '0.3.0',
    date: '2026-06-27',
    title: 'Inspections — aircraft & boats',
    items: [
      'Start an inspection: pick aircraft or boat, enter its identifier, add customer details.',
      'Your dashboard now lists your shop’s inspections, with a switcher if you run more than one shop.',
      'PreBuy now handles boats as well as aircraft — more inspection types are on the way.',
    ],
  },
  {
    version: '0.2.1',
    date: '2026-06-27',
    title: 'Password reset',
    items: [
      'Forgot your password? Reset it yourself from the sign-in screen.',
      'We’ll email you a secure link to choose a new one.',
    ],
  },
  {
    version: '0.2.0',
    date: '2026-06-27',
    title: 'Accounts & your shop',
    items: [
      'Sign up and sign in with email and password.',
      'Create your shop in one step — you become its owner.',
      'New Help & FAQ page (find it in the top nav or any “Need a hand?” link).',
    ],
  },
  {
    version: '0.1.0',
    date: '2026-06-26',
    title: 'Welcome to PreBuy',
    items: [
      'First preview build is live.',
      'Version and build info now show in the app footer.',
      "This “What’s new” panel will keep you posted on every update.",
    ],
  },
]
