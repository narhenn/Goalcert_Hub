// Scenario.jsx — the Scenario Engine's single surface: author or pick a what-if /
// fault, run it against the twin's projection, and score the outcome.
// Live mode: tries the GoalCert Studio API for authoring + running; falls back to the
// frontend simulator + zero-token stubs when the service is unreachable.
import React, { useMemo, useState } from 'react'
import { Icon, pct, hColor, predictCharts, simTrajectory, signalsAtRisk, fmt } from '../../lib.jsx'
import { useTwin } from '../../hub/twinState.jsx'
import { useAudit } from '../../hub/audit.jsx'
import { faultsFor, humanize } from '../../hub/util.js'
import { stubScenarioSpec, stubScenarioNarrative } from '../../aiStubs.js'
import MiniChart from '../../hub/MiniChart.jsx'
import MiniMarkdown from '../../hub/MiniMarkdown.jsx'
import API from '../../api.js'

const HORIZONS = [
  { label: '2 hours', min: 120 }, { label: '6 hours', min: 360 }, { label: '24 hours', min: 1440 },
]

export default function Scenario() {
  const { active, injectFault, serviceMode } = useTwin()
  const { log } = useAudit()
  const [tab, setTab] = useState('fault')          // 'fault' | 'scenario'
  const [desc, setDesc] = useState('')
  const [hi, setHi] = useState(1)
  const [spec, setSpec] = useState(null)
  const [result, setResult] = useState(null)
  const [running, setRunning] = useState(false)
  const [authorLive, setAuthorLive] = useState(false)
  const [runLive, setRunLive] = useState(false)

  const faults = faultsFor(active.domain)
  const charts = predictCharts(active.domain).slice(0, 2)

  const author = async () => {
    if (!desc.trim()) return
    setResult(null)
    if (serviceMode === 'live') {
      try {
        const data = await API.scenario.studio.author(desc, active.domain)
        setSpec({
          title: data.title || desc.slice(0, 60),
          fault: data.fault || 'none',
          severity: data.severity ?? 0.8,
          control: data.control ?? 0.85,
          horizon_min: data.horizon_min || HORIZONS[hi].min,
          rationale: data.rationale || 'AI-authored via GoalCert Studio.',
          expected_outcome: data.expected_outcome || '',
        })
        setAuthorLive(true)
        return
      } catch {
        // GoalCert Studio unreachable — fall through
      }
    }
    setAuthorLive(false)
    setSpec(stubScenarioSpec({ kind: tab, description: desc, faults, horizonMin: HORIZONS[hi].min }))
  }

  const pickFault = (f) => { setSpec({ title: f.label, fault: f.id, severity: 0.85, horizon_min: HORIZONS[hi].min, rationale: 'Default fault preset for this asset.' }); setResult(null) }

  const run = async () => {
    if (!spec) return
    setRunning(true)
    if (serviceMode === 'live') {
      try {
        const fullSpec = { ...spec, domain: active.domain, machine_name: active.name, horizon_min: HORIZONS[hi].min }
        const data = await API.scenario.studio.run(fullSpec)
        // backend returns trajectory + narrative; merge with local projection if needed
        const traj = data.trajectory || simTrajectory(active.domain, HORIZONS[hi].min, 48, spec.fault && spec.fault !== 'none' ? spec.fault : null, spec.severity || 1)
        const last = traj[traj.length - 1] || {}
        const atRisk = signalsAtRisk(active.domain, last) || []
        const narrative = data.narrative || stubScenarioNarrative({ domain: active.domain, machineName: active.name, last, spec: { ...spec, horizon_min: HORIZONS[hi].min } })
        setResult({ traj, last, narrative, atRisk })
        log('scenario', 'run', `Ran scenario "${spec.title}"`, `Projected health ${pct(last.health)} at ${HORIZONS[hi].label}`)
        setRunLive(true)
        setRunning(false)
        return
      } catch {
        // GoalCert Studio run failed — fall through to local sim
      }
    }
    // local simulator fallback
    setTimeout(() => {
      const traj = simTrajectory(active.domain, HORIZONS[hi].min, 48, spec.fault && spec.fault !== 'none' ? spec.fault : null, spec.severity || 1)
      const last = traj[traj.length - 1] || {}
      const narrative = stubScenarioNarrative({ domain: active.domain, machineName: active.name, last, spec: { ...spec, horizon_min: HORIZONS[hi].min } })
      const atRisk = signalsAtRisk(active.domain, last) || []
      setResult({ traj, last, narrative, atRisk })
      log('scenario', 'run', `Ran scenario "${spec.title}"`, `Projected health ${pct(last.health)} at ${HORIZONS[hi].label}`)
      setRunLive(false)
      setRunning(false)
    }, 500)
  }

  const applyToTwin = () => { if (spec?.fault) injectFault(spec.fault) }

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">Scenario & Faults</div>
          <div className="panel-subtitle">{active.name} · author a what-if, run it against the twin, score the outcome</div>
        </div>
      </div>

      <div className="seg section-gap">
            <button className={tab === 'fault' ? 'on' : ''} onClick={() => { setTab('fault'); setSpec(null); setResult(null) }}>Fault catalogue</button>
            <button className={tab === 'scenario' ? 'on' : ''} onClick={() => { setTab('scenario'); setSpec(null); setResult(null) }}>Author a scenario</button>
          </div>

          <div className="grid-2" style={{ alignItems: 'start' }}>
            <div>
              {tab === 'fault' ? (
                <div className="card">
                  <div className="card-title"><Icon n="ti-urgent" /> Injectable faults</div>
                  {faults.length === 0 && <div className="empty">No fault catalogue for this asset.</div>}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {faults.map(f => (
                      <button key={f.id} className={`scn-fault ${spec?.fault === f.id ? 'on' : ''}`} onClick={() => pickFault(f)}>
                        <span className="scn-fault-ic"><Icon n="ti-alert-triangle" /></span>
                        <span style={{ flex: 1, textAlign: 'left' }}>{f.label}</span>
                        {spec?.fault === f.id && <Icon n="ti-check" />}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="card">
                  <div className="card-title"><Icon n="ti-pencil" /> Describe the scenario</div>
                  <textarea className="hub-input" style={{ minHeight: 96, resize: 'vertical' }} value={desc}
                    onChange={e => setDesc(e.target.value)}
                    placeholder={`e.g. "A heatwave pushes cooling to its limit over the afternoon peak on ${active.name}"`} />
                  <button className="btn btn-primary" style={{ width: '100%', marginTop: 10, justifyContent: 'center' }} onClick={author}>
                    <Icon n="ti-sparkles" /> Author runnable spec</button>
                </div>
              )}

              {spec && (
                <div className="card section-gap">
                  <div className="card-title">
                    <Icon n="ti-file-description" /> {spec.title}
                    {tab === 'scenario' && (
                      <span
                        className={`pill ${authorLive ? 'pill-green' : 'pill-surface'}`}
                        style={{ fontSize: 8, marginLeft: 6 }}
                        title={authorLive ? 'Authored by GoalCert Studio (live)' : 'Authored by local stub'}
                      >
                        {authorLive ? '● live' : '◌ demo'}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 12 }}>{spec.rationale}</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
                    <span className="hint" style={{ fontSize: 11 }}>Horizon:</span>
                    {HORIZONS.map((hz, i) => (
                      <button key={hz.label} className={`btn ${i === hi ? 'btn-primary' : ''}`} style={{ padding: '5px 10px' }}
                        onClick={() => setHi(i)}>{hz.label}</button>
                    ))}
                  </div>
                  <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={run} disabled={running}>
                    {running ? <><span className="spinner" /> Running projection…</> : <><Icon n="ti-player-play" /> Run scenario</>}
                  </button>
                </div>
              )}
            </div>

            <div>
              {!result && <div className="card"><div className="empty" style={{ padding: '40px 12px' }}>
                {tab === 'fault' ? 'Pick a fault and run it to project the outcome.' : 'Author a scenario, then run it to see the projected trajectory and KPIs.'}</div></div>}
              {result && (
                <>
                  <div className="grid-2 section-gap" style={{ gap: 12 }}>
                    <div className="card kpi"><div className="card-label">Projected health</div>
                      <div className="card-value" style={{ color: hColor(result.last.health) }}>{pct(result.last.health)}</div>
                      <div className="card-change">at {HORIZONS[hi].label}</div></div>
                    <div className="card kpi"><div className="card-label">Signals out of band</div>
                      <div className="card-value" style={{ color: result.atRisk.length ? 'var(--accent-red)' : 'var(--accent-green)' }}>{result.atRisk.length}</div>
                      <div className="card-change">at horizon</div></div>
                  </div>
                  {charts.map((c, i) => (
                    <div key={i} className="card section-gap">
                      <div className="card-title">{c.title}</div>
                      <MiniChart data={result.traj} series={c.series} redline={c.redline} height={140} />
                    </div>
                  ))}
                  <div className="card section-gap">
                    <div className="card-title">
                    <Icon n="ti-report-analytics" /> Outcome
                    <span className="pill pill-purple" style={{ fontSize: 9 }}>scored</span>
                    <span
                      className={`pill ${runLive ? 'pill-green' : 'pill-surface'}`}
                      style={{ fontSize: 8 }}
                      title={runLive ? 'Run on GoalCert Studio backend' : 'Run on local simulator'}
                    >
                      {runLive ? '● live' : '◌ sim'}
                    </span>
                  </div>
                    <MiniMarkdown text={result.narrative} />
                    <button className="btn" style={{ marginTop: 12 }} onClick={applyToTwin}>
                      <Icon n="ti-arrow-bar-to-right" /> Apply fault to live twin</button>
                  </div>
                </>
              )}
            </div>
          </div>
    </div>
  )
}
