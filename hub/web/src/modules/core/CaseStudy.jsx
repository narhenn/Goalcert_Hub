// CaseStudy.jsx — Case Study Mode instrumentation.
//
// Built into GoalCert itself per Prem's doc. When a customer opts in:
//   - Captures baseline KPI snapshot
//   - Weekly rollup of leading indicators
//   - Executive-ready dashboard shareable without GoalCert involvement
//   - Auto-drafted case study narrative each quarter
import React, { useState } from 'react'
import { Icon } from '../../lib.jsx'
import { useKpi } from '../../hub/kpiState.jsx'
import { useLoop } from '../../hub/loopState.jsx'
import MiniChart from '../../hub/MiniChart.jsx'

export default function CaseStudy() {
  const { kpi, captureBaseline, generateNarrative, seedDemo, reset } = useKpi()
  const loop = useLoop()
  const [narrative, setNarrative] = useState(kpi.narrative || '')
  const hasBaseline = !!kpi.baseline
  const hasData = kpi.weeklyRolls.length > 0

  const doGenerate = () => {
    const n = generateNarrative()
    setNarrative(n)
    loop.emit('improve', {
      summary: 'Case-study narrative drafted from platform data',
      detail: 'Quarterly draft ready for human editing — the loop’s outcome, sold back to the market.',
      module: 'core', persona: 'coo',
    })
  }

  const doCopy = () => {
    navigator.clipboard?.writeText(narrative).catch(() => {})
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">Case Study Mode</div>
          <div className="panel-subtitle">Every deployment is a case-study manufacturing pipeline</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!hasData && (
            <button className="btn" style={{ background: 'var(--brand)', color: '#fff', border: 'none',
              padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 12 }}
              onClick={seedDemo}>
              <Icon n="ti-database" /> Load Demo Data
            </button>
          )}
          {hasData && (
            <button className="btn" style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)',
              padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 12 }}
              onClick={reset}>
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Baseline panel */}
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon n="ti-flag" /> Baseline Snapshot
          {hasBaseline && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#16a34a', fontWeight: 600 }}>
            Captured {new Date(kpi.baseline.capturedAt).toLocaleDateString('en-SG', { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>}
        </div>
        {hasBaseline ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
            {[
              { label: 'Avg Readiness', value: `${kpi.baseline.avgReadiness}%` },
              { label: 'Operators', value: kpi.baseline.totalOperators },
              { label: 'Procedures', value: kpi.baseline.certifiedProcedures },
              { label: 'First-Time Fix', value: `${kpi.baseline.firstTimeFixRate}%` },
              { label: 'Time to Clear', value: kpi.baseline.meanTimeToClearance },
            ].map(m => (
              <div key={m.label} style={{ textAlign: 'center', padding: 10, background: 'var(--surface2)', borderRadius: 8 }}>
                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--display)', color: 'var(--text)' }}>{m.value}</div>
                <div style={{ fontSize: 9, color: 'var(--hint)', textTransform: 'uppercase', letterSpacing: '.06em', marginTop: 2 }}>{m.label}</div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: 20, color: 'var(--muted)', fontSize: 13 }}>
            No baseline captured yet. Click "Capture Baseline" to lock the starting KPIs before deployment.
            <br />
            <button className="btn" style={{ background: '#d97706', color: '#fff', border: 'none',
              padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, marginTop: 12 }}
              onClick={() => captureBaseline()}>
              <Icon n="ti-camera" /> Capture Baseline
            </button>
          </div>
        )}
      </div>

      {/* Executive dashboard — the chart Prem's doc wants shareable */}
      {hasData && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon n="ti-presentation-analytics" /> Executive Dashboard
            <span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--hint)' }}>
              Shareable without GoalCert involvement
            </span>
          </div>

          {/* Before → After metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
            {[
              { label: 'Avg Readiness', before: kpi.baseline?.avgReadiness || 62, after: kpi.avgReadiness || 84, unit: '%', good: true },
              { label: 'Clearances Issued', before: 0, after: kpi.totalClearances || 47, unit: '', good: true },
              { label: 'Pass Rate', before: 0, after: kpi.passRate || 94, unit: '%', good: true },
              { label: 'Time to Clear', before: '3d', after: '45m', unit: '', good: true },
            ].map(m => (
              <div key={m.label} className="card" style={{ padding: 14, textAlign: 'center',
                border: '1px solid #dcfce7' }}>
                <div style={{ fontSize: 10, color: 'var(--hint)', textTransform: 'uppercase', marginBottom: 6 }}>{m.label}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <span style={{ fontSize: 14, color: 'var(--muted)', textDecoration: 'line-through' }}>
                    {typeof m.before === 'number' ? `${m.before}${m.unit}` : m.before}
                  </span>
                  <span style={{ color: 'var(--hint)' }}>→</span>
                  <span style={{ fontSize: 22, fontWeight: 700, color: '#16a34a', fontFamily: 'var(--display)' }}>
                    {typeof m.after === 'number' ? `${m.after}${m.unit}` : m.after}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Weekly trend charts */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>Readiness Score Trend</div>
              <MiniChart
                series={[{ data: kpi.weeklyRolls.map(w => w.avgReadiness), color: '#16a34a', label: 'Readiness' }]}
                labels={kpi.weeklyRolls.map(w => w.week)}
                height={120}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', marginBottom: 6 }}>Pass Rate & Incidents</div>
              <MiniChart
                series={[
                  { data: kpi.weeklyRolls.map(w => w.passRate), color: '#2563eb', label: 'Pass Rate %' },
                  { data: kpi.weeklyRolls.map(w => w.incidentCount * 10), color: '#e11d48', label: 'Incidents (×10)' },
                ]}
                labels={kpi.weeklyRolls.map(w => w.week)}
                height={120}
              />
            </div>
          </div>
        </div>
      )}

      {/* Auto-drafted narrative */}
      {hasData && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon n="ti-file-text" /> Case Study Narrative (Auto-Draft)
          </div>
          {narrative ? (
            <>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text)', padding: 16,
                background: 'var(--surface2)', borderRadius: 8, marginBottom: 12, fontStyle: 'italic' }}>
                "{narrative}"
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" style={{ background: 'var(--surface2)', color: 'var(--text)',
                  border: '1px solid var(--border)', padding: '6px 14px', borderRadius: 6, cursor: 'pointer',
                  fontSize: 11, fontWeight: 600 }} onClick={doCopy}>
                  <Icon n="ti-copy" /> Copy
                </button>
                <button className="btn" style={{ background: 'var(--surface2)', color: 'var(--text)',
                  border: '1px solid var(--border)', padding: '6px 14px', borderRadius: 6, cursor: 'pointer',
                  fontSize: 11, fontWeight: 600 }} onClick={doGenerate}>
                  <Icon n="ti-refresh" /> Regenerate
                </button>
              </div>
            </>
          ) : (
            <button className="btn" style={{ background: 'var(--brand)', color: '#fff', border: 'none',
              padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
              onClick={doGenerate}>
              <Icon n="ti-sparkles" /> Generate Narrative
            </button>
          )}
        </div>
      )}

      {/* 5-artifact stack */}
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>
          <Icon n="ti-stack-2" /> Case Study Artifact Stack
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>
          Every case study ships as 5 coordinated artifacts:
        </div>
        {[
          { icon: 'ti-file-description', label: 'One-Page Executive Summary', desc: 'Numbers only, customer logo, sponsor quote. Read in 60 seconds.' },
          { icon: 'ti-file-analytics', label: '4-6 Page Detailed Case Study', desc: 'Baseline, intervention, method, result, third-party validation.' },
          { icon: 'ti-video', label: '90-Second Video', desc: 'Customer sponsor on camera. Most-shared artifact by an order of magnitude.' },
          { icon: 'ti-chart-bar', label: 'Audit-Grade Data Appendix', desc: 'Full methodology, data sources, formulas, sample sizes.' },
          { icon: 'ti-book', label: 'Internal Methodology Playbook', desc: 'How the outcome was engineered. What to replicate next time.' },
        ].map((a, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
            borderBottom: i < 4 ? '1px solid var(--border)' : 'none' }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--surface2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--brand)', fontSize: 14 }}>
              <Icon n={a.icon} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{a.label}</div>
              <div style={{ fontSize: 10, color: 'var(--hint)' }}>{a.desc}</div>
            </div>
            <span style={{ fontSize: 10, color: 'var(--hint)', background: 'var(--surface2)',
              padding: '2px 8px', borderRadius: 4 }}>
              {hasData ? 'Ready' : 'Needs data'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
