// TwinRemoteHost.jsx — hub mount point for the NextXR Digital Twin remote.
//
// SKELETON (now): renders a RemoteSlot placeholder and exercises the
// /api/pages/twin/* contract.
//
// INTEGRATION (Phase T2 — see TWIN_INTEGRATION_PLAN.md): replace the slot with the
// federated <TwinRoutes/>:
//   • set window.__NXR_API_BASE__ = '/api/twin' before mount
//   • lazy-load nextxrTwin/TwinRoutes + the remote TwinProvider/ToastProvider
//   • wrap in <ToastProvider><TwinProvider><MemoryRouter> and drive its location
//     from `route`; bridge hub twinState.active.tenant ⇄ TwinContext.activeTenant
import React from 'react'
import RemoteSlot from './RemoteSlot.jsx'

const REMOTE_URL = import.meta.env.VITE_TWIN_REMOTE || ''

// hub route id → twin page key (matches the page contract in page_routes.py)
const PAGE_FOR = { twins: 'twins', dashboard: 'dashboard', build: 'build', predict: 'predict' }

export default function TwinRemoteHost({ route }) {
  const page = PAGE_FOR[route] || 'twins'
  return (
    <RemoteSlot
      platform="twin" page={page} accent="#0E9E97"
      remoteUrl={REMOTE_URL}
      pending="Digital Twin (NextXR) — integrate first (Phase T2)" />
  )
}
