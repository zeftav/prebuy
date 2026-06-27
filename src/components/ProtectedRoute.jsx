// Route gate: requires a logged-in session. While the session is still being
// restored we render nothing (avoids a login-screen flash on refresh); once
// known, either render the children or bounce to /login, preserving where the
// user was headed so we can send them back after they sign in.

import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth.jsx'

export default function ProtectedRoute({ children }) {
  const { session, loading } = useAuth()
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

  return children
}
