// SimulationWorkspace.jsx — "Train with AI".
//
// The standalone Simulation Engine shipped its own left sidebar (Mission Control,
// Scenario & Faults, Builder, World Builder, Simulation, Reports, Knowledge Hub). Inside
// Goalcert there is exactly ONE sidebar — the Hub's. So that navigation collapses into
// secondary tabs on this page, built from the Hub's existing `.seg` segmented control.
//
// Tabs are the four surfaces that are genuinely backend-driven, plus the Hub's own
// guided-repair drill which already lived here:
//
//   Guided Drill — the existing Trainer (twin-based, unchanged)
//   Builder      — pick the fault, set readiness + conditions
//   Simulation   — the cascade DAG, replay, impacts, RCA, interventions
//   Reports      — exec metrics, chain, risk matrix, evidence, JSON export
//   History      — every run the engine has executed
//
// Mission Control / World Builder / Knowledge Hub from the standalone are deliberately
// NOT ported: they had no backend behind them and rendered hardcoded demo numbers.
// Shipping them here would put fake data inside Goalcert. They can be added the moment
// the engine exposes aggregate endpoints for them.

import React, { useEffect, useState } from 'react'
import { Icon } from '../../lib.jsx'
import { useTwin } from '../../hub/twinState.jsx'
import { SourceBadge } from '../../services/integration.jsx'
import { SimProvider, useSim } from './simState.jsx'
import BuilderPane from './panes/BuilderPane.jsx'
import CascadePane from './panes/CascadePane.jsx'
import ReportsPane from './panes/ReportsPane.jsx'
import HistoryPane from './panes/HistoryPane.jsx'
import Trainer from '../scenario/Trainer.jsx'
import './simulation.css'

// The guided drill is the Hub's own, twin-backed, and always available.
// The four simulation tabs are the Simulation Engine's, and only exist when it is
// connected — add SCENARIO_BASE_URL + SCENARIO_API_KEY and they appear. That is the
// whole "turn it on" story: a deployment + two env lines, no frontend change.
const DRILL_TAB = { id: 'drill', label: 'Guided Drill', icon: 'ti-school' }
const ENGINE_TABS = [
  { id: 'build', label: 'Builder', icon: 'ti-urgent' },
  { id: 'sim', label: 'Simulation', icon: 'ti-chart-dots-3' },
  { id: 'reports', label: 'Reports', icon: 'ti-file-analytics' },
  { id: 'history', label: 'History', icon: 'ti-history' },
]

export default function SimulationWorkspace() {
  return (
    <SimProvider>
      <Workspace />
    </SimProvider>
  )
}

function Workspace() {
  const { graph, engineUp, error, meta, loadingScenarios } = useSim()
  const { active } = useTwin()
  const connected = engineUp === true

  const tabs = connected ? [DRILL_TAB, ...ENGINE_TABS] : [DRILL_TAB]
  const [tab, setTab] = useState('build')

  // Land on a tab that exists. Before the probe resolves we don't know yet, so once it
  // does, snap to Builder if the engine is up, or to the drill if it isn't.
  useEffect(() => {
    if (loadingScenarios) return
    setTab(t => (tabs.some(x => x.id === t) ? t : (connected ? 'build' : 'drill')))
  }, [connected, loadingScenarios]) // eslint-disable-line

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">Train with AI</div>
          <div className="panel-subtitle">
            {connected
              ? <>Drill an operator on a procedure, or run a fault through the {meta.label} engine
                  and watch the cascade it triggers — cause, consequence and what was preventable.</>
              : <>Drill an operator on a procedure against the live twin.</>}
          </div>
        </div>
        <div className="panel-actions">
          {graph && (
            <span className="pill pill-purple mono" title="Deterministic run id — computed by the Simulation Engine">
              run {graph.rootRunId.slice(0, 8)}
            </span>
          )}
          {connected && <SourceBadge source="live" />}
        </div>
      </div>

      <div className="seg sim-tabs">
        {tabs.map(t => (
          <button key={t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
            <Icon n={t.icon} /> {t.label}
            {t.id === 'sim' && graph && graph.totals.preventable_consequences > 0 && (
              <span className="sim-tab-dot" />
            )}
          </button>
        ))}
      </div>

      <div className="sim-pane">
        {tab === 'drill' && (
          active
            ? <Trainer />
            : <div className="empty">
                <Icon n="ti-cube" /> The guided drill runs against an active digital twin.
                <div style={{ marginTop: 6 }}>Open a twin from <b>Twins</b> to start a drill.</div>
              </div>
        )}
        {tab === 'build' && <BuilderPane onRan={() => setTab('sim')} />}
        {tab === 'sim' && <CascadePane onGoBuild={() => setTab('build')} />}
        {tab === 'reports' && <ReportsPane onGoBuild={() => setTab('build')} />}
        {tab === 'history' && <HistoryPane onGoBuild={() => setTab('build')} onOpened={() => setTab('sim')} />}

        {!connected && !loadingScenarios && <NotConnected error={error} />}
      </div>
    </div>
  )
}

