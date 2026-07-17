// HiveMindRemoteHost.jsx — mounts HiveMind's pages as a native federated
// remote (no iframe), inside the hub's own shell.
//
// HiveMind federates: Dashboard, The Hive (team brief), Agent Builder, Agents,
// Templates, Agentic, Executions, Integrations, Analytics, Reports.
//
// The co-pilot dock / AI drawer / one-tap actions / Repair-with-AI takeover
// stay HUB-NATIVE (hub/AILayer.jsx, modules/agentic/actions.js).
import React, { Suspense, lazy, useCallback, useEffect } from 'react'
import { authHeaders } from '../../api.js'
import { useAuth } from '../auth.jsx'
import RemoteSlot from './RemoteSlot.jsx'

const REMOTE_URL = import.meta.env.VITE_HIVEMIND_REMOTE || ''

// Configure the remote's runtime hooks BEFORE it loads its client.
if (typeof window !== 'undefined') {
  window.__HM_API_BASE__ = '/api/hivemind'   // data flows through the hub gateway
  window.__HM_AUTH__ = () => authHeaders()    // inject the hub's CSRF header
  window.__HM_HOSTED__ = true                 // suppress its 401 → /login redirect

  // The guided Agent Builder lives on a DIFFERENT upstream surface from the rest of the
  // app, so it needs its own base. HiveMind's per-user API (__HM_API_BASE__ → :8097/api)
  // has no /builder routes at all; the builder is implemented by the /api/v1/builder
  // FACADE, which the gateway exposes at /api/agentbuilder/*.
  //
  // Standalone, the page reached it via a vite proxy to a separate service; through the
  // hub those calls landed on :8097/api/builder/* and 404'd silently — which is why the
  // builder showed no templates and "Create agent" appeared to do nothing.
  window.__HM_BUILDER_BASE__ = '/api/agentbuilder'

  // The Hive brief engine is the HUB's own (server.py /api/hive/*), not HiveMind's.
  window.__HM_HIVE_BASE__ = '/api/hive'
}

// The remote exposes ONE self-contained component (providers + router + routes).
const RemoteHiveMind = lazy(() => import('hivemindAgents/HiveMindRemoteApp'))

// hub route id ⇄ the remote's internal path
const ROUTE_PATH = {
  agents: '/',
  hivemind: '/hive',
  'hive-builder': '/hive-builder',
  templates: '/templates',
  agentic: '/agentic',
  integrations: '/integrations',
  analytics: '/analytics',
  reports: '/reports',
}
const HUB_ROUTE = {
  '/': 'agents',
  '/hive': 'hivemind',
  '/hive-builder': 'hive-builder',
  '/templates': 'templates',
  '/agentic': 'agentic',
  '/integrations': 'integrations',
  '/analytics': 'analytics',
  '/reports': 'reports',
}
const PAGE_FOR = {
  agents: 'list',
  hivemind: 'hive',
  'hive-builder': 'builder',
  templates: 'list',
  agentic: 'list',
  integrations: 'integrations',
  analytics: 'analytics',
  reports: 'reports',
}

// Inject the remote's CSS (Module Federation doesn't do this automatically).
function useRemoteCss(remoteEntryUrl) {
  useEffect(() => {
    if (!remoteEntryUrl) return
    const href = remoteEntryUrl.replace(/remoteEntry\.js(\?.*)?$/, 'style.css')
    if (href === remoteEntryUrl) return
    if (document.querySelector('link[data-hm-remote-css]')) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    link.setAttribute('data-hm-remote-css', '')
    document.head.appendChild(link)
  }, [remoteEntryUrl])
}

class HiveMindBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null } }
  static getDerivedStateFromError(err) { return { err } }
  render() {
    if (this.state.err) {
      return <RemoteSlot platform="hivemind" page={PAGE_FOR[this.props.route] || 'hive'} accent="#7A5CF0"
        remoteUrl={REMOTE_URL}
        pending={`HiveMind remote failed to load — is the frontend built + previewed on :4174? (${String(this.state.err.message || this.state.err)})`} />
    }
    return this.props.children
  }
}

export default function HiveMindRemoteHost({ route, onNav }) {
  useRemoteCss(REMOTE_URL)
  const { user } = useAuth()
  const path = ROUTE_PATH[route] || '/'

  // remote navigated internally → move the hub's sidebar with it
  const handleNavigate = useCallback((p) => {
    const hubRoute = HUB_ROUTE[p]
    if (hubRoute && hubRoute !== route && onNav) onNav(hubRoute)
  }, [route, onNav])

  if (!REMOTE_URL) {
    return <RemoteSlot platform="hivemind" page={PAGE_FOR[route] || 'hive'} accent="#7A5CF0" remoteUrl=""
      pending="HiveMind — set VITE_HIVEMIND_REMOTE to mount the live remote" />
  }

  return (
    <HiveMindBoundary route={route}>
      <Suspense fallback={
        <div className="panel"><div className="panel-header"><div>
          <div className="panel-title">Loading HiveMind…</div>
          <div className="panel-subtitle">fetching the HiveMind remote</div>
        </div></div></div>
      }>
        <RemoteHiveMind
          initialPath={path}
          path={path}
          onNavigate={handleNavigate}
          hubUser={user ? { id: user.id, email: user.email, name: user.fullName } : undefined} />
      </Suspense>
    </HiveMindBoundary>
  )
}
