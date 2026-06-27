import { Routes, Route } from 'react-router-dom'
import Home from './pages/Home.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import CreateShop from './pages/CreateShop.jsx'
import Help from './pages/Help.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import './App.css'

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/help" element={<Help />} />
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
    </Routes>
  )
}

export default App
