// CascadeGraph.jsx — the cause → consequence DAG the engine produced.
//
// Nodes are coloured by severity; an edge the engine flagged `preventable` is drawn as
// an animated dashed line, because that edge is the whole point: it is a consequence
// that would not exist had the operator contained the fault. Nodes past the playhead are
// dimmed, so scrubbing the timeline replays the cascade unfolding.

import React from 'react'
import { sevColor, sevName, categoryMeta } from '../engine/severity.js'
import { graphExtent, edgePath } from '../engine/mapGraph.js'

const clip = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + '…' : s || '')

export default function CascadeGraph({ graph, playhead, selectedId, onSelect }) {
  if (!graph) return null
  const { w, h } = graphExtent(graph)

  // Size the canvas to the cascade rather than to a fixed box. A linear chain (one node
  // per column) needs a short strip; a wide fan needs depth. A fixed height letterboxes
  // the former into a field of empty grid.
  const height = Math.min(460, Math.max(180, h + 46))   // +46 leaves room for the legend

  return (
    <div className="sim-canvas" style={{ height }}>
      <svg viewBox={`0 0 ${w} ${h + 46}`} width="100%" height="100%"
        preserveAspectRatio="xMidYMid meet">
        {graph.edges.map((e, i) => {
          const a = graph.nodes[e.from], b = graph.nodes[e.to]
          if (!a || !b) return null
          const dim = b.t > playhead
          return (
            <path
              key={i} d={edgePath(a, b)} fill="none"
              className={e.preventable ? 'sim-edge sim-edge-preventable' : 'sim-edge'}
              opacity={dim ? 0.2 : 1}
            >
              <title>{e.reason}</title>
            </path>
          )
        })}

        {Object.values(graph.nodes).map(n => {
          const color = sevColor(n.sev)
          const dim = n.t > playhead
          const sel = selectedId === n.id
          const cat = categoryMeta(n.category)
          return (
            <g key={n.id} className="sim-node" opacity={dim ? 0.28 : 1}
              onClick={() => onSelect && onSelect(n.id)}>
              <title>{`${n.label}\n${cat.label} · ${sevName(n.sev)} · fires at +${n.t} min`}</title>
              <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={10}
                fill="var(--surface)" stroke={sel ? 'var(--brand)' : color}
                strokeWidth={sel ? 2.4 : 1.6} />
              <rect x={n.x} y={n.y} width={4} height={n.h} rx={2} fill={color} />
              {n.kind === 'fault' && (
                <circle cx={n.x + n.w - 12} cy={n.y + 12} r={4}
                  fill={n.certified ? 'var(--accent-green)' : 'var(--accent-red)'} />
              )}
              <text x={n.x + 16} y={n.y + 21} className="sim-node-label">{clip(n.label, 21)}</text>
              <text x={n.x + 16} y={n.y + 37} className="sim-node-sub">
                {sevName(n.sev).toUpperCase()} · +{n.t}m
              </text>
            </g>
          )
        })}
      </svg>

      <div className="sim-legend">
        {[1, 2, 3, 4, 5].map(s => (
          <span key={s}><i style={{ background: sevColor(s) }} />{sevName(s)}</span>
        ))}
        <span className="sim-legend-sep" />
        <span><i className="sim-legend-dash" />preventable</span>
      </div>
    </div>
  )
}
