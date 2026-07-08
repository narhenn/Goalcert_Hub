// Audit.jsx — the hub's cross-cutting audit trail. Every module logs into it; this
// aggregated view is a hub-level surface, above any single platform.
import React from 'react'
import { Icon } from '../../lib.jsx'
import { MODULES } from '../../hub/registry.jsx'
import { useAudit } from '../../hub/audit.jsx'
import { timeAgo } from '../../hub/util.js'

export default function Audit() {
  const { entries, clear } = useAudit()
  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">Audit Trail</div>
          <div className="panel-subtitle">Every action across the composed platform, in one log.</div>
        </div>
        {entries.length > 0 && <div className="panel-actions">
          <button className="btn" onClick={clear}><Icon n="ti-trash" /> Clear</button></div>}
      </div>
      <div className="card">
        {entries.length === 0
          ? <div className="empty" style={{ padding: '40px 12px' }}>No activity recorded yet.</div>
          : <div className="event-list">{entries.map(e => {
              const m = MODULES[e.module]
              return (
                <div key={e.id} className="event-item">
                  <div className="event-icon" style={{ background: m?.accentSoft, color: m?.accent }}>
                    <Icon n={m?.icon || 'ti-point'} /></div>
                  <div className="event-body">
                    <div className="event-title">{e.summary}</div>
                    <div className="event-meta">{e.detail}</div>
                    <div style={{ marginTop: 3 }}><span className="pill pill-surface" style={{ fontSize: 9 }}>{m?.label || e.module}</span></div>
                  </div>
                  <div className="event-time">{timeAgo(e.ts)}</div>
                </div>
              )
            })}</div>}
      </div>
    </div>
  )
}
