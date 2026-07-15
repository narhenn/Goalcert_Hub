// ImpactBars.jsx — quantified impact dashboard.
//
// Estimated money + domain-native units from the real cascade, split into total and the
// slice the operator could have PREVENTED (the engine's per-edge `preventable` flag). The
// figures are an estimate from a cost model — the cascade is real, the price tag is not a
// measurement — so it is labelled "estimated".
import React from 'react'
import { computeImpactModel, fmtMoney, fmtNum } from '../engine/impacts.js'

const red = 'var(--accent-red)'
const green = 'var(--accent-green)'
const muted = 'var(--muted)'

export default function ImpactBars({ graph }) {
  if (!graph) return null
  const m = computeImpactModel(graph)

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 11, color: muted, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          Estimated impact
        </span>
        <span className="pill pill-surface" style={{ fontSize: 9 }} title="Modelled estimate from the cascade, not a measurement">
          estimate
        </span>
      </div>

      {/* headline money */}
      <div style={{ fontSize: 30, fontWeight: 800, fontFamily: 'var(--display)', lineHeight: 1.1, marginTop: 4 }}>
        {fmtMoney(m.moneyTotal)}
        <span style={{ fontSize: 12, fontWeight: 600, color: muted, marginLeft: 8 }}>total</span>
      </div>

      {/* preventable split — the number that makes someone act */}
      {m.hasPreventable ? (
        <div style={{ marginTop: 10 }}>
          <div className="bar-track" style={{ height: 8 }}>
            <div className="bar-fill" style={{ width: `${m.prevPct}%`, background: red }} />
          </div>
          <div style={{ fontSize: 12.5, marginTop: 6 }}>
            <b style={{ color: red }}>{fmtMoney(m.moneyPrev)}</b> was preventable
            <span style={{ color: muted }}> — {m.prevPct}% of the total, avoidable if the fault had been contained.</span>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: m.contained ? green : muted, marginTop: 8, fontWeight: m.contained ? 600 : 400 }}>
          {m.contained
            ? 'Fault contained — no preventable loss.'
            : 'No avoidable loss — every consequence here is inherent to the fault.'}
        </div>
      )}

      {/* domain-native units */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 14 }}>
        {m.units.map((u, i) => (
          <div key={i} style={{
            flex: '1 1 40%', minWidth: 120, background: 'var(--surface-2, rgba(127,127,127,0.08))',
            borderRadius: 8, padding: '8px 10px',
          }}>
            <div style={{ fontSize: 17, fontWeight: 700, fontFamily: 'var(--display)', color: u.neg ? red : undefined }}>
              {u.neg ? '−' : ''}{fmtNum(u.value)}{u.suffix || ''}
            </div>
            <div style={{ fontSize: 10.5, color: muted, marginTop: 1 }}>{u.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
