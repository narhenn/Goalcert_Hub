// ChargingMap.jsx — EV charging network map with charger pins, status colors,
// click-to-inspect and grid load bar. EV vertical.
import React, { useState, useMemo, useEffect } from 'react'
import { Icon } from '../../lib.jsx'
import { useTwin } from '../../hub/twinState.jsx'

const CHARGER_NAMES = [
  'Jurong Hub DC-01','Jurong Hub DC-02','Tampines Mall FC-01','Tampines Mall FC-02',
  'Orchard Central AC-01','Bukit Timah FC-03','Changi Depot DC-04','Woodlands FC-05',
  'Toa Payoh DC-06','Bedok Mall FC-07','Clementi DC-08','Sengkang FC-09',
  'Punggol DC-10','Ang Mo Kio FC-11','Bishan Hub DC-12','HarbourFront AC-02',
  'Marina Bay DC-13','Sentosa FC-14','Pasir Ris DC-15','Yishun FC-16',
]

function genChargers() {
  return CHARGER_NAMES.map((name, i) => {
    const stat = Math.random()
    const status = stat > 0.7 ? 'available' : stat > 0.15 ? 'in-use' : 'fault'
    return {
      id: `CHG-${String(i+1).padStart(3,'0')}`,
      name,
      status,
      power: status === 'in-use' ? Math.round(30 + Math.random() * 120) : 0,
      soc: status === 'in-use' ? Math.round(15 + Math.random() * 70) : 0,
      duration: status === 'in-use' ? Math.round(5 + Math.random() * 50) : 0,
      type: Math.random() > 0.3 ? 'DC Fast' : 'AC Level 2',
      maxKw: Math.random() > 0.3 ? 150 : 22,
      // place on a rough 5x4 grid
      gx: (i % 5), gy: Math.floor(i / 5),
    }
  })
}

const STATUS_COLOR = { 'available': 'var(--accent-green)', 'in-use': 'var(--accent-amber)', 'fault': 'var(--accent-red)' }
const STATUS_LABEL = { 'available': 'Available', 'in-use': 'In Use', 'fault': 'Faulted' }

