// LoopBoard.jsx — "The Loop", the shared dataflow surface every persona can open.
// Shows the full seven-stage loop, what data each stage produces and consumes,
// which personas own it, and the live event stream flowing through the bus.
import React, { useMemo, useState } from 'react'
import { Icon } from '../lib.jsx'
import { LOOP_STAGES, PERSONAS, PERSONA_ORDER, usePersona } from './personas.jsx'
import { useLoop } from './loopState.jsx'
import { MODULES } from './registry.jsx'
import { timeAgo } from './util.js'
import LoopFlow from './LoopFlow.jsx'

// which personas own each stage (derived from the persona registry)
const stageOwners = (stageId) => PERSONA_ORDER.filter(p => PERSONAS[p].stages.includes(stageId))

export default function LoopBoard() {
  const { persona } = usePersona()
  const { events, counts } = useLoop()
  const [filter, setFilter] = useState(null) // stage id or null

  const filtered = useMemo(
    () => (filter ? events.filter(e => e.stage === filter) : events),
    [events, filter])

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">The Loop</div>
          <div className="panel-subtitle">
            One data flow — every action generates data used elsewhere. Your stages are highlighted.
          </div>
        </div>
        {filter && (
          <div className="panel-actions">
            <button className="btn" onClick={() => setFilter(null)}>
              <Icon n="ti-x" /> Clear filter — {LOOP_STAGES.find(s => s.id === filter)?.label}
            </button>
          </div>
        )}
      </div>

      {/* the loop itself */}
      <div className="card section-gap" style={{ padding: '22px 18px' }}>
        <LoopFlow activeStages={persona?.stages || []} accent={persona?.accent}
          onStage={(id) => setFilter(f => (f === id ? null : id))} selected={filter} />
      </div>

      {/* stage detail cards */}
      <div className="lb-stages section-gap">
        {LOOP_STAGES.map(s => {
          const owners = stageOwners(s.id)
          const mine = persona?.stages.includes(s.id)
          return (
            <button key={s.id} className={`lb-stage ${mine ? 'mine' : ''} ${filter === s.id ? 'sel' : ''}`}
              style={mine ? { '--mc': persona.accent } : undefined}
              onClick={() => setFilter(f => (f === s.id ? null : s.id))}>
              <div className="lb-stage-head">
                <Icon n={s.icon} /><b>{s.label}</b>
                <span className="pill pill-surface" style={{ marginLeft: 'auto' }}>{counts[s.id] || 0}</span>
              </div>
              <div className="lb-stage-data">{s.data}</div>
              <div className="lb-stage-owners">
                {owners.map(p => (
                  <span key={p} className="lb-owner" title={PERSONAS[p].label}
                    style={{ '--mc': PERSONAS[p].accent, '--mc-soft': PERSONAS[p].accentSoft }}>
                    <Icon n={PERSONAS[p].icon} /> {PERSONAS[p].short}
                  </span>
                ))}
                {owners.length === 0 && <span className="hint" style={{ fontSize: 10.5 }}>platform-operated</span>}
              </div>
            </button>
          )
        })}
      </div>

      {/* live event stream */}
      <div className="card">
        <div className="card-title"><Icon n="ti-timeline-event" /> Loop events
          <span className="pill pill-surface">{filtered.length}</span>
          {filter && <span className="pill pill-purple">{LOOP_STAGES.find(s => s.id === filter)?.label}</span>}
        </div>
        {filtered.length === 0
          ? <div className="empty">No events {filter ? 'on this stage yet' : 'yet'} — run a shift flow, publish content or export evidence to light the loop up.</div>
          : (
            <div className="event-list">
              {filtered.slice(0, 14).map(e => {
                const stage = LOOP_STAGES.find(s => s.id === e.stage)
                const mod = MODULES[e.module]
                const who = e.persona ? PERSONAS[e.persona] : null
                return (
                  <div key={e.id} className="event-item">
                    <div className="event-icon" style={{ background: mod?.accentSoft || 'var(--surface2)', color: mod?.accent || 'var(--muted)' }}>
                      <Icon n={stage?.icon || 'ti-point'} />
                    </div>
                    <div className="event-body">
                      <div className="event-title">{e.summary}</div>
                      <div className="event-meta">{e.detail}</div>
                      <div style={{ display: 'flex', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                        <span className="pill pill-surface" style={{ fontSize: 9 }}>{stage?.label || e.stage}</span>
                        {mod && <span className="pill" style={{ fontSize: 9, background: mod.accentSoft, color: mod.accent }}>{mod.short}</span>}
                        {who && <span className="pill" style={{ fontSize: 9, background: who.accentSoft, color: who.accent }}>{who.short}</span>}
                      </div>
                    </div>
                    <div className="event-time">{timeAgo(e.ts)}</div>
                  </div>
                )
              })}
            </div>
          )}
      </div>
    </div>
  )
}
