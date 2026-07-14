// HistoryPane.jsx — the runs you've executed, re-openable from the engine.
//
// The list of run ids is kept client-side (the engine has no "list graphs" endpoint —
// see the note in simState.jsx). The RUN ITSELF is never cached locally: clicking a row
// re-fetches the real graph from the engine via GET /runs/graph/{id}. If the engine has
// restarted, its in-memory graph store is empty and that fetch 404s — we say so plainly
// instead of showing a stale local copy. Re-running reproduces it exactly, because the
// cascade is deterministic.

import React from 'react'
import { Icon } from '../../../lib.jsx'
import { useSim } from '../simState.jsx'

export default function HistoryPane({ onGoBuild, onOpened }) {
  const { history, graph, openRun, running, error } = useSim()

  const open = async (id) => {
    const g = await openRun(id)
    if (g && onOpened) onOpened()
  }

  return (
    <div>
      <div className="panel-header" style={{ marginBottom: 14 }}>
        <div className="panel-subtitle" style={{ marginTop: 0, maxWidth: 720 }}>
          Runs you've executed in this browser. Opening one re-fetches the real graph from
          the engine — nothing is cached locally. The cascade is deterministic, so the same
          scenario at the same readiness always reproduces the identical graph.
        </div>
        <div className="panel-actions">
          <button className="btn btn-primary" onClick={onGoBuild}>
            <Icon n="ti-player-play" /> New run
          </button>
        </div>
      </div>

      {error && <div className="empty" style={{ color: 'var(--accent-red)', marginBottom: 12 }}>{error}</div>}

      {!history.length ? (
        <div className="empty">
          <Icon n="ti-history" /> No runs yet.
          <div style={{ marginTop: 10 }}>
            <button className="btn btn-primary" onClick={onGoBuild}>
              <Icon n="ti-player-play" /> Run your first simulation
            </button>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="card-title">
            <Icon n="ti-history" /> Run history
            <span className="pill pill-surface">{history.length}</span>
          </div>
          {history.map(r => {
            const isCurrent = graph && graph.rootRunId === r.rootRunId
            return (
              <div className="sim-hist" key={r.rootRunId}>
                <span className="sim-hist-ic" style={{
                  background: r.contained ? 'rgba(22,163,74,.12)' : 'rgba(225,29,72,.1)',
                  color: r.contained ? 'var(--accent-green)' : 'var(--accent-red)',
                }}>
                  <Icon n={r.contained ? 'ti-shield-check' : 'ti-alert-triangle'} />
                </span>
                <div className="sim-hist-body">
                  <div className="sim-hist-title">{r.scenarioName}</div>
                  <div className="sim-hist-meta mono">
                    readiness {r.readiness} · {r.nodes} nodes · {r.preventable} preventable
                    {' · '}{new Date(r.at).toLocaleString()}
                  </div>
                </div>
                {isCurrent && <span className="pill pill-purple">OPEN</span>}
                <span className={`pill ${r.contained ? 'pill-green' : 'pill-red'}`}>
                  {r.contained ? 'CONTAINED' : 'FAILED'}
                </span>
                <button className="btn" onClick={() => open(r.rootRunId)} disabled={running}>
                  <Icon n="ti-external-link" /> Open
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
