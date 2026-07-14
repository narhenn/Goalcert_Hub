// Prediction.jsx — the Digital Twin's forecast surface: trajectory projection,
// time-to-limit and at-risk signals. Deterministic (the twin's own prediction),
// no LLM — runs on the frontend simulator's forward trajectory.
import React, { useEffect, useMemo, useState } from 'react'
import { Icon, SIG, fmt, pct, hColor, predictCharts, simTrajectory, signalsAtRisk } from '../../lib.jsx'
import { useTwin } from '../../hub/twinState.jsx'
import { SourceBadge } from '../../services/integration.jsx'
import MiniChart from '../../hub/MiniChart.jsx'
import API from '../../api.js'

const HORIZONS = [
  { label: '2 hours', min: 120 }, { label: '6 hours', min: 360 },
  { label: '24 hours', min: 1440 }, { label: '3 days', min: 4320 },
]

export default function Prediction() {
  const { active, twin, simFault, serviceMode } = useTwin()
  const [hi, setHi] = useState(1)
  const [live, setLive] = useState(null)   // { traj, rul, severity } from the NextXR /predict endpoint
  const horizon = HORIZONS[hi]
  const charts = predictCharts(active.domain)

  // the twin's own forward simulator — always available as the baseline / fallback
  const simTraj = useMemo(
    () => simTrajectory(active.domain, horizon.min, 48, simFault, 1),
    [active.domain, horizon.min, simFault])

  // live forecast from NextXR when a real tenant is attached; falls back to the sim
  useEffect(() => {
    let cancelled = false
    setLive(null)
    if (serviceMode !== 'live' || !active?.tenant) return
    ;(async () => {
      try {
        const data = await API.twin.predict(active.tenant, horizon.min)
        if (!cancelled && Array.isArray(data?.trajectory) && data.trajectory.length)
          setLive({ traj: data.trajectory, rul: data.rul || [], severity: data.severity })
      } catch { /* twin unreachable — keep the sim baseline */ }
    })()
    return () => { cancelled = true }
  }, [active, horizon.min, serviceMode])

  const source = live ? 'live' : 'sim'
  const traj = live?.traj?.length ? live.traj : simTraj
  const last = traj[traj.length - 1] || {}
  const atRisk = signalsAtRisk(active.domain, last) || []
  const projH = last.health

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">Prediction</div>
          <div className="panel-subtitle">{active.name} · trajectory projection & remaining-useful-life <SourceBadge source={source} /></div>
        </div>
        <div className="panel-actions">
          {HORIZONS.map((hz, i) => (
            <button key={hz.label} className={`btn ${i === hi ? 'btn-primary' : ''}`} onClick={() => setHi(i)}>{hz.label}</button>
          ))}
        </div>
      </div>

      <div className="grid-4 section-gap">
        <div className="card kpi"><div className="card-label">Health now</div>
          <div className="card-value" style={{ color: hColor(twin?.health) }}>{pct(twin?.health)}</div>
          <div className="card-change">physics index</div></div>
        <div className="card kpi"><div className="card-label">At {horizon.label}</div>
          <div className="card-value" style={{ color: hColor(projH) }}>{pct(projH)}</div>
          <div className="card-change">{projH < (twin?.health ?? 1) ? 'degrading' : 'stable'}</div></div>
        <div className="card kpi"><div className="card-label">Signals at risk</div>
          <div className="card-value" style={{ color: atRisk.length ? 'var(--accent-amber)' : 'var(--accent-green)' }}>{atRisk.length}</div>
          <div className="card-change">over the horizon</div></div>
        <div className="card kpi"><div className="card-label">Injected condition</div>
          <div className="card-value" style={{ fontSize: 16 }}>{simFault ? 'Fault' : 'Nominal'}</div>
          <div className="card-change">{simFault ? 'scenario-driven' : 'current load'}</div></div>
      </div>

      <div className="grid-2">
        {charts.map((c, i) => (
          <div key={i} className="card">
            <div className="card-title">{c.title}{c.redline != null && <span className="pill pill-red" style={{ fontSize: 9 }}>redline {c.redline}</span>}</div>
            <MiniChart data={traj} series={c.series} redline={c.redline} height={150} />
          </div>
        ))}
      </div>

      {live?.rul?.length > 0 && (
        <div className="card section-gap">
          <div className="card-title"><Icon n="ti-hourglass-high" /> Remaining useful life <SourceBadge source="live" /></div>
          <div className="event-list">
            {live.rul.map((r, i) => (
              <div key={i} className="event-item">
                <div className={`event-icon ${r.severity === 'critical' ? 'ev-crit' : 'ev-warn'}`}><Icon n="ti-clock-hour-4" /></div>
                <div className="event-body">
                  <div className="event-title">{r.component}</div>
                  <div className="event-meta">~{fmt(r.minutes)} min to service{r.severity ? ` · ${r.severity}` : ''}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card section-gap">
        <div className="card-title"><Icon n="ti-alert-triangle" /> Time-to-limit
          <span className={`pill ${atRisk.length ? 'pill-amber' : 'pill-green'}`}>{atRisk.length} at risk</span></div>
        {atRisk.length === 0
          ? <div className="empty">No signals are projected to leave their limits within {horizon.label} at current load.</div>
          : <div className="event-list">{atRisk.slice(0, 8).map((r, i) => (
              <div key={i} className="event-item">
                <div className={`event-icon ${r.sev === 'crit' ? 'ev-crit' : 'ev-warn'}`}><Icon n="ti-trending-down" /></div>
                <div className="event-body">
                  <div className="event-title">{r.meta?.label || r.key}</div>
                  <div className="event-meta">projected {fmt(r.value)}{r.meta?.unit ? ' ' + r.meta.unit : ''} — {r.sev === 'crit' ? 'breaches limit' : 'enters warning band'} within {horizon.label}</div>
                </div>
              </div>))}</div>}
      </div>
    </div>
  )
}
