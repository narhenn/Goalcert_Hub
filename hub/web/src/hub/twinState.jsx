// twinState.jsx — one shared "active twin" across every module surface.
//
// The Overview, Live Dashboard, Scenario engine and the AI co-pilot all read the
// same live twin so a composed product feels like one asset, not four tabs.
//
// serviceMode: 'stub' — runs entirely on the frontend simulator (lib.jsx simTwin).
//              'live' — calls the NextXR backend; falls back to stub if unreachable.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { simTwin, domainMeta } from '../lib.jsx'
import API, { twinTemplateFor } from '../api.js'

const TwinCtx = createContext(null)
// The live telemetry frame lives in its OWN context. It changes every poll/tick
// (1-2×/second); keeping it out of TwinCtx means components that only need the
// stable API (active twin, serviceMode, actions) — the Twins page, the app
// shell, the pickers — don't re-render on every frame. That whole-app re-render
// was the visible "jitter". Only components that actually paint live telemetry
// subscribe via useTwinFrame().
const TwinFrameCtx = createContext(null)

export function TwinProvider({ children }) {
  const [active, setActive] = useState(null)      // { domain, name, tenant? } | null
  const [twin, setTwin] = useState(null)          // simTwin() frame or live state
  const [running, setRunning] = useState(true)
  const [simFault, setSimFault] = useState(null)
  const [serviceMode, setServiceMode] = useState('stub')  // 'stub' | 'live'

  const phase = useRef(0)
  const faultMag = useRef(0)
  const faultRef = useRef(null); faultRef.current = simFault
  const timer = useRef(null)
  const liveTimer = useRef(null)
  const activeTenantRef = useRef(null)

  // Probe the NextXR service — and KEEP probing while it's unreachable. Cloud
  // twin services (Render free tier) sleep when idle: the first probe lands
  // mid-cold-start and fails, and a one-shot probe would lock the hub in SIM
  // mode (hiding every real twin) until a full page reload. Retry until live.
  useEffect(() => {
    let alive = true
    let timer = null
    const probe = () => {
      API.twin.health()
        .then(() => { if (alive) setServiceMode('live') })
        .catch(() => { if (alive) timer = setTimeout(probe, 15000) })
    }
    probe()
    return () => { alive = false; if (timer) clearTimeout(timer) }
  }, [])

  // reset the sim ramp whenever the active twin changes
  useEffect(() => {
    phase.current = 0; faultMag.current = 0
    if (active) setTwin(simTwin(active.domain, 0))
    else setTwin(null)
  }, [active])

  // stub ticker — drifts signals, ramps an injected fault in/out
  useEffect(() => {
    if (timer.current) clearInterval(timer.current)
    if (!active || !running || serviceMode !== 'stub') return
    const tick = () => {
      phase.current = Math.min(1, phase.current + 0.02)
      faultMag.current = Math.max(0, Math.min(1, faultMag.current + (faultRef.current ? 0.15 : -0.3)))
      setTwin(simTwin(active.domain, phase.current, faultRef.current, faultMag.current))
    }
    tick()
    timer.current = setInterval(tick, 1500)
    return () => timer.current && clearInterval(timer.current)
  }, [active, running, serviceMode])

  // live poll — fetches real twin state every 2s when a tenant is attached
  useEffect(() => {
    if (liveTimer.current) clearInterval(liveTimer.current)
    if (!active || !active.tenant || !running || serviceMode !== 'live') return
    const tenant = active.tenant
    const fetchState = async () => {
      try {
        const data = await API.twin.state(tenant)
        setTwin(data)
      } catch {
        // service dropped out mid-session — fall back to stub frame silently
        setTwin(prev => prev || simTwin(active.domain, phase.current, faultRef.current, faultMag.current))
      }
    }
    fetchState()
    liveTimer.current = setInterval(fetchState, 2000)
    return () => liveTimer.current && clearInterval(liveTimer.current)
  }, [active, running, serviceMode])

  // openTwin: in live mode, REUSE an existing twin of this domain if one is
  // already on the service (like the NextXR platform's own library does), else
  // create a fresh tenant. Stub on failure.
  const openTwin = useCallback(async (domain, name) => {
    setSimFault(null); setRunning(true)
    const label = name || domainMeta(domain).label
    if (serviceMode === 'live') {
      try {
        const svcDomain = twinTemplateFor(domain)
        let tenant = null, liveName = label
        try {
          const existing = (await API.twin.list())?.twins?.find(t => t.domain === svcDomain)
          if (existing) { tenant = existing.tenant_id; liveName = existing.name || label }
        } catch { /* list unavailable — fall through to create */ }
        if (!tenant) {
          const res = await API.twin.create(label, domain)
          // The twin service returns { status, twin: { tenant_id } }; some builds
          // also mirror it top-level. Accept every shape so the live tenant (and
          // therefore the 3-D scene + live telemetry) always attaches.
          tenant = res.twin?.tenant_id || res.tenant_id || res.id || res.tenant
        }
        setActive({ domain, name: liveName, tenant })
        activeTenantRef.current = tenant
        // kick off feed on the backend
        API.twin.feedStart(tenant).catch(() => {})
        return
      } catch {
        // NextXR unreachable — fall through to stub
      }
    }
    setActive({ domain, name: label })
    activeTenantRef.current = null
  }, [serviceMode])

  // openExisting: attach to a twin that already exists on the backend (e.g. one
  // just reconstructed by Build a Twin → build-from-plan). No create call.
  const openExisting = useCallback((tenant, domain, name) => {
    setSimFault(null); setRunning(true)
    setActive({ domain: domain || 'manufacturing', name: name || tenant, tenant })
    activeTenantRef.current = tenant
    if (tenant) API.twin.feedStart(tenant).catch(() => {})
  }, [])

  // Stable API — intentionally EXCLUDES `twin`, so this object's identity does
  // not change on every telemetry frame (that was the source of the app-wide
  // jitter). Recomputes only when the active twin, run state, injected fault or
  // service mode change.
  const api = useMemo(() => ({
    active, running, simFault, serviceMode,
    openTwin, openExisting,
    closeTwin: () => {
      setActive(null); setSimFault(null)
      activeTenantRef.current = null
      if (active?.tenant) API.twin.feedStop().catch(() => {})
    },
    toggleRunning: () => setRunning(r => !r),
    setRunning, setSimFault,
    injectFault: (f) => setSimFault(f || null),
  }), [active, running, simFault, serviceMode, openTwin, openExisting])

  // The live frame, isolated in its own provider so only useTwinFrame() readers
  // re-render when it ticks.
  const frame = useMemo(() => ({ twin }), [twin])

  return (
    <TwinCtx.Provider value={api}>
      <TwinFrameCtx.Provider value={frame}>{children}</TwinFrameCtx.Provider>
    </TwinCtx.Provider>
  )
}

export function useTwin() {
  const ctx = useContext(TwinCtx)
  if (!ctx) throw new Error('useTwin must be used within TwinProvider')
  return ctx
}

// Subscribe to the live twin frame only (updates every poll/tick). Separate from
// useTwin so telemetry updates don't re-render components that don't paint them.
export function useTwinFrame() {
  const ctx = useContext(TwinFrameCtx)
  if (!ctx) throw new Error('useTwinFrame must be used within TwinProvider')
  return ctx.twin
}
