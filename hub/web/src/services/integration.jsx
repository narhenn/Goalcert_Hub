// integration.jsx — the live-with-fallback service layer for the three platforms.
//
// Every platform call goes through withFallback(): try the real backend first
// (/api/twin, /api/scenario, /api/agents + the hub's own /api/hive), fall back
// to the built-in simulator when unreachable, and tag the result with its
// source so the UI can show a LIVE / SIM badge. The Admin console reads the
// same probe state as its observability panel. Swapping SIM → LIVE later is a
// backend deployment, not a frontend change.
import React, { useEffect, useState } from 'react'
import { authHeaders } from '../api.js'

export const SERVICES = {
  twin:     { id: 'twin',     label: 'NextXR Digital Twin',    health: '/api/twin/health',     accent: '#0E9E97' },
  scenario: { id: 'scenario', label: 'GoalCert Scenario Engine', health: '/api/scenario/health', accent: '#D07C1E' },
  agents:   { id: 'agents',   label: 'AUTOMIND Agentic AI',    health: '/api/agents/health',   accent: '#7A5CF0' },
  hub:      { id: 'hub',      label: 'Hub LLM Backend',        health: '/api/hive/health',     accent: '#6d28d9' },
}

// module state shared across the app (probed once, subscribable)
let state = Object.fromEntries(Object.keys(SERVICES).map(k =>
  [k, { status: 'unknown', latency: null, checkedAt: null }]))
const listeners = new Set()
let probing = null

function notify() { for (const cb of listeners) cb({ ...state }) }

export async function probeAll() {
  if (probing) return probing
  probing = Promise.allSettled(Object.values(SERVICES).map(async (svc) => {
    const t0 = performance.now()
    try {
      const r = await fetch(svc.health, { headers: authHeaders(), signal: AbortSignal.timeout(3000) })
      state[svc.id] = {
        status: r.ok ? 'live' : 'error',
        latency: Math.round(performance.now() - t0),
        httpStatus: r.status,
        checkedAt: Date.now(),
      }
    } catch {
      state[svc.id] = { status: 'offline', latency: null, checkedAt: Date.now() }
    }
  })).then(() => { probing = null; notify(); return { ...state } })
  return probing
}

export function getServices() { return { ...state } }

// Run a live backend call with a simulator fallback. Skips the network round
// trip entirely when the service is already known-offline (recent probe).
export async function withFallback(serviceId, liveCall, fallback) {
  const svc = state[serviceId]
  const staleMs = 60_000
  const knownOffline = svc?.status === 'offline' && svc.checkedAt && Date.now() - svc.checkedAt < staleMs
  if (!knownOffline) {
    try {
      const data = await liveCall()
      state[serviceId] = { ...state[serviceId], status: 'live', checkedAt: Date.now() }
      notify()
      return { data, source: 'live' }
    } catch {
      state[serviceId] = { ...state[serviceId], status: 'offline', checkedAt: Date.now() }
      notify()
    }
  }
  return { data: await fallback(), source: 'sim' }
}

// React hook: current service map + refresh. Probes once on first mount.
let probedOnce = false
export function useIntegration() {
  const [services, setServices] = useState(getServices)
  useEffect(() => {
    listeners.add(setServices)
    if (!probedOnce) { probedOnce = true; probeAll() }
    return () => listeners.delete(setServices)
  }, [])
  return { services, refresh: probeAll }
}

// LIVE / SIM source badge — every surface that renders platform data shows one.
export function SourceBadge({ source, style }) {
  if (!source) return null
  return (
    <span className={`src-badge ${source}`} style={style}
      title={source === 'live' ? 'Data from the connected backend service' : 'Simulated locally — backend not connected'}>
      <span className="src-dot" />{source === 'live' ? 'LIVE' : 'SIM'}
    </span>
  )
}
