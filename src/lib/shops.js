// Shop (org) helpers. Pure validation/format logic lives here so it can be unit
// tested; the privileged create flow goes through the `signup` edge function
// (service role) because the client can't write `orgs`/`memberships` directly.

import { supabase } from './supabase.js'

export const SHOP_NAME_MIN = 2
export const SHOP_NAME_MAX = 60

// Account type, chosen at signup — drives which experience the shop sees.
export const ACCOUNT_TYPES = [
  { key: 'inspector', label: 'Inspection shop', blurb: 'You perform pre-purchase inspections — guided checklist, findings, and a customer report.' },
  { key: 'broker', label: 'Broker / seller', blurb: 'You list assets for sale — profile, photos and records — and can hand a listing to a shop for inspection.' },
  { key: 'both', label: 'Both', blurb: 'You do both inspections and listings; pick which for each job.' },
]
const ACCOUNT_TYPE_KEYS = ACCOUNT_TYPES.map((t) => t.key)

/** Normalize/validate an account type. Pure. Defaults to 'inspector'. */
export function normalizeOrgType(t) {
  return ACCOUNT_TYPE_KEYS.includes(t) ? t : 'inspector'
}
/** Human label for an account type. Pure. */
export function accountTypeLabel(t) {
  return ACCOUNT_TYPES.find((x) => x.key === normalizeOrgType(t))?.label ?? 'Inspection shop'
}
/** Brokers list only; everyone else inspects. Pure. */
export function isBrokerOnly(t) {
  return normalizeOrgType(t) === 'broker'
}
/** Only "both" shops choose inspection-vs-listing per job. Pure. */
export function showsModePicker(t) {
  return normalizeOrgType(t) === 'both'
}
/** Default job mode for a shop type. Pure. */
export function defaultMode(t) {
  return normalizeOrgType(t) === 'broker' ? 'listing' : 'inspection'
}

/**
 * Validate a shop name from the create-shop form.
 * Returns { valid, value, error } — `value` is trimmed/collapsed whitespace.
 */
export function validateShopName(raw) {
  const value = String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
  if (value.length < SHOP_NAME_MIN) {
    return { valid: false, value, error: `Use at least ${SHOP_NAME_MIN} characters.` }
  }
  if (value.length > SHOP_NAME_MAX) {
    return { valid: false, value, error: `Keep it under ${SHOP_NAME_MAX} characters.` }
  }
  return { valid: true, value, error: null }
}

/**
 * Preview slug for a shop name (lowercase, hyphenated, ascii-ish). The edge
 * function generates the authoritative slug server-side; this is display-only.
 */
export function slugifyShopName(raw) {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Pick the org to land in after login. Owners/admins first, then most-recent;
 * deterministic so the user always re-enters the same shop. Returns null when
 * the user has no memberships yet (→ send them to create-shop).
 */
export function pickActiveOrg(memberships) {
  if (!Array.isArray(memberships) || memberships.length === 0) return null
  const rank = { owner: 0, admin: 1, mechanic: 2 }
  return [...memberships].sort((a, b) => {
    const r = (rank[a.role] ?? 9) - (rank[b.role] ?? 9)
    if (r !== 0) return r
    return String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')) * -1
  })[0]
}

/**
 * Create a shop (org) and make the current user its owner. Calls the `signup`
 * edge function with the user's access token; the function verifies the token
 * with the service role and writes org + owner membership atomically. The shop's
 * `vertical` (what it inspects) is set once here and inherited by its inspections.
 */
export async function createShop(name, vertical = 'aviation', orgType = 'inspector') {
  const { valid, value, error } = validateShopName(name)
  if (!valid) return { data: null, error: new Error(error) }

  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) return { data: null, error: new Error('You must be signed in.') }

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/signup`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name: value, vertical, org_type: normalizeOrgType(orgType) }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { data: null, error: new Error(body.error || `Request failed (${res.status})`) }
    }
    return { data: body.org ?? body, error: null }
  } catch (e) {
    return { data: null, error: e instanceof Error ? e : new Error('Network error') }
  }
}

/** Load the current user's memberships (org_id, role, created_at + org name). */
export async function fetchMemberships() {
  const { data, error } = await supabase
    .from('memberships')
    .select('id, org_id, role, created_at, orgs(name, slug, vertical, org_type)')
  return { data: data ?? [], error }
}
