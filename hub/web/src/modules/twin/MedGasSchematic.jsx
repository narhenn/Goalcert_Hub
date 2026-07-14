// MedGasSchematic.jsx — P&ID-style medical gas distribution schematic with
// zone pressure indicators, manifold status and cylinder levels. Hospital vertical.
import React, { useState, useMemo, useEffect } from 'react'
import { Icon } from '../../lib.jsx'
import { useTwin } from '../../hub/twinState.jsx'

const GASES = [
  { id: 'o2', label: 'O\u2082', color: '#2563eb', icon: 'ti-vaccine' },
  { id: 'n2o', label: 'N\u2082O', color: '#7c3aed', icon: 'ti-flask' },
  { id: 'air', label: 'Med Air', color: '#0d9488', icon: 'ti-wind' },
  { id: 'vac', label: 'Vacuum', color: '#6b7280', icon: 'ti-arrows-minimize' },
]

const ZONES = [
  { id: 'or', label: 'OR Suite', icon: 'ti-cut', beds: 6 },
  { id: 'icu', label: 'ICU', icon: 'ti-heartbeat', beds: 12 },
  { id: 'general', label: 'General Wards', icon: 'ti-bed', beds: 40 },
  { id: 'ed', label: 'Emergency Dept', icon: 'ti-urgent', beds: 18 },
]

function genZonePressures() {
  const zp = {}
  ZONES.forEach(z => {
    zp[z.id] = {}
    GASES.forEach(g => {
      const nominal = g.id === 'o2' ? 4.1 : g.id === 'n2o' ? 3.8 : g.id === 'air' ? 4.5 : -0.5
      const jitter = (Math.random() - 0.5) * (g.id === 'vac' ? 0.15 : 0.4)
      zp[z.id][g.id] = +(nominal + jitter).toFixed(2)
    })
  })
  return zp
}

function genManifolds() {
  return GASES.filter(g => g.id !== 'vac').map(g => ({
    gasId: g.id,
    primaryPct: Math.round(30 + Math.random() * 65),
    backupPct: Math.round(70 + Math.random() * 30),
    status: Math.random() > 0.12 ? 'online' : 'switchover',
    lastSwitch: `${Math.floor(Math.random() * 48)}h ago`,
  }))
}

function pressureStatus(gasId, value) {
  if (gasId === 'vac') {
    return value > -0.3 ? 'critical' : value > -0.4 ? 'warn' : 'normal'
  }
  if (gasId === 'o2') return value < 3.2 ? 'critical' : value < 3.6 ? 'warn' : 'normal'
  if (gasId === 'n2o') return value < 3.0 ? 'critical' : value < 3.4 ? 'warn' : 'normal'
  return value < 3.5 ? 'critical' : value < 4.0 ? 'warn' : 'normal'
}

const PSTATUS_COLOR = { normal: 'var(--accent-green)', warn: 'var(--accent-amber)', critical: 'var(--accent-red)' }

