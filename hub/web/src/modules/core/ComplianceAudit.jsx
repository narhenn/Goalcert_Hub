// ComplianceAudit.jsx — "Show every operator certified on procedure X in period Y"
//
// One-click defensible evidence. Evidence chain: LMS completion + XR score +
// simulation result + AR interaction + digital twin logs. Export to CSV/PDF.
import React, { useState, useMemo } from 'react'
import { Icon } from '../../lib.jsx'
import { useAudit } from '../../hub/audit.jsx'
import { useLoop } from '../../hub/loopState.jsx'

// -- mocked compliance records (in production: query from all 4 services) --
const MOCK_RECORDS = [
  { id: 'CR-001', operator: 'Alice Tan', operatorId: 'T-001', role: 'Lead Technician', procedure: 'EDM Routine Inspection', procedureId: 'EDM-01',
    lms: 95, xrScore: 88, simPassed: true, simAttempts: 1, arSteps: 5, twinHealth: 0.91,
    clearanceTs: '2026-07-08T09:32:00Z', signedBy: 'Alice Tan', certExpiry: '2027-01-08', status: 'valid' },
  { id: 'CR-002', operator: 'Bob Lim', operatorId: 'T-002', role: 'Operator', procedure: 'Filter Replacement', procedureId: 'EDM-02',
    lms: 72, xrScore: 65, simPassed: false, simAttempts: 3, arSteps: 5, twinHealth: 0.74,
    clearanceTs: null, signedBy: null, certExpiry: null, status: 'failed' },
  { id: 'CR-003', operator: 'Carol Wu', operatorId: 'T-003', role: 'Operator', procedure: 'Calibration', procedureId: 'EDM-04',
    lms: 90, xrScore: 82, simPassed: true, simAttempts: 1, arSteps: 5, twinHealth: 0.88,
    clearanceTs: '2026-07-07T14:15:00Z', signedBy: 'Carol Wu', certExpiry: '2027-01-07', status: 'valid' },
  { id: 'CR-004', operator: 'David Ng', operatorId: 'T-004', role: 'Trainee', procedure: 'Safety Induction', procedureId: 'MRT-01',
    lms: 60, xrScore: 48, simPassed: false, simAttempts: 2, arSteps: 3, twinHealth: 0.65,
    clearanceTs: null, signedBy: null, certExpiry: null, status: 'in_progress' },
  { id: 'CR-005', operator: 'Eve Ong', operatorId: 'T-005', role: 'Operator', procedure: 'PSD Door Cycle Check', procedureId: 'MRT-01',
    lms: 88, xrScore: 79, simPassed: true, simAttempts: 1, arSteps: 5, twinHealth: 0.82,
    clearanceTs: '2026-07-09T08:45:00Z', signedBy: 'Eve Ong', certExpiry: '2027-01-09', status: 'valid' },
  { id: 'CR-006', operator: 'Frank Yeo', operatorId: 'T-006', role: 'Lead Technician', procedure: 'Third Rail Resistance Test', procedureId: 'MRT-02',
    lms: 96, xrScore: 91, simPassed: true, simAttempts: 1, arSteps: 5, twinHealth: 0.95,
    clearanceTs: '2026-07-08T11:20:00Z', signedBy: 'Frank Yeo', certExpiry: '2027-01-08', status: 'valid' },
  { id: 'CR-007', operator: 'Grace Lee', operatorId: 'T-007', role: 'Operator', procedure: 'Charger Connector Inspection', procedureId: 'EV-01',
    lms: 84, xrScore: 76, simPassed: true, simAttempts: 2, arSteps: 5, twinHealth: 0.80,
    clearanceTs: '2026-07-07T16:30:00Z', signedBy: 'Grace Lee', certExpiry: '2027-01-07', status: 'valid' },
  { id: 'CR-008', operator: 'Henry Koh', operatorId: 'T-008', role: 'Trainee', procedure: 'Medical Gas Verification', procedureId: 'HSP-01',
    lms: 55, xrScore: 42, simPassed: false, simAttempts: 1, arSteps: 2, twinHealth: 0.70,
    clearanceTs: null, signedBy: null, certExpiry: null, status: 'in_progress' },
  { id: 'CR-009', operator: 'Iris Tay', operatorId: 'T-009', role: 'Operator', procedure: 'Autoclave Bowie-Dick Test', procedureId: 'HSP-02',
    lms: 92, xrScore: 87, simPassed: true, simAttempts: 1, arSteps: 5, twinHealth: 0.93,
    clearanceTs: '2026-07-09T07:15:00Z', signedBy: 'Iris Tay', certExpiry: '2027-01-09', status: 'valid' },
  { id: 'CR-010', operator: 'Jack Sim', operatorId: 'T-010', role: 'Operator', procedure: 'Perimeter Sensor Calibration', procedureId: 'DEF-01',
    lms: 80, xrScore: 73, simPassed: true, simAttempts: 2, arSteps: 5, twinHealth: 0.78,
    clearanceTs: '2026-07-08T13:00:00Z', signedBy: 'Jack Sim', certExpiry: '2027-01-08', status: 'valid' },
]

