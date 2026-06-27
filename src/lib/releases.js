// User-facing "What's new" log. Newest first. Keep entries friendly and
// non-technical — this is what shop staff read, not the engineering CHANGELOG.
//
// CHANGELOG RULE: when a user-facing change ships, add an entry here AND bump the
// version in package.json. The newest entry's `version` should match package.json.

export const releases = [
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
