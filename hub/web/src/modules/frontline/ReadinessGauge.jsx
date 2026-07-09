// ReadinessGauge.jsx — big readiness score ring with optional breakdown.
import React from 'react'

export default function ReadinessGauge({ score, breakdown, size = 120, showBreakdown = false }) {
  const r = (size - 10) / 2
  const circ = 2 * Math.PI * r
  const v = Math.max(0, Math.min(100, score || 0)) / 100
  const offset = circ * (1 - v)
  const color = score >= 80 ? '#16a34a' : score >= 60 ? '#d97706' : '#e11d48'
  const label = score >= 80 ? 'Ready' : score >= 60 ? 'Developing' : 'At Risk'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--border, #e5e7eb)" strokeWidth={8} />
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={8}
            strokeDasharray={circ} strokeDashoffset={offset}
            strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`}
            style={{ transition: 'stroke-dashoffset .6s ease' }} />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontFamily: 'var(--display, Poppins)', fontSize: size * 0.28, fontWeight: 700, color }}>
            {Math.round(score)}
          </span>
          <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '.08em',
            color: 'var(--hint, #9aa1ad)', fontWeight: 600 }}>
            {label}
          </span>
        </div>
      </div>

      {showBreakdown && breakdown && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', fontSize: 11,
          color: 'var(--muted, #6b7280)' }}>
          <span>LMS Completion</span><b style={{ textAlign: 'right' }}>{breakdown.lmsCompletion}%</b>
          <span>XR Sim Score</span><b style={{ textAlign: 'right' }}>{breakdown.xrSimScore}%</b>
          <span>Cert Freshness</span><b style={{ textAlign: 'right' }}>{breakdown.certFreshness}%</b>
          <span>Incident Penalty</span><b style={{ textAlign: 'right', color: breakdown.incidentPenalty > 0 ? '#e11d48' : undefined }}>
            {breakdown.incidentPenalty > 0 ? `-${breakdown.incidentPenalty}` : '0'}
          </b>
        </div>
      )}
    </div>
  )
}
