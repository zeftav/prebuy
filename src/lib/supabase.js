import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  // Surfaced loudly in dev so a missing .env doesn't fail silently later.
  console.warn(
    '[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. ' +
      'Copy .env.example to .env and fill in your project values.',
  )
}

// Fall back to syntactically-valid placeholders when env is absent (tests, a
// misconfigured dev shell). Recent @supabase/supabase-js throws on an empty URL
// at import time, which would take down every module that imports this client.
// Production always has real values, so this only affects env-less environments.
export const supabase = createClient(
  url || 'http://localhost:54321',
  anonKey || 'public-anon-key',
)
