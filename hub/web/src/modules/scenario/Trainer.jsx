// Trainer.jsx — "Train with AI": an interactive guided-repair simulator. Perform the
// procedure steps in the right order (safety isolation first); skipping or re-ordering
// carries realistic consequences. Machine health recovers as you work correctly; you
// get scored at the end. A Scenario Engine capability (training + certification).
import React, { useMemo, useState } from 'react'
import { Icon } from '../../lib.jsx'
import { useTwin } from '../../hub/twinState.jsx'
import { useAudit } from '../../hub/audit.jsx'
import { faultsFor } from '../../hub/util.js'
import { stubProcedure } from '../../aiStubs.js'

export default function Trainer() {
  const { active } = useTwin()
  const { log } = useAudit()
  const faults = faultsFor(active.domain)
  const [faultId, setFaultId] = useState(faults[0]?.id || '')
  const [proc, setProc] = useState(null)
  const [done, setDone] = useState([])
  const [violations, setViolations] = useState([])
  const [finished, setFinished] = useState(false)

  const start = () => {
    const f = faults.find(x => x.id === faultId)
    setProc(stubProcedure({ domain: active.domain, machineName: active.name, fault: faultId, title: f?.label }))
    setDone([]); setViolations([]); setFinished(false)
  }

  const total = proc?.steps.length || 0
  // health starts degraded, recovers as correct (non-violating) steps are performed
  const health = proc ? Math.min(0.98, 0.35 + (done.length / total) * 0.63 - violations.length * 0.06) : 0

  const canDo = (step) => (step.requires || []).every(r => done.includes(r))
  const nextId = proc?.steps.find(s => !done.includes(s.id))?.id

  const perform = (step) => {
    if (done.includes(step.id)) return
    if (!canDo(step)) { setViolations(v => [...v, { id: step.id, why: step.wrong_order_consequence }]); return }
    const nd = [...done, step.id]
    setDone(nd)
    if (nd.length === total) {
      setFinished(true)
      log('scenario', 'train', `Completed training — ${proc.title}`, `${violations.length} violation(s)`)
    }
  }
  const skip = (step) => {
    if (done.includes(step.id)) return
    setViolations(v => [...v, { id: step.id, why: step.skip_consequence }])
  }

  const grade = violations.length === 0 ? 'A · flawless' : violations.length <= 2 ? 'B · minor slips' : 'C · unsafe order'

  if (!proc) {
    return (
      <div className="card">
        <div className="card-title"><Icon n="ti-school" /> Interactive training</div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 14 }}>
          Pick a fault to drill. You'll perform the guided repair on {active.name} step-by-step — perform them in order,
          isolate before touching anything, and watch health recover. You're scored at the end.</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <select className="select" style={{ width: 'auto', minWidth: 200 }} value={faultId} onChange={e => setFaultId(e.target.value)}>
            {faults.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
          <button className="btn btn-primary" onClick={start} disabled={!faultId}><Icon n="ti-player-play" /> Start training</button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="grid-2 section-gap" style={{ gap: 12 }}>
        <div className="card kpi"><div className="card-label">Machine health</div>
          <div className="tr-gauge" style={{ marginTop: 8 }}>
            <i style={{ width: `${Math.round(health * 100)}%`,
              background: health > 0.6 ? 'var(--accent-green)' : health > 0.4 ? 'var(--accent-amber)' : 'var(--accent-red)' }} />
          </div>
          <div className="card-change" style={{ marginTop: 6 }}>{Math.round(health * 100)}% · recovers as you work</div></div>
        <div className="card kpi"><div className="card-label">Progress</div>
          <div className="card-value">{done.length}/{total}</div>
          <div className="card-change" style={{ color: violations.length ? 'var(--accent-red)' : 'var(--accent-green)' }}>
            {violations.length} violation(s)</div></div>
      </div>

      <div className="card">
        <div className="card-title"><Icon n="ti-list-check" /> {proc.title}</div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 14 }}>{proc.summary.replace(/\*\*/g, '')}</div>
        {proc.steps.map((s, i) => {
          const isDone = done.includes(s.id)
          const isNext = s.id === nextId
          const blocked = !canDo(s) && !isDone
          const violated = violations.some(v => v.id === s.id)
          return (
            <div key={s.id} className={`tr-step ${isDone ? 'done' : ''} ${isNext ? 'next' : ''} ${blocked ? 'blocked' : ''} ${violated ? 'violated' : ''}`}>
              <span className="tr-num">{isDone ? <Icon n="ti-check" /> : i + 1}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                  {s.title}{s.safety && <span className="pill pill-red" style={{ fontSize: 9 }}>SAFETY</span>}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 3, lineHeight: 1.5 }}>{s.action}</div>
                {violated && <div style={{ fontSize: 11.5, color: 'var(--accent-red)', marginTop: 5 }}>
                  <Icon n="ti-alert-triangle" /> {violations.find(v => v.id === s.id)?.why}</div>}
                {!isDone && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button className="btn btn-primary" style={{ padding: '5px 12px' }} onClick={() => perform(s)}>Perform</button>
                    <button className="btn" style={{ padding: '5px 12px' }} onClick={() => skip(s)}>Skip</button>
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {finished && (
          <div style={{ marginTop: 14, padding: '16px 18px', borderRadius: 12,
            background: 'rgba(22,163,74,.05)', border: '1px solid rgba(22,163,74,.25)' }}>
            <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 16, marginBottom: 4 }}>
              <Icon n="ti-certificate" style={{ color: 'var(--accent-green)' }} /> Training complete — Grade {grade}</div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{proc.success_criteria}</div>
            <button className="btn" style={{ marginTop: 12 }} onClick={start}><Icon n="ti-refresh" /> Retry</button>
          </div>
        )}
      </div>
    </div>
  )
}
