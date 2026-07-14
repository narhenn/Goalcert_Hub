// NodeInspector.jsx — drill into one node of the cascade.
//
// A cascade node is not a drawing: it is a full scenario RUN, with its own events, KPIs,
// objectives and (for fault nodes) a certification record. This surfaces that.

import React from 'react'
import { Icon } from '../../../lib.jsx'
import { useSim } from '../simState.jsx'
import { sevColor, sevName, sevPill, categoryMeta } from '../engine/severity.js'

export default function NodeInspector() {
  const { graph, selectedId } = useSim()

  if (!graph) return null
  if (!selectedId || !graph.nodes[selectedId]) {
    return <div className="empty">Click any node in the cascade to inspect its run.</div>
  }

  const n = graph.nodes[selectedId]
  const cat = categoryMeta(n.category)
  const incoming = graph.edges.filter(e => e.to === n.id)
  const outgoing = graph.edges.filter(e => e.from === n.id)
  const fired = incoming[0]
  const isFault = n.kind === 'fault'

  return (
    <div>
      <div className="sim-insp-head">
        <span className="sim-insp-dot" style={{ background: sevColor(n.sev) }} />
        <div className="sim-insp-title">{n.label}</div>
      </div>

      <div className="sim-insp-pills">
        <span className={`pill ${sevPill(n.sev)}`}>{sevName(n.sev)}</span>
        <span className="pill pill-surface">{isFault ? 'FAULT' : 'CONSEQUENCE'}</span>
        <span className="pill pill-surface" style={{ color: cat.color }}>{cat.label}</span>
        {isFault && (
          <span className={`pill ${n.certified ? 'pill-green' : 'pill-red'}`}>
            {n.certified ? 'CONTAINED' : 'FAILED'}
          </span>
        )}
      </div>

      <Field label="Scenario id"><span className="mono sim-tiny">{n.scenarioId}</span></Field>

      <Field label="Cause">
        {incoming.length
          ? incoming.map(e => graph.nodes[e.from]?.label).filter(Boolean).join(', ')
          : 'Injected event — the root of the cascade.'}
      </Field>

      {fired && (
        <Field label="Why it fired"
          accent={fired.preventable ? 'var(--accent-red)' : 'var(--border2)'}>
          {fired.reason}
        </Field>
      )}

      <Field label="Timing">
        Fires at <b>+{n.t} min</b> · runs {n.durationMin} min · {n.eventCount} events
      </Field>

      <Field label="Downstream consequences">
        {outgoing.length
          ? outgoing.map(e => graph.nodes[e.to]?.label).filter(Boolean).join(', ')
          : 'Terminal outcome — the cascade ends here.'}
      </Field>

      {isFault && (
        <Field label="Engine KPIs">
          <div className="sim-kpi-list">
            <div><span>containment_rate</span><b className="mono">{n.kpis.containment_rate}</b></div>
            <div><span>detection_rate</span><b className="mono">{n.kpis.detection_rate}</b></div>
            <div><span>time_to_first_detection</span><b className="mono">{Math.round(n.kpis.time_to_first_detection_s || 0)}s</b></div>
            <div><span>mean_time_to_resolve</span><b className="mono">{Math.round(n.kpis.mean_time_to_resolve_s || 0)}s</b></div>
            <div><span>operator score</span><b className="mono">{n.scores.operator ?? '—'}</b></div>
          </div>
        </Field>
      )}

      {!!n.objectives.length && (
        <Field label="Objectives">
          {n.objectives.map((o, i) => (
            <div key={i} className="sim-obj">
              <Icon n={o.met ? 'ti-circle-check-filled' : 'ti-circle-x-filled'} />
              <span style={{ color: o.met ? 'var(--accent-green)' : 'var(--accent-red)' }} />
              {o.text}
            </div>
          ))}
        </Field>
      )}

      <Field label="Affected assets">{cat.assets}</Field>
      <Field label="Recommended intervention" accent="var(--brand)">{cat.intervention}</Field>
    </div>
  )
}

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
