// OpsReadiness.jsx — the Plant Manager / COO workspace.
//
// One number to run the business on: the Operational Readiness Score, rolled
// up by site / shift / role, with the four trend lines that move buyers —
// time-to-competency, first-time-fix, incident risk, cost per certified
// operator — and a one-click business case export.
import React, { useMemo, useState } from 'react'
import { Icon, HealthRing, Sparkline, useCountUp } from '../../lib.jsx'
import { useReadiness } from '../../hub/readinessState.jsx'
import { useKpi } from '../../hub/kpiState.jsx'
import { useLoop } from '../../hub/loopState.jsx'
import { useAudit } from '../../hub/audit.jsx'
import MiniChart from '../../hub/MiniChart.jsx'

// site roll-up — "This facility" reads the live readiness provider, so a
// frontline flow completing visibly moves the COO number.
const SITES = [
  { id: 'here', name: 'This facility', region: 'Live', live: true },
  { id: 'tuas', name: 'Tuas Plant', region: 'Singapore', score: 81, delta: +4 },
  { id: 'perth', name: 'Perth Ops', region: 'Australia', score: 74, delta: +2 },
  { id: 'jurong', name: 'Jurong Yard', region: 'Singapore', score: 68, delta: -3 },
]

const SHIFT_ROWS = [
  { site: 'This facility', shift: 'Morning', role: 'Technicians', headcount: 12, cleared: 9, risk: 'low' },
  { site: 'This facility', shift: 'Night', role: 'Operators', headcount: 8, cleared: 5, risk: 'medium' },
  { site: 'Tuas Plant', shift: 'Morning', role: 'Technicians', headcount: 15, cleared: 13, risk: 'low' },
  { site: 'Tuas Plant', shift: 'Swing', role: 'Riggers', headcount: 6, cleared: 4, risk: 'medium' },
  { site: 'Perth Ops', shift: 'Day', role: 'Maintainers', headcount: 10, cleared: 7, risk: 'medium' },
  { site: 'Jurong Yard', shift: 'Night', role: 'Crane operators', headcount: 7, cleared: 3, risk: 'high' },
]

// business trend lines (baseline → now, per the metrics that move buyers)
const TRENDS = [
  { id: 'ttc', label: 'Time-to-competency', unit: 'weeks', dir: 'down', series: [12, 10.5, 9, 7.5, 6, 5, 4, 3.4], why: 'Every week of ramp is lost revenue' },
  { id: 'ftf', label: 'First-time-fix rate', unit: '%', dir: 'up', series: [68, 70, 73, 77, 80, 83, 86, 89], why: 'Direct line to service margin' },
  { id: 'risk', label: 'Incident risk index', unit: '', dir: 'down', series: [4.2, 4.0, 3.6, 3.3, 2.9, 2.6, 2.3, 2.1], why: 'Safety moves boards and regulators' },
  { id: 'cost', label: 'Cost / certified operator', unit: '$K', dir: 'down', series: [14, 13, 11.5, 10, 8.5, 7, 6, 5.2], why: 'The CFO metric' },
]

const RISK_PILL = { low: 'pill-green', medium: 'pill-amber', high: 'pill-red' }

