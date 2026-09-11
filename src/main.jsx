import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './lib/auth.jsx'

// Recover from a stale app shell after a deploy. Lazily-imported chunks (pdf-lib,
// heic2any, …) carry hashed filenames that change each build; a browser still
// running the old shell requests an old chunk that no longer exists, the SPA
// fallback (`/* /index.html 200`) serves index.html, and the module loader rejects
// it ("'text/html' is not a valid JavaScript MIME type"). Vite fires
// `vite:preloadError` for that — reload once to fetch the fresh shell. A short
// cooldown prevents a reload loop if a chunk is genuinely missing.
window.addEventListener('vite:preloadError', () => {
  const KEY = 'pb_chunk_reload_at'
  const now = Date.now()
  let last = 0
  try { last = Number(sessionStorage.getItem(KEY)) || 0 } catch { /* private mode */ }
  if (now - last > 10000) {
    try { sessionStorage.setItem(KEY, String(now)) } catch { /* ignore */ }
    window.location.reload()
  }
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
