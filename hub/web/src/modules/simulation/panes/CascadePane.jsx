// CascadePane.jsx — the simulation result: the cascade, replayable, with the analysis.
import React, { useState } from 'react'
import { Icon } from '../../../lib.jsx'
import { useSim } from '../simState.jsx'
import CascadeGraph from '../components/CascadeGraph.jsx'
import Playbar from '../components/Playbar.jsx'
import EventTimeline from '../components/EventTimeline.jsx'
import ImpactBars from '../components/ImpactBars.jsx'
import RootCause from '../components/RootCause.jsx'
import Interventions from '../components/Interventions.jsx'
import NodeInspector from '../components/NodeInspector.jsx'
import CompareModal from '../components/CompareModal.jsx'

export default function CascadePane({ onGoBuild }) {
  const { graph, playhead, selectedId, setSelectedId } = useSim()
  const [compare, setCompare] = useState(false)

  if (!graph) {
    return (
      <div className="empty">
        <Icon n="ti-chart-dots-3" /> No run yet.
        <div style={{ marginTop: 10 }}>
          <button className="btn btn-primary" onClick={onGoBuild}>
            <Icon n="ti-player-play" /> Go to Builder
          </button>
        </div>
      </div>
    )
  }

  const T = graph.totals
  const contained = !!graph.root?.certified

  return (
    <div>
      <div className="grid-4 section-gap">
        <div className="card kpi">
          <div className="card-label">Fault contained</div>
          <div className="card-value" style={{ color: contained ? 'var(--accent-green)' : 'var(--accent-red)' }}>
            {contained ? 'Yes' : 'No'}
          </div>
          <div className="card-change">{T.certified_faults}/{T.fault_nodes} certified</div>
        </div>
        <div className="card kpi">
          <div className="card-label">Consequences</div>
          <div className="card-value">{T.downstream_consequences}</div>
          <div className="card-change">{T.max_depth} levels deep</div>
        </div>
        <div className="card kpi">
          <div className="card-label">Preventable</div>
          <div className="card-value" style={{ color: T.preventable_consequences ? 'var(--accent-red)' : 'var(--accent-green)' }}>
            {T.preventable_consequences}
          </div>
          <div className="card-change">
            {T.preventable_consequences ? 'avoidable if contained' : 'none — all inherent'}
          </div>
        </div>
        <div className="card kpi">
          <div className="card-label">Engine events</div>
          <div className="card-value">{graph.events.length}</div>
          <div className="card-change">readiness {graph.readiness}</div>
        </div>
      </div>

      <Playbar />

      <div className="sim-split section-gap">
        <div>
          <div className="card section-gap">
            <div className="card-title">
              <Icon n="ti-chart-dots-3" /> Cascade — cause → consequence
              <span className={`pill ${contained ? 'pill-green' : 'pill-red'}`}>
                {contained ? 'contained' : `${T.preventable_consequences} preventable`}
              </span>
            </div>
            <CascadeGraph graph={graph} playhead={playhead}
              selectedId={selectedId} onSelect={setSelectedId} />
          </div>

          <div className="card">
            <div className="card-title">
              <Icon n="ti-timeline-event" /> Live event timeline
              <span className="pill pill-surface">{graph.events.length} engine events</span>
            </div>
            <EventTimeline />
          </div>
        </div>

        <div>
          <div className="card section-gap">
            <div className="card-title"><Icon n="ti-chart-bar" /> Impact dashboard</div>
            <ImpactBars graph={graph} />
          </div>
          <div className="card section-gap">
            <div className="card-title"><Icon n="ti-crosshair" /> Root-cause analysis</div>
            <RootCause />
          </div>
          <div className="card section-gap">
            <div className="card-title"><Icon n="ti-bulb" /> Recommended interventions</div>
            <Interventions onCompare={() => setCompare(true)} />
          </div>
          <div className="card">
            <div className="card-title"><Icon n="ti-zoom-scan" /> Node inspector</div>
            <NodeInspector />
          </div>
        </div>
      </div>

      <CompareModal open={compare} onClose={() => setCompare(false)} />
    </div>
  )
}
