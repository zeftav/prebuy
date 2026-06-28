// Route gate for the platform-owner ("super admin") dashboard. Requires a session
// AND super-admin status. Non-super-admins are bounced to /app (not /login — they
// are signed in, just not platform owners). The DB super-admin flag resolves
// async, so we wait for the session to settle before deciding.

import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'

export default function SuperAdminRoute({ children }) {
  const { session, loading, isSuperAdmin } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <main className="auth-pending" aria-busy="true">
        <p>Loading…</p>
      </main>
    )
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (!isSuperAdmin) {
    return <Navigate to="/app" replace />
  }

  return children
}
