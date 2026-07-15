// twinState.jsx — one shared "active twin" across every module surface.
//
// The Overview, Live Dashboard, Scenario engine and the AI co-pilot all read the
// same live twin so a composed product feels like one asset, not four tabs.
//
// serviceMode: 'stub' — runs entirely on the frontend simulator (lib.jsx simTwin).
//              'live' — calls the NextXR backend; falls back to stub if unreachable.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { simTwin, domainMeta } from '../lib.jsx'
import API from '../api.js'

const TwinCtx = createContext(null)

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

  // probe the NextXR service on mount — sets the mode once
  useEffect(() => {
    API.twin.health()
      .then(() => setServiceMode('live'))
      .catch(() => setServiceMode('stub'))
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

  // openTwin: in live mode, create a real tenant via NextXR; stub on failure
  const openTwin = useCallback(async (domain, name) => {
    setSimFault(null); setRunning(true)
    const label = name || domainMeta(domain).label
    if (serviceMode === 'live') {
      try {
        const res = await API.twin.create(label, domain)
        // The twin service returns { status, twin: { tenant_id } }; some builds
        // also mirror it top-level. Accept every shape so the live tenant (and
        // therefore the 3-D scene + live telemetry) always attaches.
        const tenant = res.twin?.tenant_id || res.tenant_id || res.id || res.tenant
        setActive({ domain, name: label, tenant })
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

  const api = useMemo(() => ({
    active, twin, running, simFault, serviceMode,
    openTwin, openExisting,
    closeTwin: () => {
      setActive(null); setSimFault(null)
      activeTenantRef.current = null
      if (active?.tenant) API.twin.feedStop().catch(() => {})
    },
    toggleRunning: () => setRunning(r => !r),
    setRunning, setSimFault,
    injectFault: (f) => setSimFault(f || null),
  }), [active, twin, running, simFault, serviceMode, openTwin, openExisting])

  return <TwinCtx.Provider value={api}>{children}</TwinCtx.Provider>
}

export function useTwin() {
  const ctx = useContext(TwinCtx)
  if (!ctx) throw new Error('useTwin must be used within TwinProvider')
  return ctx
}
