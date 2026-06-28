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

// ── Profile schemas (the "spec sheet" half of the report) per vertical ───────
// The profile shape is generic (specs/currency/engines/props/damage/equipment
// bags) but the FIELDS differ entirely by vertical — so a boat shop never sees
// aircraft fields (engines/props OK for boats; airframe times/annual/transponder
// are aviation-only). lib/profile.js builds + normalizes the stored profile from
// the schema's field keys; AircraftProfile + ReportView render from it.
//
//   noun         → "Aircraft" / "Vessel" / "Property"
//   specTitle    → heading for the specifications block
//   specFields   → [{ key, label, suffix?, placeholder? }]
//   hasEngines   → show the engines/props block (aviation + marine; not home)
//   enginesTitle / enginesInfo / engineFields / propFields
//   currencyTitle / currencyInfo / currencyPlaceholder / currencyFields
//   damageTitle / damageInfo / damageColumns
//   equipmentGroups → two buckets (stored as equipment.avionics / .additional),
//                     relabeled per vertical
//   canScan      → the (aviation-only, for now) "Scan to pre-fill" vision flow
const PROFILE_SCHEMAS = {
  aviation: {
    noun: 'Aircraft',
    canScan: true,
    specTitle: 'Airframe — specifications & times',
    specFields: [
      { key: 'total_time', label: 'Total time', suffix: ' hrs', placeholder: '4200' },
      { key: 'mgtow', label: 'Max gross weight', suffix: ' lbs', placeholder: '3650' },
      { key: 'empty_weight', label: 'Empty weight', suffix: ' lbs', placeholder: '2350' },
      { key: 'useful_load', label: 'Useful load', suffix: ' lbs', placeholder: '1300' },
      { key: 'fuel_capacity', label: 'Fuel capacity', suffix: ' gal', placeholder: '80' },
    ],
    hasEngines: true,
    enginesTitle: 'Engines & propellers',
    enginesInfo: 'Single or multi-engine. Convention: #1 is the left engine, #2 the right. Push-pull centerline twins (e.g. Cessna 337) are #1 front / #2 rear.',
    engineFields: [
      { key: 'smoh', label: 'SMOH', suffix: ' hrs', placeholder: '850' },
      { key: 'notes', label: 'Notes', placeholder: 'RAM to new limits, new cams (2019)' },
    ],
    propFields: [
      { key: 'since', label: 'Since new/OH', suffix: ' hrs', placeholder: '320' },
      { key: 'notes', label: 'Notes', placeholder: 'SNEW, 3-blade (2018)' },
    ],
    currencyTitle: 'Currency & due dates',
    currencyInfo: 'When required inspections/checks come due. Accepts a month (2026-04) or a full date. Overdue and due-soon items are flagged on the report.',
    currencyPlaceholder: '2026-04',
    currencyFields: [
      { key: 'annual_due', label: 'Annual due' },
      { key: 'ifr_pitot_static_due', label: 'IFR pitot/static (91.411)' },
      { key: 'transponder_due', label: 'Transponder (91.413)' },
      { key: 'elt_battery_due', label: 'ELT battery' },
      { key: 'o2_hydro_due', label: 'O₂ bottle hydro' },
    ],
    damageTitle: 'Damage history',
    damageInfo: 'Brokers always state damage explicitly: what happened, when, and what was / was not affected. Leave empty for a clean "no damage history" callout.',
    damageColumns: [
      { key: 'date', label: 'Date', placeholder: '2018-06', width: 'narrow' },
      { key: 'summary', label: 'What happened', placeholder: 'Bird strike to RH cowl nose' },
      { key: 'affected', label: 'Affected / not affected', placeholder: 'Cowl replaced; prop & engine not impacted' },
    ],
    equipmentGroups: [
      { key: 'avionics', title: 'Avionics', info: 'GPS/nav/comm, autopilot + modes, audio panel, transponder/ADS-B, engine monitor, radar, stormscope… Add a condition note where relevant.', itemPlaceholder: 'Garmin GTN 750Xi', notesPlaceholder: 'WAAS, current databases', addLabel: 'Add avionics item' },
      { key: 'additional', title: 'Additional equipment', info: 'Non-avionics extras: FIKI/known-ice, GAMIjectors, oxygen, air conditioning, winglets/VGs, long-range fuel, useful-load mods…', itemPlaceholder: 'TKS known-ice (FIKI)', notesPlaceholder: 'Full system, recently serviced', addLabel: 'Add equipment item' },
    ],
  },
  marine: {
    noun: 'Vessel',
    canScan: false,
    specTitle: 'Vessel — specifications',
    specFields: [
      { key: 'loa', label: 'Length overall (LOA)', suffix: ' ft', placeholder: '35' },
      { key: 'beam', label: 'Beam', suffix: ' ft', placeholder: '12' },
      { key: 'draft', label: 'Draft', suffix: ' ft', placeholder: '4' },
      { key: 'displacement', label: 'Displacement', suffix: ' lbs', placeholder: '15000' },
      { key: 'fuel_capacity', label: 'Fuel capacity', suffix: ' gal', placeholder: '120' },
      { key: 'water_capacity', label: 'Fresh water', suffix: ' gal', placeholder: '60' },
    ],
    hasEngines: true,
    enginesTitle: 'Engines & drives',
    enginesInfo: 'Single or twin. Convention: #1 is the port (left) engine, #2 the starboard (right).',
    engineFields: [
      { key: 'hours', label: 'Hours', suffix: ' hrs', placeholder: '1200' },
      { key: 'notes', label: 'Notes', placeholder: 'Yanmar 4JH, serviced 2024' },
    ],
    propFields: [
      { key: 'notes', label: 'Notes', placeholder: '3-blade bronze; drive/outdrive condition' },
    ],
    currencyTitle: 'Documentation & service',
    currencyInfo: 'Registration/documentation expiry and key service dates. Accepts a month (2026-04) or a full date. Overdue and due-soon items are flagged on the report.',
    currencyPlaceholder: '2026-04',
    currencyFields: [
      { key: 'documentation_due', label: 'USCG documentation / registration' },
      { key: 'insurance_survey_due', label: 'Insurance survey due' },
      { key: 'last_haul_out', label: 'Last haul-out / bottom paint' },
      { key: 'thru_hull_service', label: 'Thru-hull / seacock service' },
    ],
    damageTitle: 'Damage / grounding history',
    damageInfo: 'State any grounding, collision, flooding or major repair: what happened, when, and what was / was not affected. Leave empty for a clean "no damage history" callout.',
    damageColumns: [
      { key: 'date', label: 'Date', placeholder: '2019-08', width: 'narrow' },
      { key: 'summary', label: 'What happened', placeholder: 'Light grounding, soft' },
      { key: 'affected', label: 'Affected / not affected', placeholder: 'Keel inspected, no structural damage' },
    ],
    equipmentGroups: [
      { key: 'avionics', title: 'Electronics & navigation', info: 'Chartplotter/GPS, radar, AIS, autopilot, VHF/SSB, depth/fishfinder, instruments. Add a condition note where relevant.', itemPlaceholder: 'Garmin GPSMAP chartplotter', notesPlaceholder: 'Radar + AIS, 2022', addLabel: 'Add electronics item' },
      { key: 'additional', title: 'Gear & systems', info: 'Ground tackle/windlass, bow thruster, generator, watermaker, dinghy/davits, canvas, sails/rigging, A/C & heat…', itemPlaceholder: 'Bow thruster', notesPlaceholder: 'Serviced 2024', addLabel: 'Add gear item' },
    ],
  },
  home: {
    noun: 'Property',
    canScan: false,
    specTitle: 'Property — details',
    specFields: [
      { key: 'square_footage', label: 'Square footage', suffix: ' sq ft', placeholder: '2200' },
      { key: 'year_built', label: 'Year built', placeholder: '1998' },
      { key: 'bedrooms', label: 'Bedrooms', placeholder: '4' },
      { key: 'bathrooms', label: 'Bathrooms', placeholder: '2.5' },
      { key: 'stories', label: 'Stories', placeholder: '2' },
      { key: 'lot_size', label: 'Lot size', placeholder: '0.25 ac' },
      { key: 'garage', label: 'Garage', placeholder: '2-car attached' },
    ],
    hasEngines: false,
    currencyTitle: 'System ages & key dates',
    currencyInfo: 'Approximate ages or last-replaced dates of major systems. Enter a year (2015) or an age ("8 yrs").',
    currencyPlaceholder: 'e.g. 2015 or 8 yrs',
    currencyFields: [
      { key: 'roof_age', label: 'Roof — age / replaced' },
      { key: 'hvac_age', label: 'HVAC — age' },
      { key: 'water_heater_age', label: 'Water heater — age' },
      { key: 'electrical_panel', label: 'Electrical panel — age / type' },
    ],
    damageTitle: 'Known issues / history',
    damageInfo: 'Prior damage, repairs, or known defects: what, where, and how it was resolved. Leave empty for a clean callout.',
    damageColumns: [
      { key: 'date', label: 'Date', placeholder: '2021', width: 'narrow' },
      { key: 'summary', label: 'What / where', placeholder: 'Water intrusion, NE corner of basement' },
      { key: 'affected', label: 'Notes / resolution', placeholder: 'Regraded + sealed; dry since' },
    ],
    equipmentGroups: [
      { key: 'avionics', title: 'Systems', info: 'Heating/cooling, water heater, electrical service, plumbing type, well/septic, sump, solar…', itemPlaceholder: 'Gas furnace', notesPlaceholder: '2015, serviced annually', addLabel: 'Add system' },
      { key: 'additional', title: 'Appliances & features', info: 'Included appliances, fireplace, deck/patio, pool/spa, irrigation, security…', itemPlaceholder: 'Dishwasher', notesPlaceholder: 'Included, ~3 yrs', addLabel: 'Add item' },
    ],
  },
}

/** Profile schema (field sets + labels) for a vertical. Falls back to aviation. */
export function profileSchema(verticalKey) {
  return PROFILE_SCHEMAS[verticalKey] ?? PROFILE_SCHEMAS.aviation
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
