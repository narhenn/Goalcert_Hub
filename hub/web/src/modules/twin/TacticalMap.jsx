// TacticalMap.jsx — dark-themed tactical overview with force positions, sector
// overlays, threat levels and readiness scoring. Defence vertical.
import React, { useState, useMemo, useEffect } from 'react'
import { Icon, HealthRing } from '../../lib.jsx'
import { useTwin } from '../../hub/twinState.jsx'

const SECTORS = [
  { id: 'alpha', label: 'Sector Alpha', cx: 160, cy: 120, r: 80 },
  { id: 'bravo', label: 'Sector Bravo', cx: 380, cy: 100, r: 90 },
  { id: 'charlie', label: 'Sector Charlie', cx: 580, cy: 150, r: 85 },
  { id: 'delta', label: 'Sector Delta', cx: 280, cy: 260, r: 75 },
  { id: 'echo', label: 'Sector Echo', cx: 500, cy: 280, r: 80 },
]

function genForces() {
  const friendly = [
    { id: 'F1', label: 'RSS Tenacious', type: 'ship', x: 200, y: 140, status: 'active' },
    { id: 'F2', label: 'RSS Vigilance', type: 'ship', x: 350, y: 90, status: 'active' },
    { id: 'F3', label: 'Helo-1', type: 'air', x: 280, y: 180, status: 'patrol' },
    { id: 'F4', label: 'Helo-2', type: 'air', x: 520, y: 130, status: 'rtb' },
    { id: 'F5', label: 'PB-Alpha', type: 'patrol', x: 150, y: 200, status: 'active' },
    { id: 'F6', label: 'PB-Bravo', type: 'patrol', x: 460, y: 250, status: 'active' },
    { id: 'F7', label: 'Shore-Radar', type: 'sensor', x: 100, y: 280, status: 'active' },
    { id: 'F8', label: 'UAV-Recon', type: 'air', x: 600, y: 200, status: 'patrol' },
  ]
  const threats = [
    { id: 'T1', label: 'Unknown Contact', type: 'unknown', x: 620, y: 80, status: 'tracking' },
    { id: 'T2', label: 'Suspect Vessel', type: 'ship', x: 680, y: 180, status: 'tracking' },
    { id: 'T3', label: 'UAS Detection', type: 'air', x: 550, y: 60, status: 'alert' },
  ]
  const neutral = [
    { id: 'N1', label: 'Commercial Vessel', type: 'ship', x: 400, y: 200, status: 'transiting' },
    { id: 'N2', label: 'Fishing Boat', type: 'patrol', x: 300, y: 320, status: 'stationary' },
  ]
  return { friendly, threats, neutral }
}

const FORCE_COLOR = { friendly: '#3b82f6', threat: '#e11d48', neutral: '#6b7280' }
const FORCE_ICON = { ship: 'ti-ship', air: 'ti-drone', patrol: 'ti-speedboat', sensor: 'ti-radar-2', unknown: 'ti-help' }

function sectorThreat(sectorId) {
  // simulated threat levels
  const levels = { alpha: 'low', bravo: 'medium', charlie: 'high', delta: 'low', echo: 'medium' }
  return levels[sectorId] || 'low'
}
const THREAT_COLOR = { low: 'rgba(22,163,74,.12)', medium: 'rgba(217,119,6,.15)', high: 'rgba(225,29,72,.15)' }
const THREAT_STROKE = { low: 'rgba(22,163,74,.3)', medium: 'rgba(217,119,6,.35)', high: 'rgba(225,29,72,.4)' }