export default function ChargingMap() {
  const { twin } = useTwin()
  const [chargers, setChargers] = useState(genChargers)
  const [inspect, setInspect] = useState(null)

  const live = twin?.latest || {}
  const gridLoad = live['ev:gridLoad'] ?? 72

  // slowly drift statuses
  useEffect(() => {
    const iv = setInterval(() => {
      setChargers(prev => prev.map(c => {
        const r = Math.random()
        if (r < 0.04) {
          const stat = Math.random()
          const status = stat > 0.7 ? 'available' : stat > 0.12 ? 'in-use' : 'fault'
          return { ...c, status, power: status === 'in-use' ? Math.round(30 + Math.random() * 120) : 0, soc: status === 'in-use' ? Math.round(c.soc + Math.random() * 5) : 0, duration: status === 'in-use' ? c.duration + 1 : 0 }
        }
        if (c.status === 'in-use') {
          return { ...c, soc: Math.min(100, c.soc + Math.random() * 2), duration: c.duration + 1, power: Math.max(5, c.power + (Math.random() - 0.5) * 10) }
        }
        return c
      }))
    }, 2000)
    return () => clearInterval(iv)
  }, [])

  const counts = useMemo(() => {
    const c = { total: chargers.length, available: 0, 'in-use': 0, fault: 0 }
    chargers.forEach(ch => c[ch.status]++)
    return c
  }, [chargers])

  const W = 680, H = 340, padX = 50, padY = 40

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title"><Icon n="ti-charging-pile" /> Charging Network Map</div>
          <div className="panel-subtitle">Island-wide EV charger fleet -- real-time status and power draw</div>
        </div>
        <div className="panel-actions"><span className="pill pill-green">LIVE</span></div>
      </div>

      {/* Summary KPIs */}
      <div className="grid-4 section-gap">
        <div className="card kpi"><div className="card-label">Total Chargers</div><div className="card-value">{counts.total}</div><div className="card-change">fleet-wide</div></div>
        <div className="card kpi"><div className="card-label">Available</div><div className="card-value" style={{ color: 'var(--accent-green)' }}>{counts.available}</div><div className="card-change">ready to charge</div></div>
        <div className="card kpi"><div className="card-label">In Use</div><div className="card-value" style={{ color: 'var(--accent-amber)' }}>{counts['in-use']}</div><div className="card-change">active sessions</div></div>
        <div className="card kpi"><div className="card-label">Faulted</div><div className="card-value" style={{ color: 'var(--accent-red)' }}>{counts.fault}</div><div className="card-change">{counts.fault > 0 ? 'needs attention' : 'all clear'}</div></div>
      </div>

      {/* Map view */}
      <div className="grid-2 section-gap">
        <div className="card" style={{ position: 'relative', padding: 0, overflow: 'hidden' }}>
          <div className="netmap" style={{ position: 'relative', height: H }}>
            <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
              {/* grid background */}
              {[0,1,2,3,4].map(i => <line key={`gv${i}`} x1={padX + i * ((W - 2*padX) / 4)} y1={padY - 10} x2={padX + i * ((W - 2*padX) / 4)} y2={H - padY + 10} stroke="var(--border)" strokeWidth="0.5" strokeDasharray="3 3" />)}
              {[0,1,2,3].map(i => <line key={`gh${i}`} x1={padX - 10} y1={padY + i * ((H - 2*padY) / 3)} x2={W - padX + 10} y2={padY + i * ((H - 2*padY) / 3)} stroke="var(--border)" strokeWidth="0.5" strokeDasharray="3 3" />)}

              {/* charger pins */}
              {chargers.map((c, i) => {
                const cx = padX + c.gx * ((W - 2*padX) / 4)
                const cy = padY + c.gy * ((H - 2*padY) / 3)
                const col = STATUS_COLOR[c.status]
                const isInspected = inspect?.id === c.id
                return (
                  <g key={c.id} style={{ cursor: 'pointer' }} onClick={() => setInspect(c)}>
                    {/* pin drop shadow */}
                    <ellipse cx={cx} cy={cy + 14} rx={6} ry={2} fill="rgba(0,0,0,.1)" />
                    {/* pin body */}
                    <path d={`M${cx},${cy - 10} C${cx - 10},${cy - 10} ${cx - 10},${cy + 4} ${cx},${cy + 14} C${cx + 10},${cy + 4} ${cx + 10},${cy - 10} ${cx},${cy - 10}Z`} fill={col} opacity={isInspected ? 1 : 0.8} stroke={isInspected ? 'var(--text)' : 'none'} strokeWidth={isInspected ? 2 : 0} />
                    <circle cx={cx} cy={cy - 2} r={4} fill="#fff" opacity="0.9" />
                    {c.status === 'fault' && <circle cx={cx} cy={cy - 2} r={6} fill="none" stroke={col} strokeWidth="1.5" className="netmap-pulse" />}
                    <text x={cx} y={cy - 20} textAnchor="middle" fontSize="7.5" fill="var(--muted)" fontWeight="500">{c.name.split(' ').slice(-1)[0]}</text>
                  </g>
                )
              })}
            </svg>
          </div>
        </div>

        {/* Inspect panel or placeholder */}
        <div className="card">
          {inspect ? (
            <>
              <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span><Icon n="ti-charging-pile" /> {inspect.name}</span>
                <button className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: 13 }} onClick={() => setInspect(null)}><Icon n="ti-x" /></button>
              </div>
              <div style={{ marginBottom: 10 }}>
                <span className="pill" style={{ background: STATUS_COLOR[inspect.status], color: '#fff' }}>{STATUS_LABEL[inspect.status]}</span>
                <span className="pill pill-surface" style={{ marginLeft: 6 }}>{inspect.type}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div className="kpibox"><div className="l">Power Output</div><div className="v">{Math.round(inspect.power)} <span style={{ fontSize: 12 }}>kW</span></div></div>
                <div className="kpibox"><div className="l">Max Rating</div><div className="v">{inspect.maxKw} <span style={{ fontSize: 12 }}>kW</span></div></div>
                <div className="kpibox"><div className="l">Session SoC</div><div className="v" style={{ color: inspect.soc < 20 ? 'var(--accent-red)' : 'var(--accent-green)' }}>{Math.round(inspect.soc)}%</div></div>
                <div className="kpibox"><div className="l">Duration</div><div className="v">{inspect.duration} <span style={{ fontSize: 12 }}>min</span></div></div>
              </div>
              {inspect.status === 'fault' && (
                <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 10, background: 'rgba(225,29,72,.06)', border: '1px solid rgba(225,29,72,.2)', fontSize: 12, color: 'var(--accent-red)' }}>
                  <Icon n="ti-alert-triangle" /> Charger offline -- communication fault detected. Last heartbeat 4 min ago.
                </div>
              )}
            </>
          ) : (
            <div className="empty">Click a charger pin to inspect its status, power output and session details.</div>
          )}
        </div>
      </div>

      {/* Grid load bar */}
      <div className="card">
        <div className="card-title"><Icon n="ti-bolt" /> Grid Load</div>
        <div className="bar-row">
          <div className="bar-label"><span>Total grid demand</span><b>{Math.round(gridLoad)}%</b></div>
          <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.min(100, gridLoad)}%`, background: gridLoad > 90 ? 'var(--accent-red)' : gridLoad > 75 ? 'var(--accent-amber)' : 'var(--accent-green)' }} /></div>
        </div>
        <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
          <span>Solar offset: {live['ev:solarOutput'] ? Math.round(live['ev:solarOutput']) : 85} kW</span>
          <span>V2G available: {live['ev:v2gCapacity'] ? Math.round(live['ev:v2gCapacity']) : 180} kWh</span>
          <span>Transformer: {live['ev:transformerTemp'] ? Math.round(live['ev:transformerTemp']) : 68} C</span>
        </div>
      </div>
    </div>
  )
}
