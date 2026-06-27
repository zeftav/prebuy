// User-facing "What's new" log. Newest first. Keep entries friendly and
// non-technical — this is what shop staff read, not the engineering CHANGELOG.
//
// CHANGELOG RULE: when a user-facing change ships, add an entry here AND bump the
// version in package.json. The newest entry's `version` should match package.json.

export const releases = [
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
