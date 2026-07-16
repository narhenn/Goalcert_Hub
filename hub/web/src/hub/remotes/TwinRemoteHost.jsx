// TwinRemoteHost.jsx — mounts the NextXR Digital Twin as a NATIVE federated
// remote (no iframe). It renders the remote's self-contained <TwinRemoteApp/>
// inside the hub's own shell and routes all its data through the hub gateway
// (/api/twin/* → auth + entitlement + server-side key → NextXR's real backend).
// If the remote can't load, it degrades to the RemoteSlot instead of crashing.
//
// Two bridges keep the hub and the remote in one mental model:
//   • router  — hub sidebar ⇄ the remote's internal react-router
//   • twin    — the twin opened in the remote ⇒ the hub's own twinState, so the
//               topbar health chip / overview / agentic layer track it too.
import React, { Suspense, lazy, useCallback, useEffect } from 'react'
import { authHeaders } from '../../api.js'
import { useTwin } from '../twinState.jsx'
import RemoteSlot from './RemoteSlot.jsx'

const REMOTE_URL = import.meta.env.VITE_TWIN_REMOTE || ''

// Configure the remote's runtime hooks BEFORE it loads its client.
if (typeof window !== 'undefined') {
  window.__NXR_API_BASE__ = '/api/twin'         // its data flows through the hub gateway
  window.__NXR_AUTH__ = () => authHeaders()      // inject the hub's auth on every call
}

// The remote exposes ONE self-contained component (providers + router + routes).
const RemoteTwin = lazy(() => import('nextxrTwin/TwinRemoteApp'))

// hub route id ⇄ the remote's internal path
const ROUTE_PATH = { twins: '/twins', dashboard: '/', build: '/build', predict: '/predict' }
const HUB_ROUTE = { '/twins': 'twins', '/': 'dashboard', '/build': 'build', '/predict': 'predict' }
const PAGE_FOR = { twins: 'twins', dashboard: 'dashboard', build: 'build', predict: 'predict' }

// Module Federation does NOT inject a remote's CSS into the host. The remote
// emits a stable assets/style.css beside remoteEntry.js (and is built with an
// absolute base), so derive the href from the remote URL and link it once.
function useRemoteCss(remoteEntryUrl) {
  useEffect(() => {
    if (!remoteEntryUrl) return
    const href = remoteEntryUrl.replace(/remoteEntry\.js(\?.*)?$/, 'style.css')
    if (href === remoteEntryUrl) return
    if (document.querySelector('link[data-nxr-remote-css]')) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    link.setAttribute('data-nxr-remote-css', '')
    document.head.appendChild(link)
  }, [remoteEntryUrl])
}

// If the remote fails to load, fall back to the skeleton slot instead of crashing.
class TwinBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null } }
  static getDerivedStateFromError(err) { return { err } }
  render() {
    if (this.state.err) {
      return <RemoteSlot platform="twin" page={PAGE_FOR[this.props.route] || 'twins'} accent="#0E9E97"
        remoteUrl={REMOTE_URL}
        pending={`Digital Twin remote failed to load — is NextXR built + running on :8080? (${String(this.state.err.message || this.state.err)})`} />
    }
    return this.props.children
  }
}

export default function TwinRemoteHost({ route, onNav }) {
  useRemoteCss(REMOTE_URL)
  const { openExisting } = useTwin()
  const path = ROUTE_PATH[route] || '/twins'

  // remote navigated internally (e.g. Twins → Open) → move the hub's sidebar with it
  const handleNavigate = useCallback((p) => {
    const hubRoute = HUB_ROUTE[p]
    if (hubRoute && hubRoute !== route && onNav) onNav(hubRoute)
  }, [route, onNav])

  // remote's active twin changed → mirror it into the hub's twinState
  const handleTwinChange = useCallback((t) => {
    if (t?.tenant_id) openExisting(t.tenant_id, t.domain, t.name)
  }, [openExisting])

  // Not configured → show the skeleton slot (no load attempt).
  if (!REMOTE_URL) {
    return <RemoteSlot platform="twin" page={PAGE_FOR[route] || 'twins'} accent="#0E9E97" remoteUrl=""
      pending="Digital Twin (NextXR) — set VITE_TWIN_REMOTE to mount the live remote" />
  }

  return (
    <TwinBoundary route={route}>
      <Suspense fallback={
        <div className="panel"><div className="panel-header"><div>
          <div className="panel-title">Loading Digital Twin…</div>
          <div className="panel-subtitle">fetching the NextXR remote</div>
        </div></div></div>
      }>
        {/* no key → the remote stays mounted; `path` drives its router instead */}
        <RemoteTwin
          initialPath={path}
          path={path}
          onNavigate={handleNavigate}
          onTwinChange={handleTwinChange} />
      </Suspense>
    </TwinBoundary>
  )
}
