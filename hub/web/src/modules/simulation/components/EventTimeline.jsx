// EventTimeline.jsx — the engine's ACTUAL SimEvent stream.
//
// Not one row per cascade node: every node emits its own events (run started, phase,
// action, detection, decision, response, complete) and mapGraph places them all on one
// absolute clock. A 5-node railway cascade is ~25 real events. Rows past the playhead
// dim, so this reads as a live log while the cascade plays.

import React from 'react'
import { sevColor } from '../engine/severity.js'
import { useSim } from '../simState.jsx'

export default function EventTimeline() {
  const { graph, playhead } = useSim()
  if (!graph) return null

  return (
    <div className="sim-timeline">
      {graph.events.map(e => (
        <div key={e.id} className="sim-tl-row"
          style={{ borderLeftColor: sevColor(e.sev), opacity: e.t <= playhead ? 1 : 0.35 }}>
          <div className="mono sim-tl-time">+{String(e.t).padStart(2, '0')}m</div>
          <div className="sim-tl-body">
            <div className="sim-tl-title">{e.title}</div>
            <div className="sim-tl-meta">
              <span className="sim-tl-node">{e.node}</span>
              <span className="sim-tl-type mono">{e.type}</span>
              {e.message && <span className="sim-tl-msg">{e.message}</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
