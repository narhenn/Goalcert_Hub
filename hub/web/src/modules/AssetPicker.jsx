// AssetPicker.jsx — the Twins library / asset chooser, shared by the Twin module's
// "Twins" page and by the inline empty-state any module shows when no twin is active.
// `source: 'sim'` domains open instantly on the built-in simulator. `source: 'live'`
// domains (EDM, Turbine, Tram) need the NextXR Digital Twin service AND a matching
// template on it — we probe the live template list so a card enables only when the
// service can actually create it (e.g. the service has `edm-machine` but not `tram-network`).
import React, { useEffect, useState } from 'react'
import { DOMAINS, Icon } from '../lib.jsx'
import { useTwin } from '../hub/twinState.jsx'
import API from '../api.js'

const hasSimSpec = (d) => d.source === 'sim'   // runs on the built-in frontend simulator

export default function AssetPicker({ onOpen, active, compact = false, accent = 'var(--brand)' }) {
  const { serviceMode } = useTwin()
  const twinLive = serviceMode === 'live'
  const [templates, setTemplates] = useState(null)   // Set of twin template keys once probed

  // when the twin service is live, learn which templates it can actually create
  useEffect(() => {
    if (!twinLive) { setTemplates(null); return }
    let cancelled = false
    API.twin.templates()
      .then(r => { if (!cancelled) setTemplates(new Set((r?.templates || r || []).map(t => t.key || t))) })
      .catch(() => { if (!cancelled) setTemplates(new Set()) })
    return () => { cancelled = true }
  }, [twinLive])

  // a service-backed domain is openable only if the live service has its template
  const twinSupports = (k) => twinLive && !!templates?.has(k)

  const keys = Object.keys(DOMAINS).filter(k => DOMAINS[k].library !== false)
  const sim = keys.filter(k => hasSimSpec(DOMAINS[k]))
  const svc = keys.filter(k => !hasSimSpec(DOMAINS[k]))

  const Card = ({ k }) => {
    const d = DOMAINS[k]
    const serviceBacked = !hasSimSpec(d)
    const canOpen = !serviceBacked || twinSupports(k)
    const isActive = active === k
    return (
      <div className="card twin-card" style={{ position: 'relative',
        borderColor: isActive ? d.accent : undefined,
        boxShadow: isActive ? `0 0 0 2px ${d.accent}22, 0 8px 24px ${d.accent}18` : undefined,
        opacity: canOpen ? 1 : 0.72 }}>
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
          {!serviceBacked
            ? <span className="pill pill-green">● simulator</span>
            : twinSupports(k)
              ? <span className="pill pill-green">● live service</span>
              : <span className="pill pill-amber">service-backed</span>}
          <span className="pill pill-surface">{d.tiles.length} signals</span>
          {d.assets && <span className="pill pill-surface">{d.assets.length} assets</span>}
        </div>
        <button className="btn btn-primary" style={{ width: '100%', background: canOpen ? d.accent : undefined,
          borderColor: 'transparent', boxShadow: canOpen ? `0 4px 14px ${d.accent}33` : 'none' }}
          disabled={!canOpen}
          onClick={() => canOpen && onOpen(k, d.label)}>
          {canOpen
            ? <><Icon n="ti-bolt" /> Open {serviceBacked ? 'live ' : ''}twin</>
            : twinLive
              ? <><Icon n="ti-plug-connected" /> Not on twin service</>
              : <><Icon n="ti-plug-connected" /> Needs Twin service</>}
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
            <Icon n={twinLive ? 'ti-bolt' : 'ti-plug-connected'} /> {twinLive
              ? 'Service-backed twins — live on the NextXR Digital Twin service'
              : 'Service-backed twins — connect the Digital Twin microservice to run these live'}
          </div>
          <div className="grid-3">{svc.map(k => <Card key={k} k={k} />)}</div>
        </>
      )}
    </div>
  )
}
