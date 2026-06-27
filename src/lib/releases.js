// User-facing "What's new" log. Newest first. Keep entries friendly and
// non-technical — this is what shop staff read, not the engineering CHANGELOG.
//
// CHANGELOG RULE: when a user-facing change ships, add an entry here AND bump the
// version in package.json. The newest entry's `version` should match package.json.

export const releases = [
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
