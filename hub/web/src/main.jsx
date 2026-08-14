import React from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import './hub.css'
import './personas.css'
import './auth.css'
import App from './App.jsx'
import PublicSite from './public/PublicSite.jsx'
import { RouteProvider, useRoute } from './router.jsx'

// Top-level URL split. The dashboard (App) is the authenticated Integration Hub
// and keeps its own internal in-memory routing; everything else is the public
// products/pricing site. Unknown paths fall back to the public landing.
function Root() {
  const { path } = useRoute()
  const isApp = path === '/dashboard' || path.startsWith('/dashboard/') || path === '/login'
  return isApp ? <App /> : <PublicSite />
}

createRoot(document.getElementById('root')).render(
  <RouteProvider>
    <Root />
  </RouteProvider>,
)