// Shown when the Simulation Engine isn't wired up. We do NOT fall back to a local
// simulator here — a fabricated cascade would hand the operator invented failures and
// invented "preventable" verdicts, which is worse than showing nothing.
//
// Each failure gets its own message, because each has a different fix and a generic
// "unreachable" sends an admin hunting in the wrong place.
const DIAGNOSIS = {
  'not-configured': {
    title: 'Simulation Engine not connected',
    body: <>Cascade simulation is served by the <b>Simulation Engine</b>, a separate platform.
      The Hub reaches it through the gateway — no simulation code runs here.</>,
    fix: `SCENARIO_BASE_URL=https://<the-engine>
SCENARIO_API_KEY=<the key you were given>
SCENARIO_PATH_PREFIX=`,
    note: <>Restart the Hub backend and the tabs appear.</>,
  },
  'key-mismatch': {
    title: 'Simulation Engine rejected the Hub',
    pill: 'API key mismatch',
    body: <>The engine is reachable, but it refused the Hub's API key (<b>401</b>).
      Your login is fine — this is a machine-to-machine handshake, not your session.</>,
    fix: `SCENARIO_API_KEY=<must be BYTE-IDENTICAL to the key set on the engine>`,
    note: <>The engine has a key set and the Hub's doesn't match it — or the Hub has none at
      all. Set the same string on both sides (or clear it on both), then restart both.</>,
  },
  'bad-prefix': {
    title: 'Simulation Engine path is wrong',
    pill: '404 from the engine',
    body: <>The engine answered, but the route wasn't found (<b>404</b>). The engine serves its
      routes at the <b>root</b> (<span className="mono">/scenarios</span>,
      <span className="mono"> /runs/graph</span>) — it has no <span className="mono">/api</span> prefix.</>,
    fix: `SCENARIO_PATH_PREFIX=`,
    note: <>It must be empty. The gateway's default of <span className="mono">/api</span> rewrites
      every call into a path the engine doesn't have.</>,
  },
}

function NotConnected({ error }) {
  const d = DIAGNOSIS[error] || {
    title: 'Simulation Engine unreachable',
    pill: 'no response',
    body: <>The engine is configured but did not answer — it may be starting up, asleep (free
      hosting tiers sleep after ~15 min idle and take ~50s to wake), or down.</>,
    fix: null,
    note: <>Gateway said: <span className="mono">{String(error)}</span></>,
  }

  return (
    <div className="card section-gap" style={{ marginTop: 18, borderStyle: 'dashed' }}>
      <div className="card-title">
        <Icon n="ti-plug-connected-x" /> {d.title}
        <span className="pill pill-amber">{d.pill || 'cascade simulation unavailable'}</span>
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.65 }}>
        {d.body}
        {d.fix && (
          <>
            <div style={{ marginTop: 12 }}>
              An administrator fixes this in <span className="mono">hub/backend/.env</span>:
            </div>
            <pre className="sim-env">{d.fix}</pre>
          </>
        )}
        <div style={{ marginTop: d.fix ? 0 : 12 }}>{d.note}</div>
      </div>
    </div>
  )
}
