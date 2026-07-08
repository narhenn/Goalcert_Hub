// AssetPicker.jsx — the Twins library / asset chooser, shared by the Twin module's
// "Twins" page and by the inline empty-state any module shows when no twin is active.
// Domains with a built-in simulator spec open instantly; the service-backed ones
// (EDM, Turbine, Tram) are shown as requiring the real Digital Twin microservice.
import React from 'react'
import { DOMAINS, Icon } from '../lib.jsx'

const runnable = (d) => d.source === 'sim'   // has a frontend sim spec

export default function AssetPicker({ onOpen, active, compact = false, accent = 'var(--brand)' }) {
  const keys = Object.keys(DOMAINS).filter(k => DOMAINS[k].library !== false)
  const sim = keys.filter(k => runnable(DOMAINS[k]))
  const svc = keys.filter(k => !runnable(DOMAINS[k]))

  const Card = ({ k }) => {
    const d = DOMAINS[k]
    const live = runnable(d)
    const isActive = active === k
    return (
      <div className="card twin-card" style={{ position: 'relative',
        borderColor: isActive ? d.accent : undefined,
        boxShadow: isActive ? `0 0 0 2px ${d.accent}22, 0 8px 24px ${d.accent}18` : undefined,
        opacity: live ? 1 : 0.72 }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, borderRadius: '16px 16px 0 0',
          background: `linear-gradient(90deg, ${d.accent}, ${d.accent}88)` }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, marginTop: 4 }}>
          <div className="agent-icon" style={{ background: `${d.accent}18`, color: d.accent }}><Icon n={d.icon} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--display)' }}>{d.label}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 1 }}>{d.tag}</div>
          </div>
          {isActive && <span className="pill pill-green" style={{ fontSize: 9 }}>ACTIVE</span>}
        </div>
        {!compact && <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.55, marginBottom: 12, minHeight: 44 }}>{d.blurb}</div>}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {live ? <span className="pill pill-green">● simulator</span> : <span className="pill pill-amber">service-backed</span>}
          <span className="pill pill-surface">{d.tiles.length} signals</span>
          {d.assets && <span className="pill pill-surface">{d.assets.length} assets</span>}
        </div>
        <button className="btn btn-primary" style={{ width: '100%', background: live ? d.accent : undefined,
          borderColor: 'transparent', boxShadow: live ? `0 4px 14px ${d.accent}33` : 'none' }}
          disabled={!live}
          onClick={() => live && onOpen(k, d.label)}>
          {live ? <><Icon n="ti-bolt" /> Open twin</> : <><Icon n="ti-plug-connected" /> Needs Twin service</>}
        </button>
      </div>
    )
  }

  return (
    <div>
      <div className="grid-3">{sim.map(k => <Card key={k} k={k} />)}</div>
      {!compact && svc.length > 0 && (
        <>
          <div className="card-label" style={{ margin: '20px 0 10px' }}>
            <Icon n="ti-plug-connected" /> Service-backed twins — connect the Digital Twin microservice to run these live
          </div>
          <div className="grid-3">{svc.map(k => <Card key={k} k={k} />)}</div>
        </>
      )}
    </div>
  )
}
