// Financial-risk ordering for inspection items.
//
// The whole point of the workflow is to inspect the highest-dollar-risk items
// first, so a deal-killer surfaces early and cheap. This is the kind of
// "dangerous to break" pure logic the primer says to unit-test — keep it pure
// (no I/O) and covered.

// Items still needing attention sort ahead of resolved ones, so a tech always
// sees live work at the top of the list.
const STATUS_PENDING_RANK = { pending: 0, discrepancy: 0, monitor: 1, ok: 2, na: 2 }

/**
 * A single comparable risk score for an item. Higher = inspect sooner.
 * Driven primarily by risk_weight (0..100); severity nudges a confirmed
 * discrepancy further up.
 */
export function riskScore(item) {
  const weight = clamp(num(item?.risk_weight), 0, 100)
  const severity = clamp(num(item?.severity), 0, 100)
  // Weight dominates; severity is a secondary booster (max +50).
  return weight + severity * 0.5
}

/**
 * Order items for the guided workflow: unresolved first, then by financial risk
 * (highest first), then by the template's own sort_order as a stable tiebreak.
 * Returns a new array; does not mutate the input.
 */
export function orderByFinancialRisk(items) {
  if (!Array.isArray(items)) return []
  return [...items].sort((a, b) => {
    const statusDelta = statusRank(a) - statusRank(b)
    if (statusDelta !== 0) return statusDelta

    // Owner-requested priorities surface first within the same status band.
    const ownerDelta = (b?.owner_priority ? 1 : 0) - (a?.owner_priority ? 1 : 0)
    if (ownerDelta !== 0) return ownerDelta

    const scoreDelta = riskScore(b) - riskScore(a) // desc
    if (scoreDelta !== 0) return scoreDelta

    return num(a?.sort_order) - num(b?.sort_order) // asc, stable tiebreak
  })
}

/**
 * Coarse risk band for UI labelling/colour: 'high' | 'medium' | 'low'.
 * Thresholds chosen so big-dollar deal-killers read as "high".
 */
export function riskBand(item) {
  const w = clamp(num(item?.risk_weight), 0, 100)
  if (w >= 75) return 'high'
  if (w >= 45) return 'medium'
  return 'low'
}

function statusRank(item) {
  const s = item?.status
  return s in STATUS_PENDING_RANK ? STATUS_PENDING_RANK[s] : 0
}

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n))
}
