// BatteryHeatmap.jsx — 12x8 cell grid colored by voltage deviation, with
// click-to-inspect cell details and overall pack stats. EV vertical.
import React, { useState, useMemo, useEffect } from 'react'
import { Icon, HealthRing } from '../../lib.jsx'
import { useTwin } from '../../hub/twinState.jsx'

const ROWS = 8, COLS = 12, TOTAL = ROWS * COLS

function genCells() {
  const cells = []
  for (let i = 0; i < TOTAL; i++) {
    const row = Math.floor(i / COLS), col = i % COLS
    const nominalV = 3.7
    const deviation = (Math.random() - 0.5) * 0.6 // +/- 0.3V
    const voltage = +(nominalV + deviation).toFixed(3)
    const temp = +(28 + Math.random() * 12).toFixed(1)
    const soh = Math.max(60, Math.min(100, +(92 + (Math.random() - 0.5) * 16).toFixed(1)))
    const cycles = Math.round(200 + Math.random() * 800)
    const status = Math.abs(deviation) > 0.2 ? (Math.abs(deviation) > 0.25 ? 'critical' : 'warn') : 'normal'
    cells.push({ id: `C${row+1}-${col+1}`, row, col, voltage, temp, soh, cycles, deviation, status })
  }
  return cells
}

function cellColor(status, deviation) {
  if (status === 'critical') return '#e11d48'
  if (status === 'warn') return '#d97706'
  // gradient from green to teal based on absolute deviation
  const t = Math.min(1, Math.abs(deviation) / 0.2)
  const r = Math.round(22 + t * 20)
  const g = Math.round(163 - t * 50)
  const b = Math.round(74 + t * 30)
  return `rgb(${r},${g},${b})`
}

