// Auth context for PreBuy. Wraps the app once (see main.jsx) and exposes the
// current Supabase session/user plus sign-in / sign-up / sign-out helpers.
//
// Email/password only for now (open self-serve signup — see CLAUDE.md). The
// session is restored on load and kept in sync via onAuthStateChange so a
// refresh or a token rotation doesn't log the user out.

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase.js'

const AuthContext = createContext(null)

// Hardcoded founder(s): always a super admin, never removable. Mirrors the same
// constant in the gated edge functions (admin-orgs, admin-ai-cost). Other super
// admins are managed in the dashboard (super_admins table) and resolved via the
// is_super_admin() RPC — which checks the TABLE only, hence the founder OR here.
const SUPER_ADMINS = ['brett@zeftingaviation.com']

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  // `loading` is true until we know whether there's a restored session, so
  // protected routes don't flash the login screen on a hard refresh.
  const [loading, setLoading] = useState(true)
  // DB-managed super-admin flag (the founder list is checked separately).
  const [dbSuperAdmin, setDbSuperAdmin] = useState(false)

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session ?? null)
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next ?? null)
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  // Resolve DB-managed super-admin status whenever the user changes.
  const userId = session?.user?.id ?? null
  useEffect(() => {
    if (!userId) {
      setDbSuperAdmin(false)
      return
    }
    let active = true
    supabase.rpc('is_super_admin').then(
      ({ data }) => active && setDbSuperAdmin(!!data),
      () => active && setDbSuperAdmin(false),
    )
    return () => {
      active = false
    }
  }, [userId])

  const email = session?.user?.email ?? null
  const isSuperAdmin = (email ? SUPER_ADMINS.includes(email.toLowerCase()) : false) || dbSuperAdmin

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      isSuperAdmin,
      signIn: (email, password) =>
        supabase.auth.signInWithPassword({ email, password }),
      signUp: (email, password) => supabase.auth.signUp({ email, password }),
      signOut: () => supabase.auth.signOut(),
      // Sends the reset email; the link lands the user on /reset-password, where
      // supabase-js parses the recovery token and establishes a session.
      sendPasswordReset: (email) =>
        supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        }),
      // Sets a new password for the (recovery- or normally-) authenticated user.
      updatePassword: (password) => supabase.auth.updateUser({ password }),
    }),
    [session, loading, isSuperAdmin],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react/only-export-components -- hook colocated with its provider
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (ctx === null) {
    throw new Error('useAuth must be used within an <AuthProvider>')
  }
  return ctx
}
