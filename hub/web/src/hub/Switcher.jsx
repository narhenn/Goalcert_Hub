// Switcher.jsx — the live entitlement switcher. Flip a module on/off and the whole
// product recomposes instantly: nav items, panels and the AI layer appear or vanish.
// This is the demo of "pick what you want, get exactly that."
import React, { useEffect, useRef, useState } from 'react'
import { Icon } from '../lib.jsx'
import { MODULE_ORDER, MODULES, planName, useEntitlements } from './registry.jsx'

export default function Switcher() {
  const { enabled, toggle, has } = useEntitlements()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  return (
    <div className="switcher" ref={ref}>
      <button className="switcher-btn" onClick={() => setOpen(o => !o)} title="Compose modules">
        <span className="switcher-dots">
          {MODULE_ORDER.map(m => (
            <span key={m} className={`sw-dot ${has(m) ? 'on' : ''}`} style={{ '--mc': MODULES[m].accent }} />
          ))}
        </span>
        <b>{planName(enabled)}</b>
        <Icon n="ti-chevron-down" />
      </button>

      {open && (
        <div className="switcher-pop">
          <div className="switcher-pop-head">
            <span>Composed platform</span>
            <span className="hint">toggle modules live</span>
          </div>
          {MODULE_ORDER.map(id => {
            const m = MODULES[id]
            const on = has(id)
            return (
              <button key={id} className={`switcher-row ${on ? 'on' : ''}`} onClick={() => toggle(id)}
                style={{ '--mc': m.accent, '--mc-soft': m.accentSoft }}>
                <span className="switcher-row-ic"><Icon n={m.icon} /></span>
                <span className="switcher-row-body">
                  <span className="switcher-row-label">{m.label}</span>
                  <span className="switcher-row-role">{m.role}</span>
                </span>
                <span className={`switcher-toggle ${on ? 'on' : ''}`}><span className="knob" /></span>
              </button>
            )
          })}
          {has('twin') && has('agentic') && (
            <div className="switcher-note"><Icon n="ti-sparkles" /> AI layer active — co-pilot + Repair-with-AI</div>
          )}
        </div>
      )}
    </div>
  )
}
