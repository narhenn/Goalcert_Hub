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

// The twin returns rul as [{component, minutes, severity?}]. The number that matters is
// the one that runs out first — that's the deadline.
const rulSoonest = (rul) => {
  const mins = (rul || []).map(r => r.minutes).filter(m => typeof m === 'number')
  return mins.length ? Math.min(...mins) : null
}

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
  const [error, setError] = useState(null)

  // A projection is only real when there is a real twin behind it: the service must be in
  // live mode AND a tenant must be attached. Without both, /api/twin/predict has nothing
  // to predict about.
  const live = serviceMode === 'live' && !!active?.tenant

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

  // Run the what-if on the Digital Twin.
  //
  // This used to POST to /api/scenario/studio/runs — an endpoint that does not exist on
  // the Simulation Engine. It 404'd every time and fell through to simTrajectory(), a
  // maths function in lib.jsx. So the chart, the "projected health", the at-risk signals
  // and the narrative were all computed in the browser and presented as a twin projection.
  //
  // The real backend for a health trajectory is the Digital Twin, not the cascade engine:
  // POST /api/twin/predict returns { trajectory, rul, severity }, grounded in the twin's
  // own physics model. That is what we call now.
  //
  // And when the twin is not connected we render nothing rather than inventing a curve.
  // A fabricated forecast of a real machine is worse than no forecast: it is a number
  // someone can act on that was never measured.
  const run = async () => {
    if (!spec) return
    if (!live) { setError('not-connected'); return }

    setRunning(true); setError(null)
    try {
      const horizon = HORIZONS[hi].min
      const data = await API.twin.predict(active.tenant, horizon, 48)
      const traj = data.trajectory || []
      if (!traj.length) throw new Error('The twin returned no trajectory for this horizon.')

      const last = traj[traj.length - 1] || {}
      const atRisk = signalsAtRisk(active.domain, last) || []

      // The narrative is a second real call, and it is allowed to fail on its own — a
      // missing outlook should not throw away a good forecast.
      let narrative = ''
      try {
        const a = await API.twin.analysis(active.tenant, horizon)
        narrative = a.report || a.result || ''
      } catch { /* outlook unavailable — the trajectory still stands */ }

      setResult({ traj, last, narrative, atRisk, rul: data.rul || [], severity: data.severity })
      setRunLive(true)
      log('scenario', 'run', `Ran what-if "${spec.title}" on the twin`,
        `Projected health ${pct(last.health)} at ${HORIZONS[hi].label}`)
    } catch (e) {
      setError(e.message || 'The Digital Twin could not run this projection.')
    } finally {
      setRunning(false)
    }
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
                  <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
                    onClick={run} disabled={running || !live}
                    title={live ? undefined : 'Digital Twin not connected'}>
                    {running ? <><span className="spinner" /> Projecting on the twin…</> : <><Icon n="ti-player-play" /> Run on the twin</>}
                  </button>
                </div>
              )}
            </div>

            <div>
              {/* Not connected → say so. The projection is a forecast about a real machine;
                  inventing one in the browser and drawing it as a chart is the single most
                  dangerous thing this page could do. */}
              {!live && (
                <div className="card" style={{ borderStyle: 'dashed' }}>
                  <div className="card-title">
                    <Icon n="ti-plug-connected-x" /> Digital Twin not connected
                    <span className="pill pill-amber">projection unavailable</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.65 }}>
                    The health trajectory, remaining-useful-life and outlook on this page are
                    computed by the <b>NextXR Digital Twin</b> (<span className="mono">POST /api/twin/predict</span>),
                    from the twin's own physics model of the asset. The Hub reaches it through
                    the gateway — no forecasting happens here.
                    <div style={{ marginTop: 10 }}>
                      An administrator enables it by pointing the Hub at the deployed twin in
                      {' '}<span className="mono">hub/backend/.env</span>:
                    </div>
                    <pre className="sim-env">{`TWIN_BASE_URL=https://<the-twin>
TWIN_API_KEY=<the key you were given>
TWIN_PATH_PREFIX=/api/v1`}</pre>
                    <div>
                      Until then this page shows nothing rather than a made-up curve. The
                      cascade-engine tabs above <b>do not need the twin</b> and work now.
                    </div>
                  </div>
                </div>
              )}

              {live && error && error !== 'not-connected' && (
                <div className="card"><div className="empty" style={{ color: 'var(--accent-red)' }}>{error}</div></div>
              )}

              {live && !result && !error && <div className="card"><div className="empty" style={{ padding: '40px 12px' }}>
                {tab === 'fault' ? 'Pick a fault and run it to project the outcome.' : 'Author a scenario, then run it to see the projected trajectory and KPIs.'}</div></div>}

              {result && (
                <>
                  <div className="grid-3 section-gap" style={{ gap: 12 }}>
                    <div className="card kpi"><div className="card-label">Projected health</div>
                      <div className="card-value" style={{ color: hColor(result.last.health) }}>{pct(result.last.health)}</div>
                      <div className="card-change">at {HORIZONS[hi].label}</div></div>
                    <div className="card kpi"><div className="card-label">Signals out of band</div>
                      <div className="card-value" style={{ color: result.atRisk.length ? 'var(--accent-red)' : 'var(--accent-green)' }}>{result.atRisk.length}</div>
                      <div className="card-change">at horizon</div></div>
                    {/* Remaining useful life — a real number from the twin, not derived here. */}
                    <div className="card kpi"><div className="card-label">Soonest RUL</div>
                      <div className="card-value" style={{ color: rulSoonest(result.rul) != null && rulSoonest(result.rul) < 240 ? 'var(--accent-red)' : undefined }}>
                        {rulSoonest(result.rul) != null ? `${Math.round(rulSoonest(result.rul) / 60)}h` : '—'}
                      </div>
                      <div className="card-change">
                        {result.rul?.length ? humanize(result.rul[0].component || '') : 'twin reported none'}
                      </div></div>
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
