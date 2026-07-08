// MiniChart.jsx — a compact, dependency-free multi-series SVG line chart.
// Used by Prediction and Scenario to draw trajectory forecasts.
import React from 'react'

export default function MiniChart({ data = [], series = [], height = 150, redline, yLabel }) {
  if (!data.length || !series.length) return null
  const W = 460, H = height, padL = 34, padR = 10, padT = 10, padB = 20
  const xs = data.map((_, i) => i)
  const allVals = []
  for (const s of series) for (const d of data) { const v = d[s.key]; if (v != null && !isNaN(v)) allVals.push(v) }
  if (redline != null) allVals.push(redline)
  let min = Math.min(...allVals), max = Math.max(...allVals)
  if (min === max) { min -= 1; max += 1 }
  const pad = (max - min) * 0.08; min -= pad; max += pad
  const px = (i) => padL + (i / (xs.length - 1 || 1)) * (W - padL - padR)
  const py = (v) => padT + (1 - (v - min) / (max - min)) * (H - padT - padB)
  const line = (key) => data.map((d, i) => {
    const v = d[key]; if (v == null || isNaN(v)) return null
    return `${px(i)},${py(v)}`
  }).filter(Boolean).join(' ')

  const ticks = 3
  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="xMidYMid meet" style={{ display: 'block' }}>
        {Array.from({ length: ticks + 1 }).map((_, i) => {
          const v = min + (i / ticks) * (max - min)
          const y = py(v)
          return (
            <g key={i}>
              <line x1={padL} y1={y} x2={W - padR} y2={y} stroke="var(--border)" strokeWidth="1" />
              <text x={padL - 5} y={y + 3} textAnchor="end" fontSize="8" fill="var(--hint)" fontFamily="var(--mono)">
                {Math.abs(v) >= 100 ? Math.round(v) : v.toFixed(1)}</text>
            </g>
          )
        })}
        {redline != null && (
          <line x1={padL} y1={py(redline)} x2={W - padR} y2={py(redline)}
            stroke="var(--accent-red)" strokeWidth="1.2" strokeDasharray="4 3" opacity="0.8" />
        )}
        {series.map(s => (
          <polyline key={s.key} points={line(s.key)} fill="none" stroke={s.color}
            strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
        ))}
      </svg>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 6, paddingLeft: padL }}>
        {series.map(s => (
          <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: 'var(--muted)' }}>
            <span style={{ width: 10, height: 2.5, borderRadius: 2, background: s.color }} /> {s.label}
          </span>
        ))}
        {yLabel && <span style={{ fontSize: 10, color: 'var(--hint)', marginLeft: 'auto' }}>{yLabel}</span>}
      </div>
    </div>
  )
}
