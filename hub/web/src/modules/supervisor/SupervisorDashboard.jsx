// SupervisorDashboard.jsx — team readiness heatmap + agentic recommendations.
//
// The supervisor sees: who is ready, who needs training, what the agentic
// engine recommends. One-tap actions: reassign, push training, open AR call.
import React, { useState, useMemo } from 'react'
import { Icon, domainMeta } from '../../lib.jsx'
import { useTwin } from '../../hub/twinState.jsx'
import { useAudit } from '../../hub/audit.jsx'
import { useLoop } from '../../hub/loopState.jsx'
import ReadinessGauge from '../frontline/ReadinessGauge.jsx'

// -- mocked team data (12 operators) --
const MOCK_TEAM = [
  { id: 'T-001', name: 'Alice Tan', role: 'Lead Technician', score: 92, status: 'on_asset', procedure: 'Routine Inspection', flowStep: 6, certDays: 12 },
  { id: 'T-002', name: 'Bob Lim', role: 'Operator', score: 61, status: 'in_training', procedure: 'Filter Replacement', flowStep: 3, certDays: 58 },
  { id: 'T-003', name: 'Carol Wu', role: 'Operator', score: 88, status: 'cleared', procedure: 'Calibration', flowStep: 8, certDays: 5 },
  { id: 'T-004', name: 'David Ng', role: 'Trainee', score: 45, status: 'in_training', procedure: 'Safety Induction', flowStep: 2, certDays: 0 },
  { id: 'T-005', name: 'Eve Ong', role: 'Operator', score: 78, status: 'on_asset', procedure: 'Bearing Check', flowStep: 7, certDays: 30 },
  { id: 'T-006', name: 'Frank Yeo', role: 'Lead Technician', score: 95, status: 'cleared', procedure: 'System Overhaul', flowStep: 8, certDays: 3 },
  { id: 'T-007', name: 'Grace Lee', role: 'Operator', score: 71, status: 'pending', procedure: 'Coolant Flush', flowStep: 0, certDays: 45 },
  { id: 'T-008', name: 'Henry Koh', role: 'Trainee', score: 38, status: 'in_training', procedure: 'LOTO Training', flowStep: 1, certDays: 0 },
  { id: 'T-009', name: 'Iris Tay', role: 'Operator', score: 84, status: 'on_asset', procedure: 'Pressure Test', flowStep: 6, certDays: 18 },
  { id: 'T-010', name: 'Jack Sim', role: 'Operator', score: 76, status: 'pending', procedure: 'Vibration Analysis', flowStep: 0, certDays: 52 },
  { id: 'T-011', name: 'Karen Chua', role: 'Lead Technician', score: 90, status: 'cleared', procedure: 'Fault Diagnosis', flowStep: 8, certDays: 8 },
  { id: 'T-012', name: 'Leo Tan', role: 'Trainee', score: 55, status: 'in_training', procedure: 'Basic Operations', flowStep: 4, certDays: 0 },
]

const STATUS_LABEL = { on_asset: 'On Asset', in_training: 'Training', cleared: 'Cleared', pending: 'Pending' }
const STATUS_COLOR = { on_asset: '#16a34a', in_training: '#2563eb', cleared: '#059669', pending: '#d97706' }

