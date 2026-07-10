// LoopFlow.jsx — the seven-stage loop, rendered. The signature dataflow visual:
// Assess → Train → Simulate → Deploy → Assist → Observe → Improve ↺
// Highlights the stages the current persona owns, shows live event counts from
// the loop bus, and pulses a node when a fresh event lands on it.
import React, { useEffect, useState } from 'react'
import { Icon } from '../lib.jsx'
import { LOOP_STAGES } from './personas.jsx'
import { useLoop } from './loopState.jsx'

export default function LoopFlow({ activeStages = [], accent = 'var(--brand)', compact = false, onStage, selected }) {
  const { counts, lastEvent } = useLoop()
  const active = new Set(activeStages)
  const [pulseStage, setPulseStage] = useState(null)

  // pulse the node a fresh event just landed on
  useEffect(() => {
    if (!lastEvent || Date.now() - lastEvent.ts > 4000) return
    setPulseStage(lastEvent.stage)
    const t = setTimeout(() => setPulseStage(null), 1600)
    return () => clearTimeout(t)
  }, [lastEvent])

  return (
    <div className={`lf ${compact ? 'compact' : ''}`} style={{ '--lf-accent': accent }}>
      {LOOP_STAGES.map((s, i) => (
        <React.Fragment key={s.id}>
          <button
            className={`lf-node ${active.has(s.id) ? 'on' : ''} ${pulseStage === s.id ? 'pulse' : ''} ${selected === s.id ? 'sel' : ''}`}
            onClick={onStage ? () => onStage(s.id) : undefined}
            style={{ cursor: onStage ? 'pointer' : 'default' }}
            title={`${s.label} — ${s.desc}`}>
            <span className="lf-ic"><Icon n={s.icon} />
              {counts[s.id] > 0 && <span className="lf-count">{counts[s.id]}</span>}
            </span>
            <span className="lf-label">{s.label}</span>
            {!compact && <span className="lf-desc">{s.desc}</span>}
          </button>
          {i < LOOP_STAGES.length - 1 && <span className="lf-arrow"><Icon n="ti-chevron-right" /></span>}
        </React.Fragment>
      ))}
      <span className="lf-return" title="Improve feeds Assess — the loop closes">
        <Icon n="ti-arrow-back-up" /> closes the loop
      </span>
    </div>
  )
}
