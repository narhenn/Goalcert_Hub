// PersonaSwitcher.jsx — topbar persona switcher. Shows who you're working as;
// one click swaps the lens live (nav, home view, AI layer all recompose), or
// jumps back to the full-screen picker.
import React, { useEffect, useRef, useState } from 'react'
import { Icon } from '../lib.jsx'
import { PERSONAS, PERSONA_ORDER, usePersona } from './personas.jsx'

export default function PersonaSwitcher() {
  const { persona, setPersona, clearPersona } = usePersona()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  if (!persona) return null

  return (
    <div className="switcher" ref={ref}>
      <button className="switcher-btn ps-btn" onClick={() => setOpen(o => !o)} title="Switch persona"
        style={{ '--mc': persona.accent, '--mc-soft': persona.accentSoft }}>
        <span className="ps-btn-ic"><Icon n={persona.icon} /></span>
        <b>{persona.label}</b>
        <Icon n="ti-chevron-down" />
      </button>

      {open && (
        <div className="switcher-pop" style={{ width: 340 }}>
          <div className="switcher-pop-head">
            <span>Working as</span>
            <span className="hint">the whole UI recomposes</span>
          </div>
          {PERSONA_ORDER.map(id => {
            const p = PERSONAS[id]
            const on = persona.id === id
            return (
              <button key={id} className="switcher-row" onClick={() => { setPersona(id); setOpen(false) }}
                style={{ '--mc': p.accent, '--mc-soft': p.accentSoft }}>
                <span className="switcher-row-ic"><Icon n={p.icon} /></span>
                <span className="switcher-row-body">
                  <span className="switcher-row-label">{p.label}</span>
                  <span className="switcher-row-role">{p.done}</span>
                </span>
                {on && <span className="ps-check"><Icon n="ti-check" /></span>}
              </button>
            )
          })}
          <button className="ps-picker-link" onClick={() => { setOpen(false); clearPersona() }}>
            <Icon n="ti-layout-grid" /> Open persona picker
          </button>
        </div>
      )}
    </div>
  )
}
