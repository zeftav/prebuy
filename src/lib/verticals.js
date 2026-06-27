// Per-vertical config — the one place that differs between aircraft, boat, etc.
// Adding a vertical = an entry here + a seeded checklist, NOT a schema change
// (the DB is generic since migration 002). Keep the shared engine vertical-blind.
//
// Aviation is the lead vertical; marine ships alongside it to exercise the
// multi-asset engine. Home/automotive are reserved in the DB check constraint
// but not surfaced in the UI yet.

export const VERTICALS = {
  aviation: {
    key: 'aviation',
    label: 'Aircraft',
    noun: 'aircraft',
    identifierLabel: 'N-number',
    identifierPlaceholder: 'N12345',
    identifierHint: 'The aircraft’s FAA tail number (registration). Starts with “N”.',
    makeLabel: 'Make',
    modelLabel: 'Model',
    makePlaceholder: 'Cessna',
    modelPlaceholder: '172S',
  },
  marine: {
    key: 'marine',
    label: 'Boat',
    noun: 'boat',
    identifierLabel: 'HIN',
    identifierPlaceholder: 'ABC12345D404',
    identifierHint: 'Hull Identification Number — 12 characters, usually on the transom.',
    makeLabel: 'Builder',
    modelLabel: 'Model',
    makePlaceholder: 'Catalina',
    modelPlaceholder: '30',
  },
}

// Order shown in the create UI.
export const VERTICAL_OPTIONS = [VERTICALS.aviation, VERTICALS.marine]

export function getVertical(key) {
  return VERTICALS[key] ?? null
}

/**
 * Validate + normalize an identifier for a vertical. Returns { valid, value, error }.
 * Validation is deliberately lenient (format help, not gatekeeping) — manual entry
 * across verticals, no authoritative resolver wired up yet.
 */
export function validateIdentifier(verticalKey, raw) {
  const value = String(raw ?? '').trim().toUpperCase().replace(/\s+/g, '')
  if (!value) return { valid: false, value, error: 'Enter an identifier.' }

  switch (verticalKey) {
    case 'aviation': {
      // N + 1–5 alphanumerics (FAA tail numbers are 2–6 chars total).
      if (!/^N[0-9A-Z]{1,5}$/.test(value)) {
        return { valid: false, value, error: 'N-numbers start with N and are 2–6 characters (e.g. N12345).' }
      }
      return { valid: true, value, error: null }
    }
    case 'marine': {
      // Modern HINs are 12 alphanumeric characters.
      if (!/^[A-Z0-9]{12}$/.test(value)) {
        return { valid: false, value, error: 'A HIN is 12 letters/numbers (e.g. ABC12345D404).' }
      }
      return { valid: true, value, error: null }
    }
    default:
      // Unknown/relaxed vertical: accept any non-empty value.
      return { valid: true, value, error: null }
  }
}
