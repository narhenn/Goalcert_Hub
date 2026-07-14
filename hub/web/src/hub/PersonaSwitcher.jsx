// PersonaSwitcher.jsx — "Preview as" control. Only super_admin / admin see it;
// it lets them view any operational persona's dashboard without changing their
// own account. Operational users don't get it — they're locked to their role.
import React, { useEffect, useRef, useState } from 'react'
import { Icon } from '../lib.jsx'
import { PERSONAS, PERSONA_ORDER, usePersona } from './personas.jsx'

export default function PersonaSwitcher() {
  const { persona, canPreview, isPreview, previewAs, exitPreview, homeId } = usePersona()
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  if (!persona || !canPreview) return null

  return (
    <div className="switcher" ref={ref}>
      <button className="switcher-btn ps-btn" onClick={() => setOpen(o => !o)} title="Preview a persona dashboard"
        style={{ '--mc': persona.accent, '--mc-soft': persona.accentSoft }}>
        <span className="ps-btn-ic"><Icon n={isPreview ? 'ti-eye' : persona.icon} /></span>
        <b>{isPreview ? `Preview: ${persona.short}` : 'Preview as'}</b>
        <Icon n="ti-chevron-down" />
      </button>

      {open && (
        <div className="switcher-pop" style={{ width: 320 }}>
          <div className="switcher-pop-head"><span>Preview a persona</span><span className="hint">view-only</span></div>
          {PERSONA_ORDER.map(id => {
            const p = PERSONAS[id]
            const on = persona.id === id && isPreview
            return (
              <button key={id} className="switcher-row" onClick={() => { previewAs(id); setOpen(false) }}
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
          {isPreview && (
            <button className="ps-picker-link" onClick={() => { exitPreview(); setOpen(false) }}>
              <Icon n="ti-arrow-back-up" /> Back to my view ({PERSONAS[homeId]?.short})
            </button>
          )}
        </div>
      )}
    </div>
  )
}
