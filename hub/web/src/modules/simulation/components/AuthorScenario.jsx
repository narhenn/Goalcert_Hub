// AuthorScenario.jsx — describe a failure in a sentence; get a runnable scenario.
//
// The LLM call happens in the ENGINE, not here. The hub holds no model key and never
// talks to Anthropic — it posts the sentence to /api/scenario/scenarios/author through
// the gateway and gets back a registered Scenario.
//
// What the model does: writes the SPEC — the fault, the decision gate, the objectives,
// and the cascade triggers. What it does NOT do: decide what happens. Once registered,
// the deterministic engine computes the cascade exactly as it does for a hand-written
// scenario. An AI that also invented the consequences would just be telling you a story.

import React, { useState } from 'react'
import { Icon } from '../../../lib.jsx'
import API from '../../../api.js'
import { useSim } from '../simState.jsx'

const EXAMPLES = [
  'Heavy rain floods the track bed at peak hour and the signal technician has to pump it out before service is hit',
  'A train door fails to close and the driver must isolate it before the platform backs up',
  'Overhead line power sags and the control room must shed load before trains strand between stations',
]

export default function AuthorScenario() {
  const { domain, meta, refreshScenarios, setScenarioId } = useSim()
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [authored, setAuthored] = useState(null)

  const go = async () => {
    if (!prompt.trim()) return
    setBusy(true); setError(null); setAuthored(null)
    try {
      const scn = await API.scenario.sim.author(domain, prompt.trim())
      setAuthored(scn)
      await refreshScenarios()   // it exists now — put it in the dropdown
      setScenarioId(scn.id)      // and select it, so Run uses it straight away
      setPrompt('')
    } catch (e) {
      // The engine returns 422 with a readable reason: no API key, or the model kept
      // naming actions this domain doesn't have. Show it — it is actionable.
      setError(e.message || 'Authoring failed')
    } finally {
      setBusy(false)
    }
  }

  const preventable = (authored?.triggers || [])
    .filter(t => (t.condition || '').includes('containment_rate'))
    .flatMap(t => t.spawns || [])

  return (
    <div className="card section-gap sim-author">
      <div className="card-title">
        <Icon n="ti-sparkles" /> Author a scenario
        <span className="pill pill-purple">AI</span>
      </div>

      <div className="sim-hint" style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}>
        Describe a failure in {meta.label} and the engine writes a runnable scenario — the
        fault, the decision the operator has to get right, and what it cascades into if
        they don't. <b>The AI writes the spec; the engine still computes the outcome.</b>
      </div>

      <textarea
        className="input sim-author-box"
        rows={3}
        placeholder="e.g. heavy rain floods the track bed at peak hour…"
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) go() }}
        disabled={busy}
      />

      <div className="sim-author-eg">
        {EXAMPLES.map((ex, i) => (
          <button key={i} className="sim-eg" onClick={() => setPrompt(ex)} disabled={busy}>
            {ex.length > 54 ? ex.slice(0, 53) + '…' : ex}
          </button>
        ))}
      </div>

      <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 10 }}
        onClick={go} disabled={busy || !prompt.trim()}>
        {busy
          ? <><span className="spinner" /> Authoring — writing steps, gates and cascade triggers…</>
          : <><Icon n="ti-sparkles" /> Author scenario</>}
      </button>

      {error && (
        <div className="empty" style={{ color: 'var(--accent-red)', marginTop: 10, textAlign: 'left' }}>
          {error}
        </div>
      )}

      {authored && (
        <div className="sim-authored">
          <div className="sim-authored-head">
            <Icon n="ti-circle-check" />
            <b>{authored.name}</b>
            <span className="pill pill-green">registered · selected</span>
          </div>
          <div className="sim-authored-body">
            <div>{authored.description}</div>
            <div className="sim-authored-facts">
              <span><b>{authored.steps?.length || 0}</b> step(s)</span>
              <span><b>{authored.decision_gates?.length || 0}</b> decision gate(s)</span>
              <span><b>{(authored.triggers || []).flatMap(t => t.spawns || []).length}</b> cascade link(s)</span>
              {!!authored.custom_actions?.length && (
                <span className="pill pill-amber">
                  new fault: {authored.custom_actions.map(a => a.key).join(', ')}
                </span>
              )}
            </div>
            {!!preventable.length && (
              <div className="sim-field-value" style={{ borderLeft: '3px solid var(--accent-red)', marginTop: 8 }}>
                It authored a <b>preventable</b> consequence: if the operator fails to contain
                this, it cascades into{' '}
                <b>{preventable.map(s => s.scenario_id.split('.').pop().replace(/_v\d+$/, '').replace(/_/g, ' ')).join(', ')}</b>.
                Run it and the cascade view will show that edge.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
