// Interventions.jsx — recommendations derived from the edges the engine actually fired.
//
// A `preventable` edge is, by definition, an actionable recommendation: contain the
// parent and the child never happens. Anything else is inherent to the fault and can
// only be mitigated. We do not invent advice — we report what the cascade proves.

import React from 'react'
import { Icon } from '../../../lib.jsx'
import { useSim } from '../simState.jsx'
import { preventableEdges } from '../engine/mapGraph.js'
import { categoryMeta } from '../engine/severity.js'

export default function Interventions({ onCompare }) {
  const { graph } = useSim()
  if (!graph) return null

  const prev = preventableEdges(graph)
  const items = []

  prev.forEach(e => {
    const parent = graph.nodes[e.from], child = graph.nodes[e.to]
    if (!parent || !child) return
    items.push({
      tag: 'PREVENTABLE', pillClass: 'pill-red',
      body: <>Contain <b>{parent.label}</b> before <b>+{e.delayMin} min</b> and <b>{child.label}</b> never fires.</>,
      why: e.reason,
    })
  })

  if (!prev.length) {
    items.push({
      tag: 'CONTAINED', pillClass: 'pill-green',
      body: <>The fault was contained at readiness <b>{graph.readiness}</b> — no preventable branch fired.</>,
      why: `The ${graph.totals.downstream_consequences} remaining consequences are inherent to this fault and can only be mitigated.`,
    })
  }

  // The most severe inherent consequence is still worth calling out to mitigate.
  const inherent = graph.edges.filter(e => !e.preventable)
    .map(e => ({ e, child: graph.nodes[e.to] }))
    .filter(x => x.child)
    .sort((a, b) => b.child.sev - a.child.sev)[0]
  if (inherent) {
    const cat = categoryMeta(inherent.child.category)
    items.push({
      tag: 'MITIGATE', pillClass: 'pill-amber',
      body: <>Mitigate <b>{inherent.child.label}</b> — inherent, +{inherent.e.delayMin} min after its cause.</>,
      why: cat.intervention,
    })
  }

  return (
    <div>
      {items.map((it, i) => (
        <div className="sim-rec" key={i}>
          <span className="sim-rec-num mono">{String(i + 1).padStart(2, '0')}</span>
          <div className="sim-rec-body">
            <div className="sim-rec-text">{it.body}</div>
            <div className="sim-rec-why">{it.why}</div>
          </div>
          <span className={`pill ${it.pillClass}`}>{it.tag}</span>
        </div>
      ))}
      <button className="btn" style={{ marginTop: 10, width: '100%', justifyContent: 'center' }}
        onClick={onCompare}>
        <Icon n="ti-scale" /> Quantify: re-run at higher readiness
      </button>
    </div>
  )
}
