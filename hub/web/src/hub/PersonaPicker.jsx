// PersonaPicker.jsx — "Who's working today?" Full-screen persona selection.
// No persona login yet: pick a lens, get that persona's dedicated platform view.
// Switch any time from the topbar — the picker is one click away.
import React from 'react'
import { Logo, Icon } from '../lib.jsx'
import { LOOP_STAGES, PERSONAS, PERSONA_ORDER, usePersona } from './personas.jsx'
import { MODULES, useEntitlements } from './registry.jsx'

export default function PersonaPicker() {
  const { setPersona } = usePersona()
  const ent = useEntitlements()

  return (
    <div className="onb">
      <div className="onb-bg" />
      <div className="onb-inner" style={{ maxWidth: 1120 }}>
        <div className="onb-head">
          <span className="brand"><Logo size={34} />
            <span className="brand-word">
              <span className="brand-name">Goalcert</span>
              <span className="brand-tag">Integration Hub</span>
            </span>
          </span>
          <div className="onb-title">Who's working today?</div>
          <div className="onb-sub">Six personas, six views of the same loop. Pick yours — the hub composes
            the platform for that role. Switch any time from the top bar.</div>
        </div>

        {/* the loop strip — orientation, not interaction */}
        <div className="pp-loopstrip">
          {LOOP_STAGES.map((s, i) => (
            <React.Fragment key={s.id}>
              <span className="pp-loopstage"><Icon n={s.icon} /> {s.label}</span>
              {i < LOOP_STAGES.length - 1 && <Icon n="ti-chevron-right" />}
            </React.Fragment>
          ))}
          <span className="pp-loopback"><Icon n="ti-arrow-back-up" /></span>
        </div>

        <div className="pp-grid">
          {PERSONA_ORDER.map((id, idx) => {
            const p = PERSONAS[id]
            return (
              <button key={id} className="pp-card" onClick={() => setPersona(id)}
                style={{ '--mc': p.accent, '--mc-soft': p.accentSoft, animationDelay: `${idx * 55}ms` }}>
                <div className="pp-card-top">
                  <span className="pp-ic"><Icon n={p.icon} /></span>
                  <span className="pp-entry"><Icon n="ti-device-mobile" /> {p.entry}</span>
                </div>
                <div className="pp-label">{p.label}</div>
                <div className="pp-blurb">{p.blurb}</div>

                {/* the segment of the loop this persona runs */}
                <div className="pp-stages">
                  {LOOP_STAGES.map(s => (
                    <span key={s.id} className={`pp-stage ${p.stages.includes(s.id) ? 'on' : ''}`}
                      title={`${s.label} — ${s.desc}`}>{s.label}</span>
                  ))}
                </div>

                {/* which platforms power this persona (dimmed if not entitled) */}
                <div className="pp-platforms">
                  {p.platforms.filter(m => MODULES[m]).map(m => (
                    <span key={m} className={`mod-chip ${ent.has(m) ? '' : 'off'}`}
                      style={{ '--mc': MODULES[m].accent, '--mc-soft': MODULES[m].accentSoft }}>
                      <Icon n={MODULES[m].icon} /> {MODULES[m].short}
                    </span>
                  ))}
                </div>

                <div className="pp-done"><Icon n="ti-flag-check" /> {p.done}</div>
                <span className="pp-go"><Icon n="ti-arrow-right" /></span>
              </button>
            )
          })}
        </div>

        <div className="pp-foot">
          <span className="hint" style={{ fontSize: 12 }}>
            <Icon n="ti-info-circle" /> Personas are a lens — the platforms underneath stay {' '}
            {ent.enabled.length ? ent.enabled.map(m => MODULES[m].short).join(' + ') : 'unconfigured'}.
          </span>
          <button className="btn" onClick={ent.resetOnboarding}>
            <Icon n="ti-layout-grid" /> Recompose platform modules
          </button>
        </div>
      </div>
    </div>
  )
}
