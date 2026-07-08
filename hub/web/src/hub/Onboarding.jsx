// Onboarding.jsx — "Compose your platform." First-run screen where a tenant picks
// which of the three platforms they've adopted. The same selection can be changed
// any time from the live switcher in the topbar.
import React, { useState } from 'react'
import { Logo, Icon } from '../lib.jsx'
import { MODULE_ORDER, MODULES, planName, useEntitlements } from './registry.jsx'

export default function Onboarding() {
  const { completeOnboarding, enabled } = useEntitlements()
  const [sel, setSel] = useState(() => (enabled.length ? enabled : ['twin']))

  const toggle = (id) => setSel(prev => MODULE_ORDER.filter(m => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]).includes(m)))
  const has = (id) => sel.includes(id)
  const aiTakeover = has('twin') && has('agentic')

  return (
    <div className="onb">
      <div className="onb-bg" />
      <div className="onb-inner">
        <div className="onb-head">
          <span className="brand"><Logo size={34} />
            <span className="brand-word">
              <span className="brand-name">Goalcert</span>
              <span className="brand-tag">Integration Hub</span>
            </span>
          </span>
          <div className="onb-title">Compose your platform</div>
          <div className="onb-sub">Pick the platforms you've adopted. The hub assembles exactly that —
            API and UI — from the modules you enable. You can change this any time.</div>
        </div>

        <div className="onb-grid">
          {MODULE_ORDER.map(id => {
            const m = MODULES[id]
            const on = has(id)
            return (
              <button key={id} className={`onb-card ${on ? 'on' : ''}`} onClick={() => toggle(id)}
                style={{ '--mc': m.accent, '--mc-soft': m.accentSoft }}>
                <div className="onb-card-top">
                  <span className="onb-ic"><Icon n={m.icon} /></span>
                  <span className={`onb-check ${on ? 'on' : ''}`}><Icon n={on ? 'ti-check' : 'ti-plus'} /></span>
                </div>
                <div className="onb-card-label">{m.label}</div>
                <div className="onb-card-role">{m.role}</div>
                <div className="onb-card-blurb">{m.blurb}</div>
                <ul className="onb-feats">
                  {m.features.slice(0, 5).map((f, i) => <li key={i}><Icon n="ti-point-filled" /> {f}</li>)}
                </ul>
                {m.base && <span className="onb-badge">base platform</span>}
                {m.layer && <span className="onb-badge layer">AI layer</span>}
              </button>
            )
          })}
        </div>

        {aiTakeover && (
          <div className="onb-note">
            <Icon n="ti-sparkles" />
            <span><b>AI layer engaged.</b> With Digital Twin + Agentic AI, the reasoning layer takes over —
              an always-on co-pilot and a cinematic Repair-with-AI mode sit on top of the twin.</span>
          </div>
        )}

        <div className="onb-foot">
          <div className="onb-plan">
            <span className="onb-plan-label">Your plan</span>
            <span className="onb-plan-value">{planName(sel)}</span>
            <div className="onb-plan-chips">
              {sel.length === 0 && <span className="hint">Select at least one platform</span>}
              {MODULE_ORDER.filter(m => sel.includes(m)).map(m => (
                <span key={m} className="mod-chip" style={{ '--mc': MODULES[m].accent, '--mc-soft': MODULES[m].accentSoft }}>
                  <Icon n={MODULES[m].icon} /> {MODULES[m].short}
                </span>
              ))}
            </div>
          </div>
          <button className="btn btn-primary onb-cta" disabled={sel.length === 0}
            onClick={() => completeOnboarding(sel)}>
            Enter platform <Icon n="ti-arrow-right" />
          </button>
        </div>
      </div>
    </div>
  )
}
