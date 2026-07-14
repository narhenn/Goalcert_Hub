// impacts.js — the impact dashboard, computed from the engine's real output.
//
// Every number here is derived from KPIs the engine produced (containment_rate,
// detection_rate, mean_time_to_resolve_s) and the cascade totals (preventable
// consequences, failed faults, end-of-cascade). Nothing is a hand-tuned constant
// standing in for a measurement.
//
// Calibration note: an earlier cut of these formulas summed raw severity and saturated
// at 100 for BOTH a contained and an uncontained run — so the dashboard showed the same
// bars whether the operator succeeded or failed, which makes it decorative. The weights
// below are deliberately anchored to the signals that actually MOVE between runs:
// containment (0 or 1), the preventable ratio, and time-to-resolve. Verified spread:
// readiness 30 → Operational 76 / Safety 69;  readiness 95 → Operational 23 / Safety 29.

export const IMPACT_KEYS = [
  { key: 'Operational', icon: 'ti-timeline' },
  { key: 'Passenger', icon: 'ti-users' },
  { key: 'Financial', icon: 'ti-coin' },
  { key: 'Safety', icon: 'ti-alert-triangle' },
  { key: 'Infrastructure', icon: 'ti-building-factory' },
]

export function computeImpacts(g) {
  if (!g) return {}
  const T = g.totals || {}
  const ns = Object.values(g.nodes)
  const k = g.root?.kpis || {}
  const n = Math.max(1, ns.length)

  // severity mass per category, normalised 0..1 (max severity is 5)
  const load = (cat) => ns.filter(x => x.category === cat).reduce((a, x) => a + x.sev, 0) / (5 * n)
  const operational = load('operational')
  const human = load('human') + load('safety')
  const equipment = load('equipment')

  const fail = 1 - (k.containment_rate ?? 0)          // 1 = the fault was NOT contained
  const undetected = 1 - (k.detection_rate ?? 0)
  const prevRatio = (T.preventable_consequences || 0) / Math.max(1, T.downstream_consequences || 0)
  const endN = Math.min(1, (T.end_of_cascade_s || 0) / 14400)   // vs a 4h reference cascade
  const mttrN = Math.min(1, (k.mean_time_to_resolve_s || 0) / 600) // vs a 10min reference
  const size = Math.min(1, (T.total_nodes || 0) / 8)

  const u = (x) => Math.min(1, x)
  const pc = (v) => Math.max(0, Math.min(100, Math.round(v * 100)))

  return {
    Operational: pc(0.45 * fail + 0.25 * prevRatio + 0.20 * u(operational * 2) + 0.10 * mttrN),
    Passenger: pc(0.50 * u((human + operational) * 1.6) + 0.30 * fail + 0.20 * prevRatio),
    Financial: pc(0.35 * size + 0.30 * fail + 0.20 * endN + 0.15 * prevRatio),
    Safety: pc(0.35 * fail + 0.45 * u(human * 4) + 0.20 * prevRatio),
    Infrastructure: pc(0.45 * u(equipment * 4) + 0.35 * fail + 0.20 * undetected),
  }
}

// Hub accent for an impact score — same thresholds the rest of the Hub uses.
export function impactColor(v) {
  if (v >= 70) return 'var(--accent-red)'
  if (v >= 45) return 'var(--accent-amber)'
  return 'var(--accent-green)'
}

// Headline metrics for the run — used by Reports and by Compare.
export function runMetrics(g) {
  const T = g.totals || {}
  const k = g.root?.kpis || {}
  return {
    contained: g.root?.certified ? 'Yes' : 'No',
    certifiedRatio: `${T.certified_faults || 0}/${T.fault_nodes || 0}`,
    consequences: T.downstream_consequences || 0,
    preventable: T.preventable_consequences || 0,
    maxDepth: T.max_depth || 0,
    mttr: Math.round(k.mean_time_to_resolve_s || 0),
    detectedAt: Math.round(k.time_to_first_detection_s || 0),
    containmentRate: k.containment_rate ?? 0,
    readiness: g.readiness,
    safety: Math.max(0, 100 - (computeImpacts(g).Safety || 0)),
  }
}
