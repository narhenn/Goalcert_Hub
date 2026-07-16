// ScenarioRemoteHost.jsx — hub mount point for the Scenario Engine remote.
//
// SKELETON (now): renders a RemoteSlot placeholder against /api/pages/scenario/*.
//
// INTEGRATION (Phase T3): the Scenario engine has NO real frontend today (only a
// placeholder HTML). Per PIVOT_PLAN.md we build a real React+Vite Scenario SPA
// first (spec = the old hub modules/simulation panes), deploy it, expose federation
// remotes, then swap this slot for the federated scenario routes.
import React from 'react'
import RemoteSlot from './RemoteSlot.jsx'

const REMOTE_URL = import.meta.env.VITE_SCENARIO_REMOTE || ''

// hub route id → scenario page key (matches the page contract in page_routes.py)
const PAGE_FOR = { scenario: 'catalog', train: 'run' }

export default function ScenarioRemoteHost({ route }) {
  const page = PAGE_FOR[route] || 'catalog'
  return (
    <RemoteSlot
      platform="scenario" page={page} accent="#D07C1E"
      remoteUrl={REMOTE_URL}
      pending="Scenario Engine — build a real frontend first, then federate (Phase T3)" />
  )
}
