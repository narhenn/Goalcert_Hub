// AgenticRemoteHost.jsx — hub mount point for the AutoMind Agentic AI remote PAGES.
//
// SKELETON (now): renders a RemoteSlot placeholder against /api/pages/agents/*.
//
// INTEGRATION (Phase T4): federate AutoMind's page components (Agents, Agent
// Builder, Executions, Integrations, Analytics, Reports) here and reconcile its
// own login wall into the hub session. NOTE: the agentic ACTION layer (co-pilot
// dock / AI drawer / "Repair with AI" takeover) stays HUB-NATIVE (AILayer.jsx) —
// it is a cross-cutting overlay, not a page, so it is not federated.
import React from 'react'
import RemoteSlot from './RemoteSlot.jsx'

const REMOTE_URL = import.meta.env.VITE_AGENTIC_REMOTE || ''

// hub route id → agents page key (matches the page contract in page_routes.py)
const PAGE_FOR = { hivemind: 'teamchat', builder: 'builder', teamchat: 'teamchat', chat: 'list' }

export default function AgenticRemoteHost({ route }) {
  const page = PAGE_FOR[route] || 'list'
  return (
    <RemoteSlot
      platform="agents" page={page} accent="#7A5CF0"
      remoteUrl={REMOTE_URL}
      pending="Agentic AI (AutoMind) — integrate (Phase T4)" />
  )
}
