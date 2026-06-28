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
    guidedCapture: 'full', // one-button walkthrough runs the whole shot list
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
  home: {
    key: 'home',
    label: 'Home',
    noun: 'property',
    identifierLabel: 'Address',
    identifierPlaceholder: '123 Main St, Springfield, IL',
    identifierHint: 'The property’s street address.',
    makeLabel: 'Property type',
    modelLabel: 'Style',
    makePlaceholder: 'Single-family',
    modelPlaceholder: 'Two-story',
    hasLookup: false, // property-data API later; manual for now
    // Homes are shot room-by-room as you go; only the exterior elevations suit a
    // linear one-button run, so the rest stays freeform (per-shot) capture.
    guidedCapture: 'exterior',
    overviewShots: [
      'Exterior — front elevation',
      'Exterior — left side',
      'Exterior — right side',
      'Exterior — rear elevation',
      'Roof — overview',
      'Foundation / basement / crawl space',
      'Electrical panel',
      'Heating equipment',
      'Cooling equipment',
      'Water heater',
      'Kitchen',
      'Bathrooms',
      'Attic / insulation',
      'Garage',
      'Address / house number',
    ],
  },
  marine: {
    key: 'marine',
    label: 'Boat',
    noun: 'boat',
    identifierLabel: 'HIN',
    identifierPlaceholder: 'ABC12345D404',
    identifierHint: 'Hull Identification Number — 12 characters, usually on the transom. We’ll read the builder, model year and serial from it.',
    makeLabel: 'Builder',
    modelLabel: 'Model',
    makePlaceholder: 'Catalina',
    modelPlaceholder: '30',
    hasLookup: true, // HIN structure → serial + model year; builder via USCG MIC (lib/marine.js)
    guidedCapture: 'full',
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
export const VERTICAL_OPTIONS = [VERTICALS.aviation, VERTICALS.marine, VERTICALS.home]

export function getVertical(key) {
  return VERTICALS[key] ?? null
}

/**
 * Shots for the one-button guided walkthrough, per the vertical's `guidedCapture`:
 *   'full'     → the whole overview shot list (discrete assets: aircraft/boat/car/RV)
 *   'exterior' → just the exterior elevations + roof (homes; rest is freeform)
 *   'off'/none → empty (no guided run)
 * Pure.
 */
export function guidedShots(verticalKey) {
  const cfg = getVertical(verticalKey)
  if (!cfg || cfg.guidedCapture === 'off') return []
  const shots = cfg.overviewShots ?? []
  if (cfg.guidedCapture === 'exterior') {
    return shots.filter((s) => /^(exterior|roof)/i.test(s))
  }
  return cfg.guidedCapture === 'full' ? shots : []
}

/**
 * Validate + normalize an identifier for a vertical. Returns { valid, value, error }.
 * Validation is deliberately lenient (format help, not gatekeeping) — manual entry
 * across verticals, no authoritative resolver wired up yet.
 */
export function validateIdentifier(verticalKey, raw) {
  // Codes (N-number, HIN) normalize to uppercase + no spaces; free-text
  // identifiers (a home address) keep their spaces and case.
  const isCode = verticalKey === 'aviation' || verticalKey === 'marine'
  const value = isCode
    ? String(raw ?? '').trim().toUpperCase().replace(/\s+/g, '')
    : String(raw ?? '').trim()
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
      // Home + any future relaxed vertical: accept any non-empty value.
      return { valid: true, value, error: null }
  }
}
