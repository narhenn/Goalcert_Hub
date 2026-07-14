// ImpactBars.jsx — impact dashboard. Reuses the Hub's existing .bar-row/.bar-track/
// .bar-fill primitives, so it is visually identical to the bars elsewhere in Goalcert.
import React from 'react'
import { Icon } from '../../../lib.jsx'
import { computeImpacts, impactColor, IMPACT_KEYS } from '../engine/impacts.js'

export default function ImpactBars({ graph }) {
  if (!graph) return null
  const impacts = computeImpacts(graph)

  return (
    <div>
      {IMPACT_KEYS.map(({ key, icon }) => {
        const v = impacts[key] ?? 0
        const c = impactColor(v)
        return (
          <div className="bar-row" key={key}>
            <div className="bar-label">
              <span><Icon n={icon} /> {key}</span>
              <b style={{ color: c }}>{v}</b>
            </div>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: `${v}%`, background: c }} />
            </div>
          </div>
        )
      })}
    </div>
  )
}