export default function SupervisorDashboard() {
  const { active } = useTwin()
  const audit = useAudit()
  const meta = domainMeta(active?.domain || 'edm-machine')
  const [actionLog, setActionLog] = useState([])

  // -- agentic recommendations --
  const recs = useMemo(() => {
    const r = []
    for (const op of MOCK_TEAM) {
      if (op.score < 65 && op.status !== 'in_training')
        r.push({ type: 'training', operator: op, reason: `Readiness ${op.score}% — below threshold. Push refresher training.` })
      if (op.certDays > 50)
        r.push({ type: 'cert', operator: op, reason: `Certification ${op.certDays} days old — nearing expiry. Schedule recertification.` })
      if (op.score > 90 && op.status === 'cleared')
        r.push({ type: 'positive', operator: op, reason: `Top performer — readiness ${op.score}%. Consider for lead role.` })
    }
    return r.slice(0, 5)
  }, [])

  const loop = useLoop()

  const doAction = (action, op) => {
    const msg = `${action}: ${op.name}`
    setActionLog(prev => [{ ts: new Date(), msg }, ...prev].slice(0, 10))
    audit.log('supervisor', action, msg)
    // one-tap actions feed the loop bus
    const emits = {
      reassign: ['assess', `Reassigned ${op.name}`, `Readiness ${op.score}% matched to a better-fit task.`],
      push_training: ['train', `Refresher pushed to ${op.name}`, `Readiness ${op.score}% — micro-lesson queued for next login.`],
      training: ['train', `Refresher pushed to ${op.name}`, `Readiness ${op.score}% below threshold — recommendation accepted.`],
      cert: ['assess', `Recertification scheduled — ${op.name}`, `Certification ${op.certDays} days old, nearing expiry.`],
      ar_call: ['assist', `AR call opened with ${op.name}`, 'Live session visible on the supervisor board.'],
      positive: ['improve', `${op.name} flagged for lead role`, `Top performer at ${op.score}% readiness.`],
    }
    const e = emits[action]
    if (e) loop.emit(e[0], { summary: e[1], detail: e[2], module: 'agentic', persona: 'supervisor' })
  }

  // -- KPIs --
  const avgScore = Math.round(MOCK_TEAM.reduce((a, t) => a + t.score, 0) / MOCK_TEAM.length)
  const onAsset = MOCK_TEAM.filter(t => t.status === 'on_asset').length
  const training = MOCK_TEAM.filter(t => t.status === 'in_training').length
  const cleared = MOCK_TEAM.filter(t => t.status === 'cleared').length

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">Team Readiness</div>
          <div className="panel-subtitle">Morning shift — {MOCK_TEAM.length} operators — {meta.label}</div>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Avg Readiness', value: `${avgScore}%`, color: avgScore >= 75 ? '#16a34a' : '#d97706' },
          { label: 'On Asset', value: onAsset, color: '#16a34a' },
          { label: 'In Training', value: training, color: '#2563eb' },
          { label: 'Cleared', value: cleared, color: '#059669' },
        ].map(k => (
          <div key={k.label} className="card" style={{ padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: k.color, fontFamily: 'var(--display)' }}>{k.value}</div>
            <div style={{ fontSize: 10, color: 'var(--hint)', textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Readiness heatmap */}
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>
          <Icon n="ti-users" /> Operator Readiness
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
          {MOCK_TEAM.map(op => {
            const scoreColor = op.score >= 80 ? '#16a34a' : op.score >= 60 ? '#d97706' : '#e11d48'
            return (
              <div key={op.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                borderRadius: 8, background: `${scoreColor}08`, border: `1px solid ${scoreColor}20` }}>
                <div style={{ width: 32, height: 32, borderRadius: 16, background: scoreColor,
                  color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700 }}>
                  {op.score}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{op.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--hint)' }}>{op.role} — <span style={{ color: STATUS_COLOR[op.status] }}>{STATUS_LABEL[op.status]}</span></div>
                </div>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button title="Reassign" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--hint)', fontSize: 14 }}
                    onClick={() => doAction('reassign', op)}><Icon n="ti-arrows-exchange" /></button>
                  <button title="Push training" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--hint)', fontSize: 14 }}
                    onClick={() => doAction('push_training', op)}><Icon n="ti-school" /></button>
                  <button title="Open AR call" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--hint)', fontSize: 14 }}
                    onClick={() => doAction('ar_call', op)}><Icon n="ti-headset" /></button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Agentic recommendations */}
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon n="ti-robot" /> Agentic Recommendations
          <span style={{ marginLeft: 'auto', fontSize: 10, color: meta.accent, fontWeight: 600 }}>
            {recs.length} suggestions
          </span>
        </div>
        {recs.map((rec, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
            borderBottom: i < recs.length - 1 ? '1px solid var(--border)' : 'none' }}>
            <Icon n={rec.type === 'training' ? 'ti-school' : rec.type === 'cert' ? 'ti-certificate' : 'ti-star'} />
            <div style={{ flex: 1, fontSize: 12 }}>
              <b>{rec.operator.name}</b> — {rec.reason}
            </div>
            <button style={{ background: meta.accent, color: '#fff', border: 'none', borderRadius: 6,
              padding: '4px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
              onClick={() => doAction(rec.type, rec.operator)}>
              Accept
            </button>
            <button style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6,
              padding: '4px 8px', fontSize: 11, cursor: 'pointer', color: 'var(--hint)' }}
              onClick={() => {}}>
              Dismiss
            </button>
          </div>
        ))}
      </div>

      {/* Action log */}
      {actionLog.length > 0 && (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>
            <Icon n="ti-history" /> Actions Taken This Shift
          </div>
          {actionLog.map((a, i) => (
            <div key={i} style={{ fontSize: 11, color: 'var(--muted)', padding: '4px 0',
              borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--hint)', fontFamily: 'var(--mono)' }}>
                {a.ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              {' '}{a.msg}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
