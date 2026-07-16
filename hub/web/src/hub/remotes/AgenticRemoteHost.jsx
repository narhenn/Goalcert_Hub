// AgenticRemoteHost.jsx — mounts the AUTOMIND Agentic AI PAGES as a NATIVE
// federated remote (no iframe), inside the hub's own shell.
//
// SCOPE — only Class A of the three-way split (see AGENTIC_INTEGRATION_PLAN.md):
//   • Class A (here)   — AUTOMIND's real pages, federated. Data flows through the
//                        gateway at /api/automind/* → AUTOMIND's per-user app API,
//                        authenticated by the X-Goalcert-User identity the gateway
//                        injects (the hub's HttpOnly session cookie rides along).
//   • Class B (NOT here) — the co-pilot dock / AI drawer / one-tap actions /
//                        Repair-with-AI takeover stay HUB-NATIVE (hub/AILayer.jsx,
//                        modules/agentic/actions.js) and just call /api/agents/run.
//   • Class C (NOT here) — headless capabilities (scenario authoring, content
//                        drafting, twin narration) — gateway facade only, no UI.
import React, { Suspense, lazy, useCallback, useEffect } from 'react'
import { authHeaders } from '../../api.js'
import { useAuth } from '../auth.jsx'
import RemoteSlot from './RemoteSlot.jsx'

const REMOTE_URL = import.meta.env.VITE_AGENTS_REMOTE || ''

// Configure the remote's runtime hooks BEFORE it loads its client.
if (typeof window !== 'undefined') {
  window.__AM_API_BASE__ = '/api/automind'   // its data flows through the hub gateway
  window.__AM_AUTH__ = () => authHeaders()    // inject the hub's CSRF header
  window.__AM_HOSTED__ = true                 // suppress its 401 → /login redirect
}

// The remote exposes ONE self-contained component (providers + router + routes).
const RemoteAgents = lazy(() => import('automindAgents/AutomindRemoteApp'))

// hub route id ⇄ the remote's internal path. Only the STATIC pages map; the
// remote's dynamic routes (/agents/:id, /agents/:id/builder, /executions/:id) are
// reached by navigating inside the remote and have no hub sidebar equivalent.
const ROUTE_PATH = {
  agents: '/', templates: '/templates', agentic: '/agentic',
  integrations: '/integrations', analytics: '/analytics', reports: '/reports',
}
const HUB_ROUTE = {
  '/': 'agents', '/templates': 'templates', '/agentic': 'agentic',
  '/integrations': 'integrations', '/analytics': 'analytics', '/reports': 'reports',
}
const PAGE_FOR = {
  agents: 'list', templates: 'list', agentic: 'list',
  integrations: 'integrations', analytics: 'analytics', reports: 'reports',
}

// Module Federation does NOT inject a remote's CSS into the host. The remote emits
// a stable assets/style.css beside remoteEntry.js (built with an absolute base and
// with Tailwind preflight OFF so it can't reset the hub's chrome).
function useRemoteCss(remoteEntryUrl) {
  useEffect(() => {
    if (!remoteEntryUrl) return
    const href = remoteEntryUrl.replace(/remoteEntry\.js(\?.*)?$/, 'style.css')
    if (href === remoteEntryUrl) return
    if (document.querySelector('link[data-am-remote-css]')) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    link.setAttribute('data-am-remote-css', '')
    document.head.appendChild(link)
  }, [remoteEntryUrl])
}

class AgentsBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null } }
  static getDerivedStateFromError(err) { return { err } }
  render() {
    if (this.state.err) {
      return <RemoteSlot platform="agents" page={PAGE_FOR[this.props.route] || 'list'} accent="#7A5CF0"
        remoteUrl={REMOTE_URL}
        pending={`Agentic remote failed to load — is AUTOMIND's frontend built + previewed on :4174? (${String(this.state.err.message || this.state.err)})`} />
    }
    return this.props.children
  }
}

export default function AgenticRemoteHost({ route, onNav }) {
  useRemoteCss(REMOTE_URL)
  const { user } = useAuth()
  const path = ROUTE_PATH[route] || '/'

  // remote navigated internally → move the hub's sidebar with it
  const handleNavigate = useCallback((p) => {
    const hubRoute = HUB_ROUTE[p]
    if (hubRoute && hubRoute !== route && onNav) onNav(hubRoute)
  }, [route, onNav])

  if (!REMOTE_URL) {
    return <RemoteSlot platform="agents" page={PAGE_FOR[route] || 'list'} accent="#7A5CF0" remoteUrl=""
      pending="Agentic AI (AUTOMIND) — set VITE_AGENTS_REMOTE to mount the live remote" />
  }

  return (
    <AgentsBoundary route={route}>
      <Suspense fallback={
        <div className="panel"><div className="panel-header"><div>
          <div className="panel-title">Loading Agentic AI…</div>
          <div className="panel-subtitle">fetching the AUTOMIND remote</div>
        </div></div></div>
      }>
        {/* no key → the remote stays mounted; `path` drives its router instead */}
        <RemoteAgents
          initialPath={path}
          path={path}
          onNavigate={handleNavigate}
          hubUser={user ? { id: user.id, email: user.email, name: user.fullName } : undefined} />
      </Suspense>
    </AgentsBoundary>
  )
}
