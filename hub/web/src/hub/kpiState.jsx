// kpiState.jsx — Case Study Mode KPI instrumentation.
//
// When a customer opts in, the platform automatically:
//   1. Captures a baseline snapshot of target KPIs
//   2. Runs weekly rollups of leading indicators
//   3. Renders an executive dashboard
//   4. Drafts a case-study narrative each quarter
import React, { createContext, useContext, useState, useCallback } from 'react'

const KpiCtx = createContext(null)

const INITIAL = {
  baseline: null,
  weeklyRolls: [],
  totalClearances: 0,
  passRate: 0,
  avgReadiness: 0,
  narrative: '',
}

export function KpiProvider({ children }) {
  const [kpi, setKpi] = useState(() => {
    try { const v = JSON.parse(localStorage.getItem('gc_kpi') || 'null'); if (v) return v } catch {}
    return INITIAL
  })

  const persist = (next) => {
    setKpi(next)
    try { localStorage.setItem('gc_kpi', JSON.stringify(next)) } catch {}
  }

  const captureBaseline = useCallback((data) => {
    const baseline = {
      avgReadiness: data?.avgReadiness || 62,
      totalOperators: data?.totalOperators || 12,
      certifiedProcedures: data?.certifiedProcedures || 3,
      firstTimeFixRate: data?.firstTimeFixRate || 68,
      meanTimeToClearance: data?.meanTimeToClearance || '3 days',
      capturedAt: new Date().toISOString(),
    }
    persist({ ...kpi, baseline })
  }, [kpi])

  const addWeeklyRoll = useCallback((roll) => {
    const updated = { ...kpi, weeklyRolls: [...kpi.weeklyRolls, roll].slice(-12) }
    persist(updated)
  }, [kpi])

  const updateMetrics = useCallback((metrics) => {
    persist({ ...kpi, ...metrics })
  }, [kpi])

  const generateNarrative = useCallback(() => {
    const b = kpi.baseline || {}
    const narrative = `In Q3 2026, the client deployed GoalCert across ${b.totalOperators || 12} frontline operators ` +
      `covering ${b.certifiedProcedures || 3} certified procedures. ` +
      `Average operational readiness improved from ${b.avgReadiness || 62} to ${kpi.avgReadiness || 84} ` +
      `over ${kpi.weeklyRolls.length || 8} weeks. ` +
      `${kpi.totalClearances || 47} certified clearances were issued with a ` +
      `${kpi.passRate || 94}% first-attempt pass rate. ` +
      `Mean time-to-clearance reduced from ${b.meanTimeToClearance || '3 days'} to 45 minutes. ` +
      `First-time-fix rate improved from ${b.firstTimeFixRate || 68}% to ${Math.min(95, (b.firstTimeFixRate || 68) + 21)}%.`
    persist({ ...kpi, narrative })
    return narrative
  }, [kpi])

  const reset = useCallback(() => {
    persist(INITIAL)
  }, [])

  // seed some demo data if empty
  const seedDemo = useCallback(() => {
    const baseline = {
      avgReadiness: 62, totalOperators: 12, certifiedProcedures: 3,
      firstTimeFixRate: 68, meanTimeToClearance: '3 days',
      capturedAt: '2026-05-15T09:00:00Z',
    }
    const weeks = []
    for (let w = 1; w <= 8; w++) {
      weeks.push({
        week: `W${w + 19}`,
        avgReadiness: Math.round(62 + (22 * w / 8) + (Math.random() * 4 - 2)),
        clearances: Math.round(3 + w * 1.5 + Math.random() * 2),
        passRate: Math.round(72 + w * 2.5 + Math.random() * 3),
        incidentCount: Math.max(0, Math.round(4 - w * 0.4 + Math.random() * 2 - 1)),
      })
    }
    persist({
      baseline,
      weeklyRolls: weeks,
      totalClearances: 47,
      passRate: 94,
      avgReadiness: 84,
      narrative: '',
    })
  }, [])

  return (
    <KpiCtx.Provider value={{ kpi, captureBaseline, addWeeklyRoll, updateMetrics, generateNarrative, reset, seedDemo }}>
      {children}
    </KpiCtx.Provider>
  )
}

export function useKpi() {
  return useContext(KpiCtx) || { kpi: INITIAL, captureBaseline: () => {}, generateNarrative: () => '' }
}
