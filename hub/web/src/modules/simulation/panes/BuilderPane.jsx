// BuilderPane.jsx — compose the run, then hand it to the engine.
//
// Note what is NOT here: a hand-drawn cascade. The standalone app let you sketch stages
// A→B→C by hand, but the engine does not take stages — it takes ONE fault scenario and
// derives the whole cause→consequence chain itself from the triggers that fire. Letting
// you draw a chain the engine then ignores would be theatre. So the Builder's job is to
// choose the fault and set the conditions the engine actually reasons about.

import React from 'react'
import { Icon } from '../../../lib.jsx'
import { useSim } from '../simState.jsx'
import AuthorScenario from '../components/AuthorScenario.jsx'
import ReadinessCurve from '../components/ReadinessCurve.jsx'
import Safeguards from '../components/Safeguards.jsx'

export default function BuilderPane({ onRan }) {
  const {
    meta, domain, allDomains, pickDomain,
    scenarios, loadingScenarios, engineUp,
    scenarioId, setScenarioId,
    readiness, setReadiness, effReadiness,
    conditions, toggleCondition,
    difficulty, safeguards, removedSafeguards,
    running, error, run,
  } = useSim()

  const selected = scenarios.find(s => s.id === scenarioId)

  const go = async () => {
    const g = await run()
    if (g && onRan) onRan()
  }

  // The workspace only renders this pane when the engine is connected, and owns the
  // not-connected state itself (see SimulationWorkspace → NotConnected).
  if (engineUp === false) return null

  return (
    <div className="grid-2 sim-builder">
      <div>
        <AuthorScenario />

        <div className="card section-gap">
          <div className="card-title">
            <Icon n="ti-urgent" /> Fault scenario
            <span className="pill pill-surface">{meta.label}</span>
          </div>

          {/* Domain picker — browse and run ANY vertical's scenarios, not only the
              active twin's. Picking one overrides the twin-followed domain until the
              operator switches twin. */}
          {allDomains?.length > 1 && (
            <div className="sim-domain-pick" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {allDomains.map(d => (
                <button key={d.id}
                  className={`btn ${domain === d.id ? 'btn-primary' : ''}`}
                  style={{ fontSize: 11 }}
                  onClick={() => pickDomain(d.id)}>
                  <Icon n={d.icon} /> {d.label}
                </button>
              ))}
            </div>
          )}

          {loadingScenarios ? (
            <div className="empty"><span className="spinner" /> Loading the scenario library…</div>
          ) : !scenarios.length ? (
            <div className="empty">No fault scenarios registered for {meta.label}.</div>
          ) : (
            <>
              <select className="select" value={scenarioId} onChange={e => setScenarioId(e.target.value)}>
                {scenarios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              {selected && (
                <div className="sim-scn-desc">
                  {selected.description}
                  <div className="sim-scn-tags">
                    <span className="pill pill-surface mono">{selected.id}</span>
                    <span className="pill pill-purple">{selected.category}</span>
                    <span className="pill pill-amber">{selected.impact_level} impact</span>
                  </div>
                </div>
              )}
              <div className="sim-hint">
                Only <b>fault</b> scenarios are launchable. The consequence nodes
                (overcrowding, suspension, line-wide delay…) are what the engine
                <b> spawns</b> — you don't start them, the cascade does.
              </div>
            </>
          )}
        </div>

        <div className="card">
          <div className="card-title"><Icon n="ti-gauge" /> Operator readiness</div>
          <input className="sim-range" type="range" min="0" max="100" value={readiness}
            onChange={e => setReadiness(+e.target.value)} />
          <div className="sim-range-row">
            <span>Set <b>{readiness}</b></span>
            {effReadiness !== readiness && (
              <span className="pill pill-red">effective {effReadiness} after conditions</span>
            )}
          </div>
          <div className="sim-hint">
            Readiness is the one knob the engine truly reasons about. Below the
            threshold the response is too slow, <span className="mono">containment_rate</span> falls
            to 0, and the engine's <span className="mono">containment_rate &lt; 1</span> trigger fires an
            extra <b>preventable</b> branch.
          </div>
        </div>
      </div>

      <div>
        <div className="section-gap"><ReadinessCurve /></div>
        <div className="section-gap"><Safeguards /></div>

        <div className="card section-gap">
          <div className="card-title"><Icon n="ti-cloud-storm" /> Operating conditions</div>
          <div className="sim-conds">
            {meta.conditions.map(c => (
              <button key={c.id}
                className={`sim-cond ${conditions.includes(c.id) ? 'on' : ''}`}
                onClick={() => toggleCondition(c.id)}>
                <Icon n={c.icon} /> {c.label}
                <span className="mono sim-cond-pen">−{c.penalty}</span>
              </button>
            ))}
          </div>
          <div className="sim-hint">
            The engine models readiness, not weather — so a condition is applied as a
            readiness penalty. That is a real effect, not a label: stack enough of them
            and you push the run below the containment threshold.
          </div>
        </div>

        <div className="card sim-launch">
          <div className="card-title"><Icon n="ti-player-play" /> Run</div>
          <div className="sim-launch-summary">
            <div><span>Scenario</span><b>{selected?.name || '—'}</b></div>
            <div><span>Readiness sent</span><b className="mono">{effReadiness}</b></div>
            <div><span>Difficulty</span><b>{difficulty}</b></div>
            <div><span>Conditions</span><b>{conditions.length || 'none'}</b></div>
            <div>
              <span>Safeguards</span>
              <b className={removedSafeguards.length ? 'sim-warn' : undefined}>
                {safeguards.length
                  ? `${safeguards.length - removedSafeguards.length}/${safeguards.length} in place`
                  : 'none'}
              </b>
            </div>
          </div>

          {error && <div className="empty" style={{ color: 'var(--accent-red)', marginBottom: 10 }}>{error}</div>}

          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }}
            onClick={go} disabled={running || !scenarioId}>
            {running
              ? <><span className="spinner" /> Running on the engine…</>
              : <><Icon n="ti-player-play-filled" /> Run simulation</>}
          </button>
        </div>
      </div>
    </div>
  )
}
