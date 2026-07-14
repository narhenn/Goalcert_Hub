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
import { SourceBadge } from '../../services/integration.jsx'
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

// `embedded` = rendered as a tab inside another panel (the Scenario & Faults workspace),
// so it must not bring its own panel chrome. Standalone (its own route) it still can.
export default function Scenario({ embedded = false }) {
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

  // Run the what-if.
  //
  // LIVE: the Digital Twin does it. POST /api/twin/predict returns { trajectory, rul,
  // severity } from the twin's own physics model of the asset, and
  // /agents/ops/analysis writes the outlook. This used to POST to
  // /api/scenario/studio/runs — an endpoint that does not exist on the Simulation Engine,
  // so it 404'd on every run and nobody noticed.
  //
  // SIM: nobody does it. simTrajectory() draws a straight line —
  //     value = base + drift·t + faultEffect·t·severity
  // with faultEffect read from FAULT_FX, a hand-typed table (a CRAC failure raises inlet
  // temperature by 11 degrees because someone typed 11). It is a useful placeholder for
  // demos and for building the UI against, and it is NOT a measurement of anything.
  //
  // Keeping the fallback is deliberate — it is the Hub's own pattern (services/
  // integration.jsx: "swapping SIM -> LIVE later is a backend deployment, not a frontend
  // change"), so the day TWIN_BASE_URL is set this page starts telling the truth with no
  // code change. What is NOT acceptable is that the two used to look identical: no badge,
  // no caption, a smooth confident curve either way. A forecast is the single most
  // dangerous thing to fake, because it is the one someone acts on. Every result now
  // carries a SIM or LIVE badge, and the simulated one says plainly what it is.
  const run = async () => {
    if (!spec) return
    setRunning(true); setError(null)

    const horizon = HORIZONS[hi].min
    const fault = spec.fault && spec.fault !== 'none' ? spec.fault : null

    if (live) {
      try {
        const data = await API.twin.predict(active.tenant, horizon, 48)
        const traj = data.trajectory || []
        if (!traj.length) throw new Error('The twin returned no trajectory for this horizon.')
        const last = traj[traj.length - 1] || {}

        // The outlook is a second call and may fail on its own — a missing narrative
        // should not throw away a good forecast.
        let narrative = ''
        try {
          const a = await API.twin.analysis(active.tenant, horizon)
          narrative = a.report || a.result || ''
        } catch { /* outlook unavailable; the trajectory still stands */ }

        setResult({
          traj, last, narrative,
          atRisk: signalsAtRisk(active.domain, last) || [],
          rul: data.rul || [], severity: data.severity, source: 'live',
        })
        setRunLive(true)
        log('scenario', 'run', `Ran what-if "${spec.title}" on the twin`,
          `Projected health ${pct(last.health)} at ${HORIZONS[hi].label}`)
        setRunning(false)
        return
      } catch (e) {
        // A twin that is configured but failing is an incident, not a reason to quietly
        // start making numbers up. Say so, then fall back — clearly labelled.
        setError(`Digital Twin error — ${e.message || 'projection failed'}. Showing the local simulator instead.`)
      }
    }

    const traj = simTrajectory(active.domain, horizon, 48, fault, spec.severity || 1)
    const last = traj[traj.length - 1] || {}
    setResult({
      traj, last,
      narrative: stubScenarioNarrative({
        domain: active.domain, machineName: active.name, last,
        spec: { ...spec, horizon_min: horizon },
      }),
      atRisk: signalsAtRisk(active.domain, last) || [],
      rul: [],                 // the local simulator has no RUL model — do not invent one
      source: 'sim',
    })
    setRunLive(false)
    setRunning(false)
  }

  const applyToTwin = () => { if (spec?.fault) injectFault(spec.fault) }

  return (
    <div className={embedded ? undefined : 'panel'}>
      {/* When this is a TAB inside the Scenario & Faults workspace, the page already has a
          panel and a title — rendering our own gave "Scenario & Faults" twice, one above
          the other, in nested panels. Only wear the chrome when we own the page. */}
      {!embedded && (
        <div className="panel-header">
          <div>
            <div className="panel-title">Scenario &amp; Faults</div>
            <div className="panel-subtitle">{active.name} · author a what-if, run it against the twin, score the outcome</div>
          </div>
        </div>
      )}
      {embedded && (
        <div className="panel-subtitle" style={{ marginTop: 0, marginBottom: 14 }}>
          {active.name} · project one machine's health forward under an injected fault.
        </div>
      )}

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
                    onClick={run} disabled={running}>
                    {running
                      ? <><span className="spinner" /> {live ? 'Projecting on the twin…' : 'Projecting…'}</>
                      : <><Icon n="ti-player-play" /> {live ? 'Run on the twin' : 'Run projection'}</>}
                  </button>
                </div>
              )}
            </div>

            <div>
              {error && (
                <div className="card section-gap">
                  <div className="empty" style={{ color: 'var(--accent-red)' }}>{error}</div>
                </div>
              )}

              {!result && !error && <div className="card"><div className="empty" style={{ padding: '40px 12px' }}>
                {tab === 'fault' ? 'Pick a fault and run it to project the outcome.' : 'Author a scenario, then run it to see the projected trajectory and KPIs.'}</div></div>}

              {result && (
                <>
                  {/* Which of these two things you are looking at is not a detail. A LIVE
                      curve is a forecast of a real asset from the twin's physics model. A SIM
                      curve is a straight line out of a hand-typed table. They used to render
                      identically — same chart, same confident health percentage, no marking.
                      Never again. */}
                  {result.source === 'sim' && (
                    <div className="card section-gap sc-sim">
                      <div className="card-title">
                        <Icon n="ti-flask" /> Simulated locally
                        <SourceBadge source="sim" />
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6 }}>
                        The Digital Twin is not connected, so this projection was generated in
                        your browser — a straight line from a preset fault table, <b>not a
                        measurement of {active.name}</b>. Fine for demos and for building
                        against; do not make a maintenance decision on it.
                        <div style={{ marginTop: 8 }}>
                          Point the Hub at a deployed twin (<span className="mono">TWIN_BASE_URL</span> in
                          {' '}<span className="mono">hub/backend/.env</span>) and this page starts
                          returning real forecasts — no code change, the badge flips to LIVE.
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="grid-3 section-gap" style={{ gap: 12 }}>
                    <div className="card kpi"><div className="card-label">Projected health</div>
                      <div className="card-value" style={{ color: hColor(result.last.health) }}>{pct(result.last.health)}</div>
                      <div className="card-change">at {HORIZONS[hi].label}</div></div>
                    <div className="card kpi"><div className="card-label">Signals out of band</div>
                      <div className="card-value" style={{ color: result.atRisk.length ? 'var(--accent-red)' : 'var(--accent-green)' }}>{result.atRisk.length}</div>
                      <div className="card-change">at horizon</div></div>
                    {/* Remaining useful life. This comes from the twin and ONLY from the twin —
                        the local simulator has no wear model, so in SIM it shows a dash rather
                        than a plausible-looking number. An invented RUL is a maintenance date. */}
                    <div className="card kpi"><div className="card-label">Soonest RUL</div>
                      <div className="card-value" style={{ color: rulSoonest(result.rul) != null && rulSoonest(result.rul) < 240 ? 'var(--accent-red)' : undefined }}>
                        {rulSoonest(result.rul) != null ? `${Math.round(rulSoonest(result.rul) / 60)}h` : '—'}
                      </div>
                      <div className="card-change">
                        {result.rul?.length
                          ? humanize(result.rul[0].component || '')
                          : (result.source === 'sim' ? 'needs the live twin' : 'twin reported none')}
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
