// CompareModal.jsx — what-if, done honestly.
//
// The "intervention" is a SECOND REAL RUN on the engine at higher operator readiness. We
// do not synthesise an improved graph. The engine re-evaluates its own triggers and
// decides whether the preventable branch still fires — which is exactly the question the
// operator is asking. Both columns below are real engine output.

import React, { useEffect, useState } from 'react'
import { Icon } from '../../../lib.jsx'
import { useSim } from '../simState.jsx'
import { runMetrics } from '../engine/impacts.js'
import { cascadeEnd } from '../engine/mapGraph.js'
import { sevColor } from '../engine/severity.js'

const BUMP = 22   // the readiness uplift a training/staffing intervention buys

export default function CompareModal({ open, onClose }) {
  const { graph, runAt } = useSim()
  const [improved, setImproved] = useState(null)
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)

  const target = graph ? Math.min(100, graph.readiness + BUMP) : 0

  useEffect(() => {
    if (!open || !graph) return
    setImproved(null); setErr(null); setBusy(true)
    runAt(target)
      .then(setImproved)
      .catch(e => setErr(e.message || 'Engine error'))
      .finally(() => setBusy(false))
  }, [open, graph, target, runAt])

  if (!open || !graph) return null

  const A = runMetrics(graph)
  const B = improved ? runMetrics(improved) : null

  const rows = B ? [
    ['Cascade duration', `${cascadeEnd(graph)} min`, `${cascadeEnd(improved)} min`, 'down'],
    ['Downstream consequences', A.consequences, B.consequences, 'down'],
    ['Preventable consequences', A.preventable, B.preventable, 'down'],
    ['Faults contained', A.certifiedRatio, B.certifiedRatio, 'up'],
    ['Mean time to resolve', `${A.mttr}s`, `${B.mttr}s`, 'down'],
    ['Safety score', A.safety, B.safety, 'up'],
    ['Operator readiness', A.readiness, B.readiness, 'up'],
  ] : []

  return (
    <div className="sim-modal-scrim" onClick={onClose}>
      <div className="sim-modal" onClick={e => e.stopPropagation()}>
        <div className="sim-modal-head">
          <div>
            <div className="panel-title" style={{ fontSize: 18 }}>What-if comparison</div>
            <div className="panel-subtitle">
              Two real engine runs of <b>{graph.scenarioName}</b> — readiness {graph.readiness} vs {target}.
              Every number below comes from <span className="mono">POST /runs/graph</span>.
            </div>
          </div>
          <button className="btn btn-ghost" onClick={onClose}><Icon n="ti-x" /></button>
        </div>

        <div className="sim-modal-body">
          {busy && <div className="empty"><span className="spinner" /> Re-running on the engine at readiness {target}…</div>}
          {err && <div className="empty" style={{ color: 'var(--accent-red)' }}>Engine error — {err}</div>}

          {improved && (
            <>
              <div className="grid-2 section-gap">
                <MiniGraph title={`Readiness ${graph.readiness}`} icon="ti-alert-triangle"
                  color="var(--accent-red)" g={graph} />
                <MiniGraph title={`Readiness ${target}`} icon="ti-shield-check"
                  color="var(--accent-green)" g={improved} />
              </div>

              <div className="card">
                <div className="card-title"><Icon n="ti-scale" /> Outcome comparison</div>
                {rows.map(([label, a, b, dir]) => {
                  const na = parseFloat(a), nb = parseFloat(b)
                  const same = na === nb || String(a) === String(b)
                  const better = dir === 'down' ? nb < na : nb > na
                  const color = same ? 'var(--muted)' : better ? 'var(--accent-green)' : 'var(--accent-red)'
                  return (
                    <div className="sim-cmp-row" key={label}>
                      <div className="sim-cmp-label">{label}</div>
                      <div className="mono sim-cmp-a">{a}</div>
                      <Icon n="ti-arrow-right" />
                      <div className="mono sim-cmp-b" style={{ color }}>{b}</div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function MiniGraph({ title, icon, color, g }) {
  const nodes = Object.values(g.nodes).sort((a, b) => a.t - b.t)
  const avg = (nodes.reduce((a, n) => a + n.sev, 0) / Math.max(1, nodes.length)).toFixed(1)
  return (
    <div className="card">
      <div className="card-title"><Icon n={icon} /> <span style={{ color }}>{title}</span></div>
      <div className="sim-cmp-stats">
        <div><div className="card-label">Nodes</div><div className="card-value" style={{ fontSize: 22 }}>{nodes.length}</div></div>
        <div><div className="card-label">Avg severity</div><div className="card-value" style={{ fontSize: 22 }}>{avg}</div></div>
        <div><div className="card-label">Preventable</div><div className="card-value" style={{ fontSize: 22 }}>{g.totals.preventable_consequences}</div></div>
      </div>
      {nodes.map(n => (
        <div className="sim-cmp-bar" key={n.id}>
          <span className="sim-cmp-bar-label">{n.label}</span>
          <span className="sim-cmp-bar-track">
            <span style={{ width: `${n.sev * 20}%`, background: sevColor(n.sev) }} />
          </span>
        </div>
      ))}
    </div>
  )
}
