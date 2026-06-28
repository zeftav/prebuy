// Client for the `structure-finding` edge function (Claude). Sends a raw
// dictation transcript and gets back a clean, customer-facing finding plus a
// suggested severity/status. JWT ON on the function, so we pass the user's token.

import { supabase } from './supabase.js'

/**
 * Structure a dictated note into a finding via the edge function.
 * @returns {Promise<{data: {finding, severity, suggested_status}|null, error: Error|null}>}
 */
export async function structureFinding(transcript, itemTitle, orgId) {
  const text = String(transcript ?? '').trim()
  if (!text) return { data: null, error: new Error('Dictate or type a note first.') }

  const { data: sessionData } = await supabase.auth.getSession()
  const token = sessionData.session?.access_token
  if (!token) return { data: null, error: new Error('You must be signed in.') }

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/structure-finding`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ transcript: text, item: itemTitle || '', org_id: orgId || null }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { data: null, error: new Error(body.error || `Request failed (${res.status})`) }
    }
    return { data: body, error: null }
  } catch (e) {
    return { data: null, error: e instanceof Error ? e : new Error('Network error') }
  }
}