export default function MedGasSchematic() {
  const { twin } = useTwin()
  const [pressures, setPressures] = useState(genZonePressures)
  const [manifolds, setManifolds] = useState(genManifolds)
  const [selectedGas, setSelectedGas] = useState('o2')
  const [selectedZone, setSelectedZone] = useState(null)

  const live = twin?.latest || {}

  // drift pressures
  useEffect(() => {
    const iv = setInterval(() => {
      setPressures(prev => {
        const next = {}
        for (const zid of Object.keys(prev)) {
          next[zid] = {}
          for (const gid of Object.keys(prev[zid])) {
            const v = prev[zid][gid]
            const drift = (Math.random() - 0.5) * 0.08
            next[zid][gid] = +(v + drift).toFixed(2)
          }
        }
        return next
      })
      setManifolds(prev => prev.map(m => ({
        ...m,
        primaryPct: Math.max(0, Math.min(100, m.primaryPct - Math.random() * 0.5)),
        status: m.primaryPct < 15 ? 'switchover' : 'online',
      })))
    }, 2000)
    return () => clearInterval(iv)
  }, [])

  const alertCount = useMemo(() => {
    let count = 0
    for (const zid of Object.keys(pressures)) {
      for (const gid of Object.keys(pressures[zid])) {
        const st = pressureStatus(gid, pressures[zid][gid])
        if (st === 'critical') count++
      }
    }
    return count
  }, [pressures])

  // SVG schematic layout
  const W = 780, H = 360
  const zoneX = [100, 280, 460, 640]
  const manifoldY = 50
  const zoneY = 180
  const pipeY = 120

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title"><Icon n="ti-vaccine" /> Medical Gas Schematic</div>
          <div className="panel-subtitle">P&ID distribution -- manifold status, zone pressures and cylinder levels</div>
        </div>
        <div className="panel-actions">
          {alertCount > 0 && <span className="pill pill-red">{alertCount} alert(s)</span>}
          <span className="pill pill-green">LIVE</span>
        </div>
      </div>

      {/* Gas selector */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {GASES.map(g => (
          <button key={g.id} className={`pill ${selectedGas === g.id ? '' : 'pill-surface'}`}
            style={selectedGas === g.id ? { background: g.color, color: '#fff', cursor: 'pointer', border: 'none' } : { cursor: 'pointer', border: 'none' }}
            onClick={() => setSelectedGas(g.id)}>
            <Icon n={g.icon} /> {g.label}
          </button>
        ))}
      </div>

      {/* Schematic SVG */}
      <div className="card section-gap" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="netmap" style={{ position: 'relative', height: H }}>
          <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
            <defs>
              <marker id="arrow" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto"><path d="M0,0 L6,2 L0,4Z" fill={GASES.find(g => g.id === selectedGas)?.color || '#999'} opacity="0.5" /></marker>
            </defs>

            {/* Main header pipe */}
            <line x1="40" y1={pipeY} x2={W - 40} y2={pipeY} stroke={GASES.find(g => g.id === selectedGas)?.color || '#999'} strokeWidth="4" opacity="0.3" strokeLinecap="round" />
            <line x1="40" y1={pipeY} x2={W - 40} y2={pipeY} stroke={GASES.find(g => g.id === selectedGas)?.color || '#999'} strokeWidth="2" strokeDasharray="4 4" className="netmap-flash" strokeLinecap="round" />

            {/* Manifold source */}
            <rect x="20" y={manifoldY - 15} width="60" height="30" rx="6" fill={GASES.find(g => g.id === selectedGas)?.color || '#999'} opacity="0.15" stroke={GASES.find(g => g.id === selectedGas)?.color || '#999'} strokeWidth="1" />
            <text x="50" y={manifoldY + 3} textAnchor="middle" fontSize="9" fill="var(--text)" fontWeight="600">Manifold</text>
            <line x1="50" y1={manifoldY + 15} x2="50" y2={pipeY} stroke={GASES.find(g => g.id === selectedGas)?.color || '#999'} strokeWidth="2" markerEnd="url(#arrow)" opacity="0.5" />

            {/* Zone drops */}
            {ZONES.map((z, i) => {
              const x = zoneX[i]
              const p = pressures[z.id]?.[selectedGas] ?? 0
              const st = pressureStatus(selectedGas, p)
              const isSelected = selectedZone === z.id
              return (
                <g key={z.id} style={{ cursor: 'pointer' }} onClick={() => setSelectedZone(isSelected ? null : z.id)}>
                  {/* drop pipe */}
                  <line x1={x} y1={pipeY} x2={x} y2={zoneY - 20} stroke={GASES.find(g => g.id === selectedGas)?.color || '#999'} strokeWidth="2" markerEnd="url(#arrow)" opacity="0.5" />

                  {/* zone box */}
                  <rect x={x - 55} y={zoneY - 20} width="110" height="90" rx="10" fill={isSelected ? 'rgba(124,58,237,.08)' : 'var(--surface2)'} stroke={isSelected ? 'var(--brand)' : 'var(--border)'} strokeWidth={isSelected ? 2 : 1} />

                  {/* zone label */}
                  <text x={x} y={zoneY + 2} textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--text)">{z.label}</text>
                  <text x={x} y={zoneY + 16} textAnchor="middle" fontSize="9" fill="var(--muted)">{z.beds} outlets</text>

                  {/* pressure indicator */}
                  <circle cx={x} cy={zoneY + 40} r="16" fill={PSTATUS_COLOR[st]} opacity="0.15" stroke={PSTATUS_COLOR[st]} strokeWidth="1.5" />
                  <text x={x} y={zoneY + 44} textAnchor="middle" fontSize="10" fontWeight="700" fill={PSTATUS_COLOR[st]}>{selectedGas === 'vac' ? p.toFixed(1) : p.toFixed(1)}</text>
                  <text x={x} y={zoneY + 57} textAnchor="middle" fontSize="7.5" fill="var(--muted)">{selectedGas === 'vac' ? 'kPa' : 'bar'}</text>

                  {st === 'critical' && <circle cx={x} cy={zoneY + 40} r="20" fill="none" stroke={PSTATUS_COLOR[st]} strokeWidth="1" className="netmap-pulse" />}
                </g>
              )
            })}

            {/* Bottom legend area */}
            <text x={W / 2} y={H - 20} textAnchor="middle" fontSize="10" fill="var(--hint)">
              {GASES.find(g => g.id === selectedGas)?.label} Distribution -- {selectedGas === 'vac' ? 'vacuum (negative pressure)' : 'positive pressure supply'}
            </text>
          </svg>
        </div>
      </div>

      {/* Manifold + detail cards */}
      <div className="grid-2 section-gap">
        {/* Manifold status */}
        <div className="card">
          <div className="card-title"><Icon n="ti-cylinder" /> Manifold & Cylinders</div>
          <div className="event-list">
            {manifolds.map(m => {
              const gas = GASES.find(g => g.id === m.gasId)
              return (
                <div key={m.gasId} className="event-item">
                  <div className="event-icon" style={{ background: `${gas.color}18`, color: gas.color }}><Icon n={gas.icon} /></div>
                  <div className="event-body">
                    <div className="event-title">{gas.label} Manifold</div>
                    <div className="event-meta">
                      Primary: {Math.round(m.primaryPct)}% -- Backup: {Math.round(m.backupPct)}%
                      <span className={`pill ${m.status === 'online' ? 'pill-green' : 'pill-amber'}`} style={{ marginLeft: 6 }}>{m.status}</span>
                    </div>
                  </div>
                  <div className="event-time">{m.lastSwitch}</div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Zone detail (when selected) */}
        <div className="card">
          {selectedZone ? (() => {
            const z = ZONES.find(zn => zn.id === selectedZone)
            const zp = pressures[selectedZone] || {}
            return (
              <>
                <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span><Icon n={z.icon} /> {z.label}</span>
                  <button className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: 13 }} onClick={() => setSelectedZone(null)}><Icon n="ti-x" /></button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {GASES.map(g => {
                    const v = zp[g.id] ?? 0
                    const st = pressureStatus(g.id, v)
                    return (
                      <div key={g.id} className="kpibox">
                        <div className="l" style={{ color: g.color }}>{g.label}</div>
                        <div className="v" style={{ color: PSTATUS_COLOR[st] }}>
                          {v.toFixed(2)} <span style={{ fontSize: 11 }}>{g.id === 'vac' ? 'kPa' : 'bar'}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
                <div style={{ marginTop: 10, fontSize: 11, color: 'var(--muted)' }}>
                  {z.beds} active outlets -- last inspection 2h ago
                </div>
              </>
            )
          })() : (
            <div className="empty">Click a zone on the schematic to view all gas pressures and outlet status.</div>
          )}
        </div>
      </div>
    </div>
  )
}