export default function TacticalMap() {
  const { twin } = useTwin()
  const [forces, setForces] = useState(genForces)
  const [selected, setSelected] = useState(null)
  const [selectedType, setSelectedType] = useState(null) // 'friendly'|'threat'|'neutral'

  const live = twin?.latest || {}
  const readiness = live['def:forceReadiness'] ?? 94
  const radarCov = live['def:radarCoverage'] ?? 97
  const alerts = live['def:perimeterAlerts'] ?? 0
  const uasThreat = live['def:uasThreatLevel'] ?? 0

  // animate force positions
  useEffect(() => {
    const iv = setInterval(() => {
      setForces(prev => ({
        friendly: prev.friendly.map(f => ({
          ...f,
          x: Math.max(30, Math.min(720, f.x + (Math.random() - 0.5) * 6)),
          y: Math.max(30, Math.min(330, f.y + (Math.random() - 0.5) * 4)),
        })),
        threats: prev.threats.map(f => ({
          ...f,
          x: Math.max(30, Math.min(720, f.x + (Math.random() - 0.4) * 5)),
          y: Math.max(30, Math.min(330, f.y + (Math.random() - 0.5) * 4)),
        })),
        neutral: prev.neutral.map(f => ({
          ...f,
          x: Math.max(30, Math.min(720, f.x + (Math.random() - 0.5) * 3)),
          y: Math.max(30, Math.min(330, f.y + (Math.random() - 0.5) * 2)),
        })),
      }))
    }, 1200)
    return () => clearInterval(iv)
  }, [])

  const activeAlerts = useMemo(() => {
    const a = []
    if (uasThreat >= 1) a.push({ sev: 'critical', msg: `UAS threat detected -- threat level ${Math.round(uasThreat)}` })
    if (alerts >= 1) a.push({ sev: 'warning', msg: `${Math.round(alerts)} perimeter alert(s) active` })
    if (readiness < 85) a.push({ sev: 'warning', msg: `Force readiness below 85%: ${Math.round(readiness)}%` })
    if (radarCov < 85) a.push({ sev: 'critical', msg: `Radar coverage degraded: ${Math.round(radarCov)}%` })
    if (a.length === 0) a.push({ sev: 'nominal', msg: 'All sectors nominal. No active threats.' })
    return a
  }, [uasThreat, alerts, readiness, radarCov])

  const W = 750, H = 370

  const darkBg = {
    background: 'linear-gradient(180deg, #0a0e1c 0%, #060910 100%)',
    border: '1px solid #1a2040',
    borderRadius: 14,
    position: 'relative',
    height: H,
    overflow: 'hidden',
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title"><Icon n="ti-shield-star" /> Tactical Map</div>
          <div className="panel-subtitle">Naval operations -- force disposition, sector coverage and threat tracking</div>
        </div>
        <div className="panel-actions">
          {uasThreat >= 1 && <span className="pill pill-red">THREAT</span>}
          <span className="pill pill-green">LIVE</span>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid-4 section-gap">
        <div className="card kpi">
          <div className="card-label">Force Readiness</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <HealthRing value={readiness / 100} size={52} stroke={5} />
            <div><div className="card-value" style={{ fontSize: 22, color: readiness > 88 ? 'var(--accent-green)' : 'var(--accent-amber)' }}>{Math.round(readiness)}%</div></div>
          </div>
        </div>
        <div className="card kpi"><div className="card-label">Radar Coverage</div><div className="card-value" style={{ color: radarCov > 85 ? 'var(--accent-green)' : 'var(--accent-red)' }}>{Math.round(radarCov)}%</div><div className="card-change">sector sweep</div></div>
        <div className="card kpi"><div className="card-label">Active Alerts</div><div className="card-value" style={{ color: alerts > 0 ? 'var(--accent-red)' : 'var(--accent-green)' }}>{Math.round(alerts)}</div><div className="card-change">{alerts > 0 ? 'perimeter breach' : 'all clear'}</div></div>
        <div className="card kpi"><div className="card-label">UAS Threat</div><div className="card-value" style={{ color: uasThreat >= 1 ? 'var(--accent-red)' : 'var(--accent-green)' }}>{uasThreat >= 1 ? 'ACTIVE' : 'CLEAR'}</div><div className="card-change">level {Math.round(uasThreat)}</div></div>
      </div>

      <div className="grid-2 section-gap">
        {/* Tactical map */}
        <div style={darkBg}>
          <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
            {/* Grid lines */}
            {[0,1,2,3,4,5,6,7].map(i => <line key={`gv${i}`} x1={i * (W / 7)} y1="0" x2={i * (W / 7)} y2={H} stroke="rgba(100,140,255,.06)" strokeWidth="0.5" />)}
            {[0,1,2,3,4].map(i => <line key={`gh${i}`} x1="0" y1={i * (H / 4)} x2={W} y2={i * (H / 4)} stroke="rgba(100,140,255,.06)" strokeWidth="0.5" />)}

            {/* Sector overlays */}
            {SECTORS.map(s => {
              const tl = sectorThreat(s.id)
              return (
                <g key={s.id}>
                  <circle cx={s.cx} cy={s.cy} r={s.r} fill={THREAT_COLOR[tl]} stroke={THREAT_STROKE[tl]} strokeWidth="1" strokeDasharray="4 4" />
                  <text x={s.cx} y={s.cy - s.r + 14} textAnchor="middle" fontSize="8" fill="rgba(200,210,255,.4)" fontWeight="600">{s.label.toUpperCase()}</text>
                </g>
              )
            })}

            {/* Friendly forces (blue) */}
            {forces.friendly.map(f => {
              const isSel = selected === f.id && selectedType === 'friendly'
              return (
                <g key={f.id} style={{ cursor: 'pointer' }} onClick={() => { setSelected(f.id); setSelectedType('friendly') }}>
                  {isSel && <circle cx={f.x} cy={f.y} r="16" fill="none" stroke={FORCE_COLOR.friendly} strokeWidth="1.5" className="netmap-pulse" />}
                  <polygon points={`${f.x},${f.y - 8} ${f.x + 7},${f.y + 5} ${f.x - 7},${f.y + 5}`} fill={FORCE_COLOR.friendly} opacity={isSel ? 1 : 0.8} />
                  <text x={f.x} y={f.y + 18} textAnchor="middle" fontSize="7" fill="rgba(150,180,255,.7)">{f.label}</text>
                </g>
              )
            })}

            {/* Threats (red) */}
            {forces.threats.map(f => {
              const isSel = selected === f.id && selectedType === 'threat'
              return (
                <g key={f.id} style={{ cursor: 'pointer' }} onClick={() => { setSelected(f.id); setSelectedType('threat') }}>
                  {isSel && <circle cx={f.x} cy={f.y} r="16" fill="none" stroke={FORCE_COLOR.threat} strokeWidth="1.5" className="netmap-pulse" />}
                  <rect x={f.x - 6} y={f.y - 6} width="12" height="12" fill={FORCE_COLOR.threat} opacity={isSel ? 1 : 0.8} transform={`rotate(45,${f.x},${f.y})`} />
                  <circle cx={f.x} cy={f.y} r="12" fill="none" stroke={FORCE_COLOR.threat} strokeWidth="0.5" className="netmap-pulse" />
                  <text x={f.x} y={f.y + 18} textAnchor="middle" fontSize="7" fill="rgba(255,140,140,.7)">{f.label}</text>
                </g>
              )
            })}

            {/* Neutral (grey) */}
            {forces.neutral.map(f => {
              const isSel = selected === f.id && selectedType === 'neutral'
              return (
                <g key={f.id} style={{ cursor: 'pointer' }} onClick={() => { setSelected(f.id); setSelectedType('neutral') }}>
                  <circle cx={f.x} cy={f.y} r="6" fill={FORCE_COLOR.neutral} opacity={isSel ? 1 : 0.6} stroke={isSel ? '#fff' : 'none'} strokeWidth="1" />
                  <text x={f.x} y={f.y + 16} textAnchor="middle" fontSize="7" fill="rgba(200,200,200,.5)">{f.label}</text>
                </g>
              )
            })}
          </svg>

          {/* Map legend overlay */}
          <div style={{ position: 'absolute', bottom: 8, left: 10, display: 'flex', gap: 10, fontSize: 9, fontFamily: 'var(--mono)', color: 'rgba(200,210,255,.5)' }}>
            <span><span style={{ display: 'inline-block', width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderBottom: `8px solid ${FORCE_COLOR.friendly}`, marginRight: 3 }} />Friendly</span>
            <span><span style={{ display: 'inline-block', width: 8, height: 8, background: FORCE_COLOR.threat, transform: 'rotate(45deg)', marginRight: 3 }} />Threat</span>
            <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: FORCE_COLOR.neutral, marginRight: 3 }} />Neutral</span>
          </div>
        </div>

        {/* Side panel */}
        <div className="card">
          <div className="card-title"><Icon n="ti-list-details" /> Situation Report</div>

          {/* Selected unit detail */}
          {selected ? (() => {
            const pool = selectedType === 'friendly' ? forces.friendly : selectedType === 'threat' ? forces.threats : forces.neutral
            const unit = pool.find(f => f.id === selected)
            if (!unit) return null
            const col = FORCE_COLOR[selectedType]
            return (
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontWeight: 600, color: col }}><Icon n={FORCE_ICON[unit.type] || 'ti-point'} /> {unit.label}</span>
                  <button className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: 13 }} onClick={() => setSelected(null)}><Icon n="ti-x" /></button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                  <div className="kpibox"><div className="l">Classification</div><div className="v" style={{ fontSize: 14, color: col }}>{selectedType.toUpperCase()}</div></div>
                  <div className="kpibox"><div className="l">Type</div><div className="v" style={{ fontSize: 14 }}>{unit.type}</div></div>
                  <div className="kpibox"><div className="l">Status</div><div className="v" style={{ fontSize: 14 }}>{unit.status}</div></div>
                  <div className="kpibox"><div className="l">Position</div><div className="v" style={{ fontSize: 12, fontFamily: 'var(--mono)' }}>{Math.round(unit.x)}, {Math.round(unit.y)}</div></div>
                </div>
              </div>
            )
          })() : (
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>Click any unit on the map for details.</div>
          )}

          {/* Alert feed */}
          <div className="card-title" style={{ marginTop: 4 }}><Icon n="ti-alert-triangle" /> Active Alerts</div>
          <div className="event-list">
            {activeAlerts.map((a, i) => (
              <div key={i} className="event-item">
                <div className={`event-icon ${a.sev === 'critical' ? 'ev-crit' : a.sev === 'warning' ? 'ev-warn' : 'ev-ok'}`}>
                  <Icon n={a.sev === 'nominal' ? 'ti-check' : 'ti-alert-triangle'} />
                </div>
                <div className="event-body">
                  <div className="event-title">{a.msg}</div>
                  <div className="event-meta">{a.sev.toUpperCase()}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Sensor coverage bar */}
          <div style={{ marginTop: 14 }}>
            <div className="bar-row">
              <div className="bar-label"><span>Sensor Coverage</span><b>{Math.round(radarCov)}%</b></div>
              <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.min(100, radarCov)}%`, background: radarCov > 85 ? 'var(--accent-green)' : 'var(--accent-red)' }} /></div>
            </div>
            <div className="bar-row">
              <div className="bar-label"><span>Comms Uptime</span><b>{Math.round(live['def:commsLatency'] ?? 18)}ms</b></div>
              <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.max(0, 100 - (live['def:commsLatency'] ?? 18))}%`, background: 'var(--accent-blue)' }} /></div>
            </div>
            <div className="bar-row">
              <div className="bar-label"><span>Fuel Reserve</span><b>{Math.round(live['def:fuelReserve'] ?? 82)}%</b></div>
              <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.min(100, live['def:fuelReserve'] ?? 82)}%`, background: (live['def:fuelReserve'] ?? 82) > 30 ? 'var(--accent-green)' : 'var(--accent-red)' }} /></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
