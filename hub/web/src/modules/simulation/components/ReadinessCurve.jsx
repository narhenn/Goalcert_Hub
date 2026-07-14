// ReadinessCurve.jsx — "what readiness do I actually need?"
//
// A single run tells you what happened at ONE readiness. That's a data point, not a
// decision. This sweeps readiness across the whole range and re-runs the scenario at
// each point, so you can see the exact line where the fault stops cascading — and where
// your current setting sits relative to it.
//
// This is NOT a probability. The engine is deterministic: same inputs, same run, every
// time. So sweeping readiness doesn't sample a distribution, it traces a threshold —
// which is the more useful thing anyway. "You need 65" beats "there's a 58% chance".
//
// Cost: one engine run per sample point. They're milliseconds each and fire in parallel.

import React, { useState } from 'react'
import { Icon } from '../../../lib.jsx'
import API from '../../../api.js'
import { useSim } from '../simState.jsx'

const STEP = 5   // sample every 5 points of readiness → 21 runs

export default function ReadinessCurve() {
  const { scenarioId, domain, effReadiness, scenarios } = useSim()
  const [points, setPoints] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const scenario = scenarios.find(s => s.id === scenarioId)

  const sweep = async () => {
    setBusy(true); setError(null); setPoints(null)
    const levels = []
    for (let r = 0; r <= 100; r += STEP) levels.push(r)
    try {
      const results = await Promise.all(
        // readiness_range [r, r] pins the sweep to exactly one readiness, so one
        // iteration is enough — a second would be a byte-identical rerun.
        levels.map(r => API.scenario.sim.sweep(scenarioId, domain, [r, r], 1)),
      )
      setPoints(levels.map((r, i) => ({
        readiness: r,
        contained: results[i].certified_rate >= 1,
        containment: results[i].kpi_stats?.containment_rate?.mean ?? 0,
      })))
    } catch (e) {
      setError(e.message || 'Sweep failed')
    } finally {
      setBusy(false)
    }
  }

  if (!scenarioId) return null

  // the lowest readiness at which the operator contains the fault
  const threshold = points?.find(p => p.contained)?.readiness ?? null
  const youAreSafe = threshold != null && effReadiness >= threshold

  const W = 460, H = 120, PAD = 26
  const x = (r) => PAD + (r / 100) * (W - PAD * 2)
  const y = (v) => H - PAD - v * (H - PAD * 2)

  return (
    <div className="card">
      <div className="card-title">
        <Icon n="ti-chart-arrows-vertical" /> Readiness threshold
        {threshold != null && (
          <span className={`pill ${youAreSafe ? 'pill-green' : 'pill-red'}`}>
            need ≥ {threshold}
          </span>
        )}
      </div>

      {!points && (
        <>
          <div className="sim-hint" style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}>
            One run tells you what happens at <b>one</b> readiness. This re-runs
            {' '}<b>{scenario?.name || 'the scenario'}</b> at every readiness from 0 to 100
            and finds the exact point where the operator contains the fault — the line you
            have to be above for the preventable cascade to never fire.
          </div>
          <button className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
            onClick={sweep} disabled={busy}>
            {busy
              ? <><span className="spinner" /> Running {Math.floor(100 / STEP) + 1} simulations…</>
              : <><Icon n="ti-chart-arrows-vertical" /> Find the threshold</>}
          </button>
          {error && <div className="empty" style={{ color: 'var(--accent-red)', marginTop: 10 }}>{error}</div>}
        </>
      )}

      {points && (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} className="sim-curve">
            {/* contained / not-contained bands */}
            <rect x={PAD} y={y(1)} width={W - PAD * 2} height={y(0) - y(1)}
              fill="var(--surface2)" rx="4" />
            {threshold != null && (
              <rect x={x(threshold)} y={y(1)} width={W - PAD - x(threshold)} height={y(0) - y(1)}
                fill="rgba(22,163,74,.10)" />
            )}

            {/* the step curve: containment vs readiness */}
            <path
              d={points.map((p, i) => `${i ? 'L' : 'M'}${x(p.readiness)} ${y(p.containment)}`).join(' ')}
              fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinejoin="round" />
            {points.map(p => (
              <circle key={p.readiness} cx={x(p.readiness)} cy={y(p.containment)} r="2.5"
                fill={p.contained ? 'var(--accent-green)' : 'var(--accent-red)'} />
            ))}

            {/* the threshold line */}
            {threshold != null && (
              <>
                <line x1={x(threshold)} y1={y(1) - 6} x2={x(threshold)} y2={y(0) + 4}
                  stroke="var(--accent-green)" strokeWidth="1.5" strokeDasharray="4 3" />
                <text x={x(threshold)} y={y(1) - 10} textAnchor="middle" className="sim-curve-tag"
                  fill="var(--accent-green)">{threshold}</text>
              </>
            )}

            {/* where you actually are */}
            <line x1={x(effReadiness)} y1={y(1) - 6} x2={x(effReadiness)} y2={y(0) + 4}
              stroke="var(--brand)" strokeWidth="2" />
            <text x={x(effReadiness)} y={y(0) + 16} textAnchor="middle" className="sim-curve-tag"
              fill="var(--brand)">you: {effReadiness}</text>

            <text x={PAD} y={y(0) + 16} className="sim-curve-tag" fill="var(--hint)">0</text>
            <text x={W - PAD} y={y(0) + 16} textAnchor="end" className="sim-curve-tag" fill="var(--hint)">100</text>
            <text x={PAD - 6} y={y(1) + 3} textAnchor="end" className="sim-curve-tag" fill="var(--hint)">contained</text>
            <text x={PAD - 6} y={y(0) + 3} textAnchor="end" className="sim-curve-tag" fill="var(--hint)">failed</text>
          </svg>

          <div className="sim-field-value" style={{
            borderLeft: `3px solid ${youAreSafe ? 'var(--accent-green)' : 'var(--accent-red)'}`,
            marginTop: 4,
          }}>
            {threshold == null
              ? <>The operator <b>never</b> contains this fault, at any readiness. It cannot be
                  prevented by preparedness alone — it needs a safeguard (a resource that blocks
                  it) or a redesigned response.</>
              : youAreSafe
                ? <>At readiness <b>{effReadiness}</b> you are above the line. The fault is
                    contained and the preventable branch never fires.</>
                : <>At readiness <b>{effReadiness}</b> you are <b>{threshold - effReadiness} points
                    short</b>. Below {threshold} the operator misses the decision gate, the fault
                    escapes, and the preventable consequence fires every time.</>}
          </div>

          <button className="btn" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}
            onClick={sweep} disabled={busy}>
            <Icon n="ti-refresh" /> Re-run sweep
          </button>
        </>
      )}
    </div>
  )
}
