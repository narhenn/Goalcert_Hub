// ScenarioRemoteHost.jsx — mounts the Goalcert Scenario Engine as a NATIVE federated
// remote (no iframe), inside the hub's own shell. All its data flows through the hub
// gateway (/api/scenario/* → auth + entitlement + server-side X-API-Key → the engine).
// If the remote can't load, it degrades to the RemoteSlot instead of crashing the hub.
//
// Two bridges keep the hub and the remote in one mental model:
//   • router — hub sidebar ⇄ the remote's internal react-router
//   • domain — the hub's ACTIVE TWIN decides which domain's scenarios are shown.
//              Scenarios are domain-scoped, and in the hub the domain comes from the twin
//              you have open (SCENARIO_INTEGRATION_PLAN.md §0.9). The remote keeps its own
//              picker as an override so every vertical stays reachable without a twin.
//
// TENANCY: nothing to do here. The gateway injects X-Goalcert-Org from the authenticated
// session server-side, and the engine scopes every read/write to it. The browser never
// names its own org — if it could, tenancy would be a suggestion.
import React, { Suspense, lazy, useCallback, useEffect } from 'react'
import { authHeaders } from '../../api.js'
import { useTwin } from '../twinState.jsx'
import RemoteSlot from './RemoteSlot.jsx'

const REMOTE_URL = import.meta.env.VITE_SCENARIO_REMOTE || ''

// Configure the remote's runtime hooks BEFORE it loads its client.
if (typeof window !== 'undefined') {
  window.__SC_API_BASE__ = '/api/scenario'   // its data flows through the hub gateway
  window.__SC_AUTH__ = () => authHeaders()    // inject the hub's CSRF header on every call
}

// The remote exposes ONE self-contained component (providers + router + routes).
const RemoteScenario = lazy(() => import('scenarioEngine/ScenarioRemoteApp'))

// hub route id ⇄ the remote's internal path.
//
// Only the four pages the hub surfaces. The remote also ships Dashboard / War Room /
// Library / Decision for its standalone story — reachable by navigating inside the remote,
// but deliberately absent from the hub's sidebar: the hub has its own Overview and
// portfolio surfaces, and a second dashboard inside a remote would just compete with them.
const ROUTE_PATH = {
  scenario: '/builder',
  simulate: '/simulation',
  train: '/training',
  'scenario-reports': '/reports',
}
const HUB_ROUTE = {
  '/builder': 'scenario',
  '/simulation': 'simulate',
  '/training': 'train',
  '/reports': 'scenario-reports',
}
const PAGE_FOR = { scenario: 'catalog', simulate: 'run', train: 'run', 'scenario-reports': 'reports' }

// Module Federation does NOT inject a remote's CSS into the host. The remote emits a
// stable assets/style.css beside remoteEntry.js — every rule scoped under .sc-root, so it
// cannot restyle the hub's chrome — so derive the href from the remote URL and link once.
function useRemoteCss(remoteEntryUrl) {
  useEffect(() => {
    if (!remoteEntryUrl) return
    const href = remoteEntryUrl.replace(/remoteEntry\.js(\?.*)?$/, 'style.css')
    if (href === remoteEntryUrl) return
    if (document.querySelector('link[data-sc-remote-css]')) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    link.setAttribute('data-sc-remote-css', '')
    document.head.appendChild(link)
  }, [remoteEntryUrl])
}

class ScenarioBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null } }
  static getDerivedStateFromError(err) { return { err } }
  render() {
    if (this.state.err) {
      return <RemoteSlot platform="scenario" page={PAGE_FOR[this.props.route] || 'catalog'} accent="#D07C1E"
        remoteUrl={REMOTE_URL}
        pending={`Scenario remote failed to load — is the engine built (npm run build) + running on :8002? (${String(this.state.err.message || this.state.err)})`} />
    }
    return this.props.children
  }
}

export default function ScenarioRemoteHost({ route, onNav }) {
  useRemoteCss(REMOTE_URL)
  const { active } = useTwin()
  const path = ROUTE_PATH[route] || '/builder'

  // remote navigated internally (Builder → Run Simulation → /simulation) → move the hub's
  // sidebar with it. Without this the sidebar stays on "Scenario Builder" while Simulation
  // shows, and clicking Builder does nothing because the hub thinks it's already there.
  const handleNavigate = useCallback((p) => {
    const hubRoute = HUB_ROUTE[p]
    if (hubRoute && hubRoute !== route && onNav) onNav(hubRoute)
  }, [route, onNav])

  // Not configured → show the skeleton slot (no load attempt).
  if (!REMOTE_URL) {
    return <RemoteSlot platform="scenario" page={PAGE_FOR[route] || 'catalog'} accent="#D07C1E" remoteUrl=""
      pending="Scenario Engine — set VITE_SCENARIO_REMOTE to mount the live remote" />
  }

  return (
    <ScenarioBoundary route={route}>
      <Suspense fallback={
        <div className="panel"><div className="panel-header"><div>
          <div className="panel-title">Loading Scenario Engine…</div>
          <div className="panel-subtitle">fetching the scenario remote</div>
        </div></div></div>
      }>
        {/* no key → the remote stays mounted; `path` drives its router instead */}
        <RemoteScenario
          initialPath={path}
          path={path}
          onNavigate={handleNavigate}
          activeDomain={active?.domain}
          activeTwinName={active?.name} />
      </Suspense>
    </ScenarioBoundary>
  )
}
