// readinessState.jsx — Operational Readiness Score context.
//
// One number per user per role (0-100), computed from:
//   LMS completion (30%) + XR sim score (35%) + cert freshness (25%) + incident penalty (10%)
// Every module reads this via useReadiness(). Updated when the frontline flow completes.
import React, { createContext, useContext, useState, useCallback } from 'react'

const ReadinessCtx = createContext(null)

// -- seed scores per domain (mocked until real API) --
const SEED = {
  'edm-machine':    { lms: 88, xr: 74, cert: 90, incidents: 0 },
  'turbine-engine': { lms: 72, xr: 68, cert: 65, incidents: 5 },
  'tram-network':   { lms: 91, xr: 82, cert: 88, incidents: 0 },
  'mrt-line':       { lms: 85, xr: 78, cert: 92, incidents: 0 },
  'ev-network':     { lms: 79, xr: 71, cert: 80, incidents: 3 },
  'hospital':       { lms: 93, xr: 85, cert: 95, incidents: 0 },
  'defence-base':   { lms: 76, xr: 69, cert: 70, incidents: 8 },
  'datacenter':     { lms: 90, xr: 80, cert: 85, incidents: 0 },
  'manufacturing':  { lms: 82, xr: 75, cert: 78, incidents: 2 },
}

function computeScore(b) {
  return Math.round(
    b.lms * 0.30 +
    b.xr  * 0.35 +
    b.cert * 0.25 +
    (100 - b.incidents) * 0.10
  )
}

export function ReadinessProvider({ children, domain }) {
  const seed = SEED[domain] || SEED['edm-machine']
  const [breakdown, setBreakdown] = useState({
    lmsCompletion: seed.lms,
    xrSimScore: seed.xr,
    certFreshness: seed.cert,
    incidentPenalty: seed.incidents,
  })
  const score = computeScore({
    lms: breakdown.lmsCompletion,
    xr: breakdown.xrSimScore,
    cert: breakdown.certFreshness,
    incidents: breakdown.incidentPenalty,
  })

  const update = useCallback((patch) => {
    setBreakdown(prev => ({ ...prev, ...patch }))
  }, [])

  // called when frontline flow completes — boosts XR score + refreshes cert
  const onFlowComplete = useCallback((xrScore) => {
    setBreakdown(prev => ({
      ...prev,
      xrSimScore: Math.min(100, Math.round((prev.xrSimScore + xrScore) / 2)),
      certFreshness: 100, // just certified
    }))
  }, [])

  return (
    <ReadinessCtx.Provider value={{ score, breakdown, update, onFlowComplete }}>
      {children}
    </ReadinessCtx.Provider>
  )
}

export function useReadiness() {
  return useContext(ReadinessCtx) || { score: 0, breakdown: {}, update: () => {}, onFlowComplete: () => {} }
}