export default function BatteryHeatmap() {
  const { twin } = useTwin()
  const [cells, setCells] = useState(genCells)
  const [selected, setSelected] = useState(null)

  const live = twin?.latest || {}

  // drift cells over time
  useEffect(() => {
    const iv = setInterval(() => {
      setCells(prev => prev.map(c => {
        const dv = (Math.random() - 0.5) * 0.02
        const deviation = Math.max(-0.35, Math.min(0.35, c.deviation + dv))
        const voltage = +(3.7 + deviation).toFixed(3)
        const temp = +(Math.max(24, Math.min(55, c.temp + (Math.random() - 0.5) * 0.5))).toFixed(1)
        const status = Math.abs(deviation) > 0.2 ? (Math.abs(deviation) > 0.25 ? 'critical' : 'warn') : 'normal'
        return { ...c, voltage, temp, deviation, status }
      }))
    }, 2500)
    return () => clearInterval(iv)
  }, [])

  const stats = useMemo(() => {
    const temps = cells.map(c => c.temp)
    const voltages = cells.map(c => c.voltage)
    const sohs = cells.map(c => c.soh)
    return {
      critCount: cells.filter(c => c.status === 'critical').length,
      warnCount: cells.filter(c => c.status === 'warn').length,
      normalCount: cells.filter(c => c.status === 'normal').length,
      tempMin: Math.min(...temps).toFixed(1),
      tempMax: Math.max(...temps).toFixed(1),
      vMin: Math.min(...voltages).toFixed(3),
      vMax: Math.max(...voltages).toFixed(3),
      avgSoh: (sohs.reduce((a, b) => a + b, 0) / sohs.length).toFixed(1),
    }
  }, [cells])

  const packSoc = live['ev:stateOfCharge'] ?? 68
  const packSoh = live['ev:stateOfHealth'] ?? 94

  const cellSize = 42, gap = 3

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title"><Icon n="ti-battery-3" /> Battery Heatmap</div>
          <div className="panel-subtitle">{TOTAL}-cell pack -- voltage deviation and thermal monitoring</div>
        </div>
        <div className="panel-actions"><span className="pill pill-green">LIVE</span></div>
      </div>

      {/* Pack-level KPIs */}
      <div className="grid-4 section-gap">
        <div className="card kpi">
          <div className="card-label">Pack SoC</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <HealthRing value={packSoc / 100} size={52} stroke={5} />
            <div><div className="card-value" style={{ fontSize: 22 }}>{Math.round(packSoc)}%</div><div className="card-change">state of charge</div></div>
          </div>
        </div>
        <div className="card kpi"><div className="card-label">Pack SoH</div><div className="card-value" style={{ color: packSoh > 80 ? 'var(--accent-green)' : 'var(--accent-amber)' }}>{Math.round(packSoh)}%</div><div className="card-change">state of health</div></div>
        <div className="card kpi"><div className="card-label">Temp Range</div><div className="card-value">{stats.tempMin} - {stats.tempMax}<span style={{ fontSize: 13 }}> C</span></div><div className="card-change">min / max cell</div></div>
        <div className="card kpi"><div className="card-label">Cell Status</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <span className="pill pill-green">{stats.normalCount} OK</span>
            <span className="pill pill-amber">{stats.warnCount} warn</span>
            <span className="pill pill-red">{stats.critCount} crit</span>
          </div>
        </div>
      </div>

      <div className="grid-2 section-gap">
        {/* Heatmap grid */}
        <div className="card" style={{ overflow: 'auto' }}>
          <div className="card-title"><Icon n="ti-grid-dots" /> Cell Voltage Deviation</div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLS}, ${cellSize}px)`, gap: gap, justifyContent: 'center' }}>
            {cells.map(c => {
              const bg = cellColor(c.status, c.deviation)
              const isSel = selected?.id === c.id
              return (
                <div key={c.id} onClick={() => setSelected(c)} style={{
                  width: cellSize, height: cellSize, borderRadius: 6, background: bg,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', border: isSel ? '2px solid var(--text)' : '1px solid transparent',
                  opacity: isSel ? 1 : 0.85, fontSize: 8, color: '#fff', fontWeight: 600,
                  fontFamily: 'var(--mono)', transition: 'opacity .15s, border .15s',
                }}>
                  <span>{c.voltage.toFixed(2)}</span>
                  <span style={{ opacity: 0.7, fontSize: 7 }}>{c.temp} C</span>
                </div>
              )
            })}
          </div>
          {/* Legend */}
          <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 10, color: 'var(--muted)', justifyContent: 'center' }}>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: '#16a34a', marginRight: 3 }} />Normal</span>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: '#d97706', marginRight: 3 }} />Warning</span>
            <span><span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: '#e11d48', marginRight: 3 }} />Critical</span>
          </div>
        </div>

        {/* Cell inspector */}
        <div className="card">
          {selected ? (
            <>
              <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span><Icon n="ti-battery-charging" /> Cell {selected.id}</span>
                <button className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: 13 }} onClick={() => setSelected(null)}><Icon n="ti-x" /></button>
              </div>
              <div style={{ marginBottom: 10 }}>
                <span className={`pill ${selected.status === 'critical' ? 'pill-red' : selected.status === 'warn' ? 'pill-amber' : 'pill-green'}`}>
                  {selected.status === 'critical' ? 'CRITICAL' : selected.status === 'warn' ? 'WARNING' : 'NORMAL'}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div className="kpibox"><div className="l">Voltage</div><div className="v">{selected.voltage} <span style={{ fontSize: 11 }}>V</span></div></div>
                <div className="kpibox"><div className="l">Deviation</div><div className="v" style={{ color: Math.abs(selected.deviation) > 0.2 ? 'var(--accent-red)' : 'var(--accent-green)' }}>{selected.deviation > 0 ? '+' : ''}{(selected.deviation * 1000).toFixed(0)} <span style={{ fontSize: 11 }}>mV</span></div></div>
                <div className="kpibox"><div className="l">Temperature</div><div className="v" style={{ color: selected.temp > 40 ? 'var(--accent-red)' : 'var(--text)' }}>{selected.temp} <span style={{ fontSize: 11 }}>C</span></div></div>
                <div className="kpibox"><div className="l">SoH</div><div className="v" style={{ color: selected.soh < 80 ? 'var(--accent-amber)' : 'var(--accent-green)' }}>{selected.soh}%</div></div>
                <div className="kpibox"><div className="l">Cycle Count</div><div className="v">{selected.cycles}</div></div>
                <div className="kpibox"><div className="l">Position</div><div className="v" style={{ fontSize: 15 }}>R{selected.row + 1} C{selected.col + 1}</div></div>
              </div>
              {selected.status === 'critical' && (
                <div style={{ marginTop: 12, padding: '8px 12px', borderRadius: 10, background: 'rgba(225,29,72,.06)', border: '1px solid rgba(225,29,72,.2)', fontSize: 12, color: 'var(--accent-red)' }}>
                  <Icon n="ti-alert-triangle" /> Cell voltage deviation exceeds 250mV threshold. Possible cell imbalance or early degradation. Schedule BMS inspection.
                </div>
              )}
            </>
          ) : (
            <div className="empty">Click any cell in the heatmap to inspect its voltage, temperature, state of health and cycle count.</div>
          )}
        </div>
      </div>

      {/* Voltage range bar */}
      <div className="card">
        <div className="card-title"><Icon n="ti-bolt" /> Pack Voltage Range</div>
        <div className="bar-row">
          <div className="bar-label"><span>Min {stats.vMin}V -- Max {stats.vMax}V</span><b>Avg {((parseFloat(stats.vMin) + parseFloat(stats.vMax)) / 2).toFixed(3)}V</b></div>
          <div className="bar-track" style={{ position: 'relative' }}>
            <div className="bar-fill" style={{ width: '100%', background: 'linear-gradient(90deg, var(--accent-green), var(--accent-teal))' }} />
          </div>
        </div>
      </div>
    </div>
  )
}
