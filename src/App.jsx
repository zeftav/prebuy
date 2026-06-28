import { Routes, Route, useLocation } from 'react-router-dom'
import AppFooter from './components/AppFooter.jsx'
import Home from './pages/Home.jsx'
import Login from './pages/Login.jsx'
import ForgotPassword from './pages/ForgotPassword.jsx'
import ResetPassword from './pages/ResetPassword.jsx'
import Dashboard from './pages/Dashboard.jsx'
import CreateShop from './pages/CreateShop.jsx'
import NewInspection from './pages/NewInspection.jsx'
import InspectionDetail from './pages/InspectionDetail.jsx'
import OverviewCapture from './pages/OverviewCapture.jsx'
import AircraftProfile from './pages/AircraftProfile.jsx'
import LogbookAudit from './pages/LogbookAudit.jsx'
import ClaimListing from './pages/ClaimListing.jsx'
import ReportView from './pages/ReportView.jsx'
import Help from './pages/Help.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import './App.css'

function App() {
  // The public customer report is standalone — no in-app chrome/footer.
  const location = useLocation()
  const showFooter = !location.pathname.startsWith('/r/')

  return (
    <>
      <div className="app__content">
        <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/forgot" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/help" element={<Help />} />
          <Route path="/r/:token" element={<ReportView />} />
      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/create-shop"
        element={
          <ProtectedRoute>
            <CreateShop />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/inspections/new"
        element={
          <ProtectedRoute>
            <NewInspection />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/inspections/:id"
        element={
          <ProtectedRoute>
            <InspectionDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/inspections/:id/overview"
        element={
          <ProtectedRoute>
            <OverviewCapture />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/inspections/:id/profile"
        element={
          <ProtectedRoute>
            <AircraftProfile />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/inspections/:id/logbooks"
        element={
          <ProtectedRoute>
            <LogbookAudit />
          </ProtectedRoute>
        }
      />
      <Route
        path="/claim/:token"
        element={
          <ProtectedRoute>
            <ClaimListing />
          </ProtectedRoute>
        }
      />
        </Routes>
      </div>
      {showFooter && <AppFooter />}
    </>
  )
}

export default App
