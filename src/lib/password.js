// Shared password rules. One source of truth so signup and reset agree on the
// minimum (Supabase Auth's default is 6). Pure, so it's unit tested.

export const PASSWORD_MIN = 6

/** Validate a new password. Returns { valid, error }. */
export function validatePassword(raw) {
  const value = String(raw ?? '')
  if (value.length < PASSWORD_MIN) {
    return { valid: false, error: `Use at least ${PASSWORD_MIN} characters.` }
  }
  return { valid: true, error: null }
}

/** Do the two entries match (and are non-empty)? For the confirm-password field. */
export function passwordsMatch(a, b) {
  return String(a ?? '').length > 0 && String(a ?? '') === String(b ?? '')
}
