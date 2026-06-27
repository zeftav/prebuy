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
    hasLookup: true, // FAA registry prepopulation (see lib/aircraft.js)
    // Guided overview shot list — big-picture documentation photos, taken early.
    overviewShots: [
      'Exterior — front 3/4 view',
      'Exterior — left side',
      'Exterior — right side',
      'Exterior — tail / empennage',
      'Instrument panel / avionics',
      'Engine — left side',
      'Engine — right side',
      'Propeller / spinner',
      'Left wing — leading edge',
      'Right wing — leading edge',
      'Landing gear — nose & mains',
      'Interior — front seats / cockpit',
      'Interior — rear / baggage',
      'Logbooks (stack / spines)',
      'Data plate / registration',
    ],
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
    hasLookup: false, // no clean public HIN decoder — manual entry for now
    overviewShots: [
      'Exterior — bow',
      'Exterior — port side',
      'Exterior — starboard side',
      'Exterior — stern / transom',
      'Helm / cockpit',
      'Engine / engine bay',
      'Cabin — interior',
      'Hull — visible bottom / waterline',
      'Deck / rigging',
      'HIN plate',
    ],
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