const PROCEDURES = [...new Set(MOCK_RECORDS.map(r => r.procedure))].sort()
const STATUS_STYLE = {
  valid: { bg: '#dcfce7', color: '#065f46', label: 'Certified' },
  failed: { bg: '#fee2e2', color: '#991b1b', label: 'Failed' },
  in_progress: { bg: '#fef3c7', color: '#92400e', label: 'In Progress' },
  expired: { bg: '#fce4ec', color: '#880e4f', label: 'Expired' },
}

export default function ComplianceAudit() {
  const [procedureFilter, setProcedureFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [expanded, setExpanded] = useState(null)
  const audit = useAudit()
  const loop = useLoop()

  const filtered = useMemo(() => {
    return MOCK_RECORDS.filter(r => {
      if (procedureFilter && r.procedure !== procedureFilter) return false
      if (statusFilter && r.status !== statusFilter) return false
      return true
    })
  }, [procedureFilter, statusFilter])

  const certified = filtered.filter(r => r.status === 'valid').length
  const failed = filtered.filter(r => r.status === 'failed').length
  const inProgress = filtered.filter(r => r.status === 'in_progress').length

  const exportCSV = () => {
    const header = 'Operator,Role,Procedure,LMS%,XR Score,Sim Passed,Sim Attempts,AR Steps,Twin Health,Clearance Date,Status\n'
    const rows = filtered.map(r =>
      `${r.operator},${r.role},${r.procedure},${r.lms},${r.xrScore},${r.simPassed},${r.simAttempts},${r.arSteps},${Math.round(r.twinHealth*100)}%,${r.clearanceTs || 'N/A'},${r.status}`
    ).join('\n')
    const blob = new Blob([header + rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'compliance_audit.csv'; a.click()
    URL.revokeObjectURL(url)
    audit.log('core', 'export', `Compliance audit exported: ${filtered.length} records`)
    loop.emit('deploy', {
      summary: `Evidence chain exported — ${filtered.length} records`,
      detail: `${certified} certified${procedureFilter ? ` · ${procedureFilter}` : ''}. Signed, timestamped, regulator-format.`,
      module: 'core', persona: 'compliance',
    })
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">Compliance Audit</div>
          <div className="panel-subtitle">Defensible evidence chain — LMS + XR + Simulation + AR + Digital Twin</div>
        </div>
        <button className="btn" style={{ background: 'var(--brand)', color: '#fff', border: 'none',
          padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 12 }}
          onClick={exportCSV}>
          <Icon n="ti-download" /> Export CSV
        </button>
      </div>

      {/* Query bar */}
      <div className="card" style={{ padding: 14, marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <select style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)',
          fontSize: 12, background: 'var(--surface)' }}
          value={procedureFilter} onChange={e => setProcedureFilter(e.target.value)}>
          <option value="">All procedures</option>
          {PROCEDURES.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)',
          fontSize: 12, background: 'var(--surface)' }}
          value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option>
          <option value="valid">Certified</option>
          <option value="failed">Failed</option>
          <option value="in_progress">In Progress</option>
        </select>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--hint)' }}>
          {filtered.length} records — {certified} certified, {failed} failed, {inProgress} in progress
        </span>
      </div>

      {/* Results table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--surface2)', textAlign: 'left' }}>
              {['Operator', 'Procedure', 'LMS', 'XR', 'Sim', 'AR', 'Twin', 'Clearance', 'Status'].map(h => (
                <th key={h} style={{ padding: '10px 12px', fontWeight: 600, fontSize: 10,
                  textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--hint)',
                  borderBottom: '1px solid var(--border)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => {
              const st = STATUS_STYLE[r.status] || STATUS_STYLE.in_progress
              const isExpanded = expanded === r.id
              return (
                <React.Fragment key={r.id}>
                  <tr style={{ cursor: 'pointer', background: isExpanded ? 'var(--surface2)' : 'transparent' }}
                    onClick={() => setExpanded(isExpanded ? null : r.id)}>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                      <div style={{ fontWeight: 600 }}>{r.operator}</div>
                      <div style={{ fontSize: 10, color: 'var(--hint)' }}>{r.role}</div>
                    </td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                      <div>{r.procedure}</div>
                      <div style={{ fontSize: 10, color: 'var(--hint)', fontFamily: 'var(--mono)' }}>{r.procedureId}</div>
                    </td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontWeight: 600,
                      color: r.lms >= 80 ? '#16a34a' : r.lms >= 60 ? '#d97706' : '#e11d48' }}>{r.lms}%</td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontWeight: 600,
                      color: r.xrScore >= 80 ? '#16a34a' : r.xrScore >= 60 ? '#d97706' : '#e11d48' }}>{r.xrScore}</td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ color: r.simPassed ? '#16a34a' : '#e11d48', fontWeight: 600 }}>
                        {r.simPassed ? 'Pass' : 'Fail'} ({r.simAttempts})
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>{r.arSteps}/5</td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontWeight: 600,
                      color: r.twinHealth >= 0.8 ? '#16a34a' : '#d97706' }}>{Math.round(r.twinHealth * 100)}%</td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 11,
                      fontFamily: 'var(--mono)' }}>
                      {r.clearanceTs ? new Date(r.clearanceTs).toLocaleDateString('en-SG', { day: '2-digit', month: 'short' }) : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ background: st.bg, color: st.color, padding: '2px 8px', borderRadius: 4,
                        fontSize: 10, fontWeight: 600 }}>{st.label}</span>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={9} style={{ padding: '16px 20px', background: 'var(--surface2)',
                        borderBottom: '2px solid var(--border)' }}>
                        <EvidenceChain record={r} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function EvidenceChain({ record }) {
  const chain = [
    { icon: 'ti-book', label: 'LMS Completion', value: `${record.lms}%`, ts: 'Pre-work micro-lesson', ok: record.lms >= 70 },
    { icon: 'ti-device-gamepad-2', label: 'XR Simulation Score', value: `${record.xrScore}%`, ts: 'Practice session', ok: record.xrScore >= 70 },
    { icon: 'ti-certificate', label: 'Competency Assessment', value: record.simPassed ? `Passed (attempt ${record.simAttempts})` : `Failed (${record.simAttempts} attempts)`, ts: 'Fault-injected scenario', ok: record.simPassed },
    { icon: 'ti-augmented-reality', label: 'AR Interaction', value: `${record.arSteps}/5 steps completed`, ts: 'On-asset procedure overlay', ok: record.arSteps >= 4 },
    { icon: 'ti-cube', label: 'Digital Twin Health', value: `${Math.round(record.twinHealth * 100)}% at time of clearance`, ts: 'Asset state at certification', ok: record.twinHealth >= 0.7 },
    { icon: 'ti-shield-check', label: 'Clearance Signature', value: record.signedBy ? `Signed by ${record.signedBy}` : 'Not signed', ts: record.clearanceTs ? new Date(record.clearanceTs).toLocaleString() : 'Pending', ok: !!record.signedBy },
  ]

  return (
    <div>
      <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>
        Evidence Chain — {record.operator} — {record.procedure}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {chain.map((step, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px',
            background: step.ok ? '#dcfce710' : '#fee2e210', borderRadius: 6,
            borderLeft: `3px solid ${step.ok ? '#16a34a' : '#e11d48'}` }}>
            <Icon n={step.icon} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{step.label}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{step.ts}</div>
            </div>
            <div style={{ fontSize: 12, fontWeight: 600, color: step.ok ? '#16a34a' : '#e11d48' }}>
              {step.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
