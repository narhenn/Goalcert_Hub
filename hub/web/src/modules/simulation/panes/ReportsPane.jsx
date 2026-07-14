// ReportsPane.jsx — the sponsor-facing readout of a run.
//
// Exec metrics, the cause→consequence chain, a risk matrix plotted from real nodes,
// recommendations from fired triggers, and the engine's own evidence chain. Plus a raw
// JSON export of the RunGraph, because a claim you can't audit isn't evidence.

import React from 'react'
import { Icon } from '../../../lib.jsx'
import { useSim } from '../simState.jsx'
import { runMetrics } from '../engine/impacts.js'
import { cascadeEnd, preventableEdges, edgePath } from '../engine/mapGraph.js'
import { sevColor, categoryMeta } from '../engine/severity.js'

const RISK_BG = [
  ['#f4f3f9', '#fdf3e4', '#fbeadf', '#fde8ec'],
  ['#f4f3f9', '#f7f1e2', '#fae7d6', '#fbdfe1'],
  ['#eaf5ee', '#f0f3e0', '#fae7d6', '#fae7d6'],
  ['#eaf5ee', '#eaf5ee', '#f0f3e0', '#fae7d6'],
]
const IMPACT_ROW = { low: 0, medium: 1, high: 2, critical: 3 }

export default function ReportsPane({ onGoBuild }) {
  const { graph } = useSim()

  if (!graph) {
    return (
      <div className="empty">
        <Icon n="ti-file-analytics" /> No run to report on yet.
        <div style={{ marginTop: 10 }}>
          <button className="btn btn-primary" onClick={onGoBuild}>
            <Icon n="ti-player-play" /> Go to Builder
          </button>
        </div>
      </div>
    )
  }

  const m = runMetrics(graph)
  const T = graph.totals
  const end = cascadeEnd(graph)
  const critical = Object.values(graph.nodes).filter(n => n.impact === 'critical').length
  const prev = preventableEdges(graph)
  const contained = !!graph.root?.certified

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(graph.raw, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${graph.scenarioId}.${graph.rootRunId.slice(0, 8)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  // risk matrix: impact_level (row) × how strongly it is caused (col)
  const cells = {}
  Object.values(graph.nodes).forEach(n => {
    const row = IMPACT_ROW[n.impact] ?? 0
    const causes = graph.edges.filter(e => e.to === n.id)
    const col = n.kind === 'fault'
      ? 3
      : Math.min(3, causes.some(e => !e.preventable) ? 3 : 1 + causes.length)
    ;(cells[`${row}|${col}`] = cells[`${row}|${col}`] || []).push(n)
  })

  // chain layout for the report SVG (compact version of the cascade)
  const cols = {}
  Object.values(graph.nodes).forEach(n => { (cols[n.depth] = cols[n.depth] || []).push(n) })
  const maxRows = Math.max(1, ...Object.values(cols).map(c => c.length))
  const chain = []
  Object.keys(cols).map(Number).forEach(d => {
    const col = cols[d], off = (maxRows - col.length) / 2
    col.forEach((n, i) => chain.push({
      ...n, cx: 8 + d * 182, cy: 10 + (i + off) * 58,
    }))
  })
  // reuse the cascade's edge routing so a column-skipping edge arcs BELOW the boxes
  // instead of being drawn straight through them (see edgePath).
  const pos = Object.fromEntries(chain.map(c => [c.id, { ...c, x: c.cx, y: c.cy, w: 166, h: 44 }]))
  const maxDepth = Math.max(0, ...chain.map(c => c.depth))
  const hasLong = graph.edges.some(e => {
    const a = pos[e.from], b = pos[e.to]
    return a && b && Math.abs(b.depth - a.depth) > 1
  })
  const svgW = Math.max(740, 8 + (maxDepth + 1) * 182)
  const svgH = Math.max(150, 10 + maxRows * 58 + (hasLong ? 56 : 0))

  return (
    <div>
      <div className="panel-header" style={{ marginBottom: 14 }}>
        <div>
          <div className="panel-subtitle" style={{ marginTop: 0 }}>
            <b>{graph.scenarioName}</b> · run <span className="mono">{graph.rootRunId.slice(0, 8)}</span>
            {' '}· readiness {graph.readiness} · {graph.config?.difficulty} · {T.total_nodes} nodes / {T.max_depth} deep
          </div>
        </div>
        <div className="panel-actions">
          <button className="btn" onClick={exportJson}><Icon n="ti-braces" /> Export run JSON</button>
        </div>
      </div>

      <div className="grid-4 section-gap">
        <Metric label="Fault contained" value={contained ? 'Yes' : 'No'}
          sub={`${m.certifiedRatio} faults certified`}
          color={contained ? 'var(--accent-green)' : 'var(--accent-red)'} />
        <Metric label="Time to resolve" value={`${m.mttr}s`} sub={`Detected at ${m.detectedAt}s`} />
        <Metric label="Consequences" value={T.downstream_consequences}
          sub={`${critical} critical · cascade ${end} min`}
          color={critical ? 'var(--accent-amber)' : undefined} />
        <Metric label="Preventable" value={T.preventable_consequences}
          sub={T.preventable_consequences ? 'Avoidable if contained' : 'None — all inherent'}
          color={T.preventable_consequences ? 'var(--accent-red)' : 'var(--accent-green)'} />
      </div>

      <div className="sim-report-grid section-gap">
        <div className="card">
          <div className="card-title"><Icon n="ti-sitemap" /> Root cause &amp; consequence chain</div>
          <div className="sim-chain-wrap">
            <svg viewBox={`0 0 ${svgW} ${svgH}`} width="100%" height={svgH}>
              {graph.edges.map((e, i) => {
                const a = pos[e.from], b = pos[e.to]
                if (!a || !b) return null
                return (
                  <path key={i} d={edgePath(a, b)} fill="none"
                    className={e.preventable ? 'sim-edge sim-edge-preventable' : 'sim-edge'}>
                    <title>{e.reason}</title>
                  </path>
                )
              })}
              {chain.map(n => (
                <g key={n.id}>
                  <rect x={n.cx} y={n.cy} width={166} height={44} rx={9}
                    fill="var(--surface)" stroke={sevColor(n.sev)} strokeWidth="1.5" />
                  <rect x={n.cx} y={n.cy} width={4} height={44} rx={2} fill={sevColor(n.sev)} />
                  <text x={n.cx + 14} y={n.cy + 19} className="sim-node-label">
                    {n.label.length > 20 ? n.label.slice(0, 19) + '…' : n.label}
                  </text>
                  <text x={n.cx + 14} y={n.cy + 34} className="sim-node-sub">
                    {n.kind === 'fault' ? 'root cause' : categoryMeta(n.category).label.toLowerCase()} · {n.impact}
                  </text>
                </g>
              ))}
            </svg>
          </div>
          <div className="legend">
            <span><i className="sim-legend-dash" /> preventable link</span>
            <span><i style={{ background: 'var(--border2)' }} /> inherent link</span>
          </div>
        </div>

        <div className="card">
          <div className="card-title"><Icon n="ti-grid-dots" /> Risk matrix
            <span className="pill pill-surface">impact × causation</span>
          </div>
          <div className="sim-risk">
            {[3, 2, 1, 0].map(r => [0, 1, 2, 3].map(c => {
              const hits = cells[`${r}|${c}`] || []
              return (
                <div className="sim-risk-cell" key={`${r}-${c}`}
                  style={{ background: RISK_BG[r][c] }}
                  title={hits.map(h => h.label).join(', ')}>
                  {hits.length
                    ? <span style={{ color: sevColor(hits[0].sev) }}>
                        {hits.length > 1 ? hits.length : '●'}
                      </span>
                    : null}
                </div>
              )
            }))}
          </div>
          <div className="sim-risk-axis">
            <span>likelihood of causation →</span>
            <span>↑ impact</span>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title"><Icon n="ti-bulb" /> Recommendations
            <span className="pill pill-surface">from fired triggers</span>
          </div>
          {prev.map((e, i) => (
            <div className="sim-rec" key={i}>
              <span className="sim-rec-num mono">{String(i + 1).padStart(2, '0')}</span>
              <div className="sim-rec-body">
                <div className="sim-rec-text">
                  Raise readiness so <b>{graph.nodes[e.from]?.label}</b> is contained — that alone
                  prevents <b>{graph.nodes[e.to]?.label}</b>.
                </div>
                <div className="sim-rec-why">
                  fired on <span className="mono">{e.condition}</span>
                </div>
              </div>
              <span className="pill pill-red">PREVENTABLE</span>
            </div>
          ))}
          {graph.edges.filter(e => !e.preventable).slice(0, 3).map((e, i) => (
            <div className="sim-rec" key={`inh-${i}`}>
              <span className="sim-rec-num mono">{String(prev.length + i + 1).padStart(2, '0')}</span>
              <div className="sim-rec-body">
                <div className="sim-rec-text">
                  Mitigate <b>{graph.nodes[e.to]?.label}</b> — an inherent consequence of
                  {' '}{graph.nodes[e.from]?.label} (+{e.delayMin} min lag).
                </div>
                <div className="sim-rec-why">Cannot be prevented, only absorbed.</div>
              </div>
              <span className="pill pill-amber">MITIGATE</span>
            </div>
          ))}
        </div>

        <div className="card">
          <div className="card-title"><Icon n="ti-shield-check" /> Evidence chain
            <span className="pill pill-surface">from the engine</span>
          </div>
          {(graph.root?.evidence || []).map((ev, i) => (
            <div className="sim-ev" key={i}>
              <Icon n="ti-shield-check" />
              <span>{ev}</span>
            </div>
          ))}
          {(graph.root?.objectives || []).map((o, i) => (
            <div className="sim-ev" key={`o-${i}`}>
              <Icon n={o.met ? 'ti-circle-check' : 'ti-circle-x'}
                style={{ color: o.met ? 'var(--accent-green)' : 'var(--accent-red)' }} />
              <span>{o.text} — <b>{o.met ? 'met' : 'NOT met'}</b></span>
            </div>
          ))}
          <div className="sim-ev">
            <Icon n="ti-fingerprint" />
            <span>
              <span className="mono sim-tiny">{graph.rootRunId}</span>
              <div className="sim-rec-why">
                Deterministic run id — the same inputs reproduce this exact cascade.
              </div>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value, sub, color }) {
  return (
    <div className="card kpi">
      <div className="card-label">{label}</div>
      <div className="card-value" style={color ? { color } : undefined}>{value}</div>
      <div className="card-change">{sub}</div>
    </div>
  )
}