export default function OpsReadiness({ onNav }) {
  const { score } = useReadiness()
  const { kpi } = useKpi()
  const loop = useLoop()
  const audit = useAudit()
  const [exported, setExported] = useState(false)

  const sites = useMemo(() => SITES.map(s => (s.live ? { ...s, score, delta: null } : s)), [score])
  const overall = Math.round(sites.reduce((a, s) => a + s.score, 0) / sites.length)
  const animated = useCountUp(overall)

  // readiness trend: prefer real Case-Study-Mode weekly rolls, else a seed
  const trendData = kpi.weeklyRolls?.length
    ? kpi.weeklyRolls.map(w => ({ label: w.week, readiness: w.avgReadiness, clearances: w.clearances }))
    : [62, 65, 69, 72, 75, 79, 82, overall].map((v, i) => ({ label: `W${i + 1}`, readiness: v, clearances: 4 + i * 2 }))

  const exportCase = () => {
    const rows = [
      'Metric,Baseline,Current,Direction',
      ...TRENDS.map(t => `${t.label},${t.series[0]}${t.unit},${t.series[t.series.length - 1]}${t.unit},${t.dir === 'up' ? 'improving ↑' : 'improving ↓'}`),
      `Operational readiness (all sites),62,${overall},improving ↑`,
    ].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([rows], { type: 'text/csv' }))
    a.download = 'goalcert-business-case.csv'
    a.click()
    setExported(true)
    audit.log('core', 'business_case_export', 'Business case exported from Ops Readiness',
      `Overall readiness ${overall}. Four board metrics with baselines.`)
    loop.emit('observe', { summary: 'Business case exported — readiness roll-up', detail: `Overall ${overall} across ${sites.length} sites. Board-ready CSV.`, module: 'twin', persona: 'coo' })
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">Operational Readiness</div>
          <div className="panel-subtitle">One number per site, per shift, per role — updated as the loop runs.</div>
        </div>
        <div className="panel-actions">
          <button className="btn" onClick={() => onNav && onNav('casestudy')}>
            <Icon n="ti-presentation-analytics" /> Case Study Mode</button>
          <button className="btn btn-primary" onClick={exportCase}>
            <Icon n="ti-download" /> {exported ? 'Exported ✓' : 'Export business case'}</button>
        </div>
      </div>

      {/* hero: overall + per-site */}
      <div className="ops-hero section-gap">
        <div className="card ops-score">
          <div className="card-label">Operational readiness — all sites</div>
          <div className="ops-big">{Math.round(animated)}</div>
          <div className="card-change up"><Icon n="ti-trending-up" /> +9 vs 8 weeks ago</div>
          <div className="hint" style={{ fontSize: 11, marginTop: 8 }}>
            LMS 30% · XR 35% · cert freshness 25% · incidents 10%
          </div>
        </div>
        {sites.map(s => (
          <div key={s.id} className="card ops-site">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <HealthRing value={s.score / 100} size={62} stroke={6} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {s.name}
                  {s.live && <span className="pill pill-green" style={{ fontSize: 8.5 }}>LIVE</span>}
                </div>
                <div className="hint" style={{ fontSize: 11 }}>{s.region}</div>
                {s.delta != null && (
                  <div className={`card-change ${s.delta >= 0 ? 'up' : 'down'}`} style={{ marginTop: 3 }}>
                    <Icon n={s.delta >= 0 ? 'ti-trending-up' : 'ti-trending-down'} /> {s.delta >= 0 ? '+' : ''}{s.delta} this week
                  </div>
                )}
                {s.live && <div className="hint" style={{ fontSize: 10.5, marginTop: 3 }}>moves when a shift flow completes</div>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* the four board metrics */}
      <div className="grid-4 section-gap">
        {TRENDS.map(t => {
          const first = t.series[0], last = t.series[t.series.length - 1]
          return (
            <div key={t.id} className="card kpi">
              <div className="card-label">{t.label}</div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
                <div className="card-value">{last}{t.unit && <span style={{ fontSize: 14 }}>{t.unit}</span>}</div>
                <Sparkline data={t.series} width={70} height={26}
                  color={t.dir === 'up' ? '#16a34a' : '#2563eb'} />
              </div>
              <div className="card-change">
                <span className="hint">was {first}{t.unit}</span> · <span className="up">{t.dir === 'up' ? '↑' : '↓'} improving</span>
              </div>
              <div className="hint" style={{ fontSize: 10.5, marginTop: 4 }}>{t.why}</div>
            </div>
          )
        })}
      </div>

      {/* readiness trend + drill-down */}
      <div className="grid-2 section-gap">
        <div className="card">
          <div className="card-title"><Icon n="ti-chart-line" /> Readiness & clearances trend
            {kpi.weeklyRolls?.length ? <span className="pill pill-green">Case Study Mode data</span> : <span className="pill pill-surface">seed</span>}
          </div>
          <MiniChart data={trendData} height={170} series={[
            { key: 'readiness', label: 'Avg readiness', color: '#7c3aed' },
            { key: 'clearances', label: 'Clearances / wk', color: '#16a34a' },
          ]} />
        </div>
        <div className="card">
          <div className="card-title"><Icon n="ti-table" /> Drill-down — site × shift × role</div>
          <div style={{ overflowX: 'auto' }}>
            <table className="ops-table">
              <thead><tr><th>Site</th><th>Shift</th><th>Role</th><th>Cleared</th><th>Risk</th></tr></thead>
              <tbody>
                {SHIFT_ROWS.map((r, i) => (
                  <tr key={i}>
                    <td>{r.site}</td><td>{r.shift}</td><td>{r.role}</td>
                    <td><b>{r.cleared}</b><span className="hint">/{r.headcount}</span></td>
                    <td><span className={`pill ${RISK_PILL[r.risk]}`} style={{ fontSize: 9 }}>{r.risk}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
