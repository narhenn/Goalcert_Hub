// Safeguards.jsx — the second lever.
//
// Readiness asks "how well trained is the operator?". A safeguard asks something
// different and, for whoever signs the cheque, more useful: "what if we just installed
// the thing that stops this?"
//
// The engine has supported this the whole time and the UI never exposed it. A resource on
// the scenario's environment can block a fault OUTRIGHT (engine: spec.prevention — an
// active, covering resource blocks the action at or under its difficulty threshold). The
// signal-failure scenario ships a backup signal relay that does exactly that. Toggle it
// off, re-run, and the fault fires. Toggle it on at a difficulty it can handle, and the
// fault never happens at all — the cascade collapses from five nodes to one.
//
// Nothing is sent to a new endpoint: POST /runs/graph has always accepted an
// `environment` override. Removing a safeguard just means posting a world without it.
//
// Difficulty sits here too, because it is the other half of the same question. A relay
// with a threshold of 1 blocks a routine failure and nothing harder — so a safeguard that
// works on Easy and not on Hard is telling you its limit, which is worth knowing before
// you buy it.

import React from 'react'
import { Icon } from '../../../lib.jsx'
import { useSim } from '../simState.jsx'

const DIFFICULTIES = ['Easy', 'Medium', 'Hard', 'Expert']

// The engine's resource keys are snake_case; make them readable without a lookup table
// that would go stale the moment a domain plugin adds one. Acronyms are upper-cased so
// the CCTV monitor doesn't read as "Cctv Monitoring".
const ACRONYMS = new Set(['cctv', 'gps', 'hvac', 'ai', 'ar', 'ups', 'plc', 'scada', 'rul'])
const label = (key) => (key || '')
  .split('_')
  .map(w => (ACRONYMS.has(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
  .join(' ')

export default function Safeguards() {
  const { safeguards, toggleSafeguard, difficulty, setDifficulty, selectedScenario } = useSim()

  if (!selectedScenario) return null

  const removed = safeguards.filter(s => !s.active).length

  return (
    <div className="card">
      <div className="card-title">
        <Icon n="ti-shield-half" /> Safeguards
        {removed > 0 && <span className="pill pill-red">{removed} removed</span>}
      </div>

      {!safeguards.length ? (
        <div className="empty">This scenario ships no safeguards — nothing can block the fault.</div>
      ) : (
        <div className="sim-guards">
          {safeguards.map(s => (
            <button key={s.id}
              className={`sim-guard ${s.active ? 'on' : ''}`}
              onClick={() => toggleSafeguard(s.id)}>
              <Icon n={s.active ? 'ti-shield-check' : 'ti-shield-off'} />
              <span className="sim-guard-body">
                <span className="sim-guard-name">{label(s.type)}</span>
                <span className="sim-guard-meta mono">{s.scope || 'actor'} scope</span>
              </span>
              <span className={`pill ${s.active ? 'pill-green' : 'pill-red'}`}>
                {s.active ? 'IN PLACE' : 'REMOVED'}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="sim-diff">
        <div className="sim-diff-label">Fault difficulty</div>
        <div className="seg">
          {DIFFICULTIES.map(d => (
            <button key={d} className={difficulty === d ? 'on' : ''} onClick={() => setDifficulty(d)}>
              {d}
            </button>
          ))}
        </div>
      </div>

      <div className="sim-hint">
        A safeguard blocks the fault <b>outright</b> — if it holds, the fault never happens
        and there is no cascade at all. But each one has a limit: the backup relay stops a
        routine failure and nothing harder. Raise the difficulty past what it can absorb and
        it stops helping, which is exactly the thing worth knowing before you buy one.
      </div>
    </div>
  )
}
