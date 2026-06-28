// Broker handoff: hand a listing to another shop via a tokenized claim link.
// Creating/listing/revoking a handoff is a normal RLS write by the broker's org.
// Preview + claim are cross-org, so they go through the `claim-listing` edge fn
// (service role) — see supabase/functions/claim-listing.

import { supabase } from './supabase.js'

/** Public claim URL for a handoff token. */
export function handoffUrl(token) {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}/claim/${token}`
}

/** Create a handoff for a listing. Returns { data: handoff, error }. */
export async function createHandoff(listing, { toEmail = null, toShopName = null } = {}, userId) {
  if (!listing?.id) return { data: null, error: new Error('No listing to hand off.') }
  const row = {
    listing_id: listing.id,
    from_org_id: listing.org_id,
    to_email: toEmail?.trim() || null,
    to_shop_name: toShopName?.trim() || null,
  }
  if (userId) row.created_by = userId
  const { data, error } = await supabase
    .from('handoffs')
    .insert(row)
    .select('id, token, to_email, to_shop_name, status, created_at')
    .single()
  return { data, error }
}

/** Existing handoffs for a listing (newest first). */
export async function listHandoffs(listingId) {
  const { data, error } = await supabase
    .from('handoffs')
    .select('id, token, to_email, to_shop_name, status, claimed_at, created_at')
    .eq('listing_id', listingId)
    .order('created_at', { ascending: false })
  return { data: data ?? [], error }
}

/** Revoke a pending handoff (the link stops working). */
export async function revokeHandoff(id) {
  const { error } = await supabase.from('handoffs').update({ status: 'revoked' }).eq('id', id)
  return { error }
}

async function callClaimFn(body) {
  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) return { data: null, error: new Error('You must be signed in.') }
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/claim-listing`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) return { data: null, error: new Error(json.error || `Request failed (${res.status})`) }
    return { data: json, error: null }
  } catch (e) {
    return { data: null, error: e instanceof Error ? e : new Error('Network error') }
  }
}

/** Preview a handoff (the listing summary + originating shop) by token. */
export function previewHandoff(token) {
  return callClaimFn({ token, action: 'preview' })
}

/** Claim a handoff into one of your shops → returns { inspection_id }. */
export function claimHandoff(token, orgId) {
  return callClaimFn({ token, action: 'claim', org_id: orgId })
}
