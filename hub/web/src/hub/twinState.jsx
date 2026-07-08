// twinState.jsx — one shared "active twin" across every module surface.
//
// The Overview, Live Dashboard, Scenario engine and the AI co-pilot all read the
// same live twin so a composed product feels like one asset, not four tabs. Runs
// entirely in the browser on the frontend simulator (lib.jsx simTwin) — no backend.
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { simTwin, domainMeta } from '../lib.jsx'

const TwinCtx = createContext(null)

export function TwinProvider({ children }) {
  const [active, setActive] = useState(null)      // { domain, name } | null
  const [twin, setTwin] = useState(null)          // simTwin() frame
  const [running, setRunning] = useState(true)
  const [simFault, setSimFault] = useState(null)

  const phase = useRef(0)
  const faultMag = useRef(0)
  const faultRef = useRef(null); faultRef.current = simFault
  const timer = useRef(null)

  // reset the sim ramp whenever the active twin changes
  useEffect(() => {
    phase.current = 0; faultMag.current = 0
    if (active) setTwin(simTwin(active.domain, 0))
    else setTwin(null)
  }, [active])

  // the live ticker — drifts signals, ramps an injected fault in/out
  useEffect(() => {
    if (timer.current) clearInterval(timer.current)
    if (!active || !running) return
    const tick = () => {
      phase.current = Math.min(1, phase.current + 0.02)
      faultMag.current = Math.max(0, Math.min(1, faultMag.current + (faultRef.current ? 0.15 : -0.3)))
      setTwin(simTwin(active.domain, phase.current, faultRef.current, faultMag.current))
    }
    tick()
    timer.current = setInterval(tick, 1500)
    return () => timer.current && clearInterval(timer.current)
  }, [active, running])

  const api = useMemo(() => ({
    active, twin, running, simFault,
    openTwin: (domain, name) => { setSimFault(null); setRunning(true); setActive({ domain, name: name || domainMeta(domain).label }) },
    closeTwin: () => { setActive(null); setSimFault(null) },
    toggleRunning: () => setRunning(r => !r),
    setRunning, setSimFault,
    injectFault: (f) => setSimFault(f || null),
  }), [active, twin, running, simFault])

  return <TwinCtx.Provider value={api}>{children}</TwinCtx.Provider>
}

export function useTwin() {
  const ctx = useContext(TwinCtx)
  if (!ctx) throw new Error('useTwin must be used within TwinProvider')
  return ctx
}
