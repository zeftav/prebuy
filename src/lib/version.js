// Single source of truth for the version/build shown in-product.
// __APP_VERSION__ and __BUILD_SHA__ are injected by vite.config.js at build time.

/* eslint-disable no-undef */
export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '0.0.0'
export const BUILD_SHA = typeof __BUILD_SHA__ !== 'undefined' ? __BUILD_SHA__ : 'dev'
/* eslint-enable no-undef */

/**
 * Compare two semver-ish strings ("1.2.3"). Returns -1, 0, or 1.
 * Tolerant of missing/extra segments and non-numeric junk (treated as 0).
 */
export function compareVersions(a, b) {
  const pa = parseParts(a)
  const pb = parseParts(b)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const da = pa[i] ?? 0
    const db = pb[i] ?? 0
    if (da > db) return 1
    if (da < db) return -1
  }
  return 0
}

/**
 * Has the user not yet seen the latest release?
 * True when they've never opened "What's new", or the latest version is newer
 * than the one they last saw.
 */
export function hasUnseenRelease(latestVersion, lastSeenVersion) {
  if (!lastSeenVersion) return true
  return compareVersions(latestVersion, lastSeenVersion) > 0
}

function parseParts(v) {
  return String(v ?? '')
    .split('.')
    .map((n) => {
      const parsed = parseInt(n, 10)
      return Number.isFinite(parsed) ? parsed : 0
    })
}
