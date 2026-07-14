// RootCause.jsx — why the cascade happened, in the engine's own words.
//
// Everything here is read from the run: the clearance record (certified + its evidence
// strings), the root node's KPIs, and the preventable edge. The "earliest preventable
// moment" is not inferred by us — it is the edge the engine marked preventable, and its
// `reason` string is the engine's explanation.

import React from 'react'
import { useSim } from '../simState.jsx'
import { preventableEdges } from '../engine/mapGraph.js'

function Field({ label, children, accent }) {
  return (
    <div className="sim-field">
      <div className="sim-field-label">{label}</div>
      <div className="sim-field-value" style={accent ? { borderLeft: `3px solid ${accent}` } : undefined}>
        {children}
      </div>
    </div>
  )
}

export default function RootCause() {
  const { graph, meta, conditions, readiness } = useSim()
  if (!graph) return null

  const root = graph.root
  const k = root?.kpis || {}
  const prev = preventableEdges(graph)[0]
  const contained = !!root?.certified
  const worst = Object.values(graph.nodes).find(n => n.impact === 'critical')
  const readinessEvidence = (root?.evidence || []).find(e => /readiness/i.test(e))
  const condLabels = meta.conditions.filter(c => conditions.includes(c.id)).map(c => c.label)

  return (
    <div>
      <Field label="Root cause">{graph.scenarioName}</Field>

      <Field label="Contributing factors">
        {condLabels.length
          ? <>{condLabels.join(', ')} — applied as a readiness penalty ({readiness} → {graph.readiness})</>
          : <>Nominal conditions (readiness {graph.readiness})</>}
      </Field>

      <Field label="Containment"
        accent={contained ? 'var(--accent-green)' : 'var(--accent-red)'}>
        <b>{contained ? 'CONTAINED' : 'NOT CONTAINED'}</b> — containment_rate {k.containment_rate}
        , detected in {Math.round(k.time_to_first_detection_s || 0)}s
        , resolved in {Math.round(k.mean_time_to_resolve_s || 0)}s
      </Field>

      {worst && (
        <Field label="Worst outcome reached">
          {worst.label} — at +{worst.t} min
        </Field>
      )}

      <Field label="Earliest preventable moment"
        accent={prev ? 'var(--accent-green)' : 'var(--border2)'}>
        {prev
          ? <>{graph.scenarioName} — {prev.reason}</>
          : <>No preventable branch fired. The remaining consequences are inherent (<span className="mono">always</span>) triggers of this fault — they can be mitigated, not prevented.</>}
      </Field>

      {readinessEvidence && (
        <Field label="Engine evidence">{readinessEvidence}</Field>
      )}
    </div>
  )
}
