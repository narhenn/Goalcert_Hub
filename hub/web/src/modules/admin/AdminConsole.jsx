// AdminConsole.jsx — the Admin / IT workspace.
//
// Org identity, enterprise data connectors, service observability, and a
// read-only view of the tenant's entitlements + persona policy (the platform
// owner governs those). User creation & role assignment live in User Management.
import React, { useEffect, useState } from 'react'
import { Icon } from '../../lib.jsx'
import { useAuth } from '../../hub/auth.jsx'
import { MODULE_ORDER, MODULES, useEntitlements } from '../../hub/registry.jsx'
import { PERSONAS, PERSONA_ORDER, usePersona } from '../../hub/personas.jsx'
import { useLoop } from '../../hub/loopState.jsx'
import { SERVICES, useIntegration } from '../../services/integration.jsx'
import API from '../../api.js'

const CONNECTORS_KEY = 'gc_hub_connectors'
const CONNECTORS = [
  { id: 'sap', label: 'SAP PM', icon: 'ti-database', desc: 'Work orders, notifications, equipment master' },
  { id: 'workday', label: 'Workday', icon: 'ti-users-group', desc: 'HR roster, roles, shift assignments' },
  { id: 'maximo', label: 'IBM Maximo', icon: 'ti-tool', desc: 'Asset registry, PM schedules' },
  { id: 'servicenow', label: 'ServiceNow', icon: 'ti-ticket', desc: 'Incidents, change requests' },
  { id: 'iiot', label: 'IIoT Gateway', icon: 'ti-router', desc: 'OPC-UA / MQTT sensor streams → twin ingestion' },
]
const POLICY_MODULES = ['twin', 'scenario', 'agentic']
const STATUS_META = {
  live: { label: 'online', cls: 'pill-green' }, offline: { label: 'sim', cls: 'pill-amber' },
  error: { label: 'error', cls: 'pill-amber' }, unknown: { label: 'probing…', cls: 'pill-surface' },
}

function loadConnectors() {
  try { const v = JSON.parse(localStorage.getItem(CONNECTORS_KEY) || 'null'); if (v) return v } catch {}
  return { sap: true, iiot: true, workday: false, maximo: false, servicenow: false }
}

export default function AdminConsole({ onNav }) {
  const { user } = useAuth()
  const ent = useEntitlements()
  const { policy } = usePersona()
  const { services, refresh } = useIntegration()
  const { events } = useLoop()
  const [connectors, setConnectors] = useState(loadConnectors)
  const [userCount, setUserCount] = useState(null)
  const [platform, setPlatform] = useState(null)

  useEffect(() => {
    API.admin.users().then(({ users }) => setUserCount(users.length)).catch(() => {})
    API.admin.platform().then(p => setPlatform(p.services)).catch(() => {})
  }, [])

  const toggleConnector = (id) => setConnectors(prev => {
    const next = { ...prev, [id]: !prev[id] }
    try { localStorage.setItem(CONNECTORS_KEY, JSON.stringify(next)) } catch {}
    return next
  })

  const liveCount = Object.values(services).filter(s => s.status === 'live').length
  const connectedCount = Object.values(connectors).filter(Boolean).length

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">Admin Console</div>
          <div className="panel-subtitle">{user.orgName} — connectors, identity, policy and platform observability.</div>
        </div>
        <div className="panel-actions">
          <button className="btn btn-primary" onClick={() => onNav && onNav('users')}><Icon n="ti-users-group" /> Manage users</button>
          <button className="btn" onClick={refresh}><Icon n="ti-refresh" /> Re-probe</button>
        </div>
      </div>

      {/* observability strip */}
      <div className="grid-4 section-gap">
        <div className="card kpi"><div className="card-label">Users in {user.orgName}</div>
          <div className="card-value">{userCount ?? '—'}</div>
          <div className="card-change">across {PERSONA_ORDER.length} persona roles</div></div>
        <div className="card kpi"><div className="card-label">Backend services</div>
          <div className="card-value" style={{ color: liveCount === 4 ? 'var(--accent-green)' : liveCount ? 'var(--accent-amber)' : 'var(--accent-red)' }}>
            {liveCount}<span style={{ fontSize: 15 }}>/4</span></div>
          <div className="card-change">rest on the simulator</div></div>
        <div className="card kpi"><div className="card-label">Data connectors</div>
          <div className="card-value">{connectedCount}<span style={{ fontSize: 15 }}>/{CONNECTORS.length}</span></div>
          <div className="card-change">enterprise systems wired in</div></div>
        <div className="card kpi"><div className="card-label">Loop events</div>
          <div className="card-value">{events.length}</div>
          <div className="card-change">flowing through the data bus</div></div>
      </div>

      <div className="grid-2 section-gap">
        {/* platform services */}
        <div className="card">
          <div className="card-title"><Icon n="ti-server" /> Platform services
            <span className={`pill ${liveCount === 4 ? 'pill-green' : liveCount ? 'pill-amber' : 'pill-red'}`}>{liveCount}/4 live</span></div>
          <div className="ad-services">
            {Object.values(SERVICES).map(svc => {
              const s = services[svc.id] || { status: 'unknown' }
              const g = platform?.[svc.id]
              const m = STATUS_META[s.status] || STATUS_META.unknown
              return (
                <div key={svc.id} className="ad-service">
                  <span className="ad-service-dot" style={{ background: s.status === 'live' ? 'var(--accent-green)' : s.status === 'unknown' ? 'var(--hint)' : 'var(--accent-red)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 12.5 }}>{svc.label}</div>
                    <div className="hint mono" style={{ fontSize: 10 }}>{g ? (g.configured ? 'gateway → live' : 'gateway: sim fallback') : svc.health}</div>
                  </div>
                  {s.latency != null && <span className="hint mono" style={{ fontSize: 10.5 }}>{s.latency}ms</span>}
                  <span className={`pill ${m.cls}`} style={{ fontSize: 9 }}>{m.label}</span>
                </div>
              )
            })}
          </div>
          <div className="ad-note"><Icon n="ti-plug-connected" /> Services are proxied through the hub with server-side keys — the browser never sees a service URL or credential. Offline services fall back to the simulator (LIVE / SIM badge on each surface).</div>
        </div>

        {/* identity */}
        <div className="card">
          <div className="card-title"><Icon n="ti-fingerprint" /> Identity & access</div>
          <div className="ad-id-rows">
            <div className="ad-id-row"><Icon n="ti-key" />
              <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 12.5 }}>Password auth (JWT)</div>
                <div className="hint" style={{ fontSize: 11 }}>Active — accounts provisioned by admins, tokens signed server-side</div></div>
              <span className="pill pill-green" style={{ fontSize: 9 }}>live</span></div>
            <div className="ad-id-row"><Icon n="ti-refresh-dot" />
              <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 12.5 }}>SAML SSO / SCIM</div>
                <div className="hint" style={{ fontSize: 11 }}>Map IdP groups → persona roles, auto-provision from Workday</div></div>
              <span className="pill pill-surface" style={{ fontSize: 9 }}>planned</span></div>
            <div className="ad-id-row"><Icon n="ti-users-group" />
              <div style={{ flex: 1 }}><div style={{ fontWeight: 600, fontSize: 12.5 }}>User management</div>
                <div className="hint" style={{ fontSize: 11 }}>Create accounts and assign persona roles</div></div>
              <button className="btn" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => onNav && onNav('users')}>Open</button></div>
          </div>

          <div className="card-title" style={{ marginTop: 18 }}><Icon n="ti-layout-grid" /> Tenant entitlements
            <span className="pill pill-surface" style={{ fontSize: 9 }}>owner-governed</span></div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {MODULE_ORDER.map(id => {
              const m = MODULES[id]; const on = ent.has(id)
              return (
                <span key={id} className={`mod-chip ${on ? '' : 'off'}`} style={{ '--mc': m.accent, '--mc-soft': m.accentSoft }}>
                  <Icon n={on ? 'ti-check' : 'ti-minus'} /> {m.short}
                </span>
              )
            })}
          </div>
        </div>
      </div>

      {/* data connectors */}
      <div className="card section-gap">
        <div className="card-title"><Icon n="ti-plug" /> Data connectors <span className="pill pill-surface">{connectedCount}/{CONNECTORS.length}</span></div>
        <div className="ad-connectors">
          {CONNECTORS.map(c => {
            const on = !!connectors[c.id]
            return (
              <div key={c.id} className={`ad-connector ${on ? 'on' : ''}`}>
                <span className="ad-connector-ic"><Icon n={c.icon} /></span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 12.5 }}>{c.label}</div>
                  <div className="hint" style={{ fontSize: 10.5 }}>{c.desc}</div>
                  {on && <div className="hint mono" style={{ fontSize: 9.5, marginTop: 3, color: 'var(--accent-green)' }}>synced 4 min ago</div>}
                </div>
                <button className={`switcher-toggle ${on ? 'on' : ''}`} style={{ '--mc': 'var(--brand)', border: 0, cursor: 'pointer' }}
                  onClick={() => toggleConnector(c.id)}><span className="knob" /></button>
              </div>
            )
          })}
        </div>
      </div>

      {/* policy matrix — read-only (owner governs) */}
      <div className="card">
        <div className="card-title"><Icon n="ti-shield-lock" /> Persona × platform policy
          <span className="pill pill-surface" style={{ marginLeft: 'auto', fontSize: 9 }}>read-only · set by platform owner</span></div>
        <div style={{ overflowX: 'auto' }}>
          <table className="ops-table ad-matrix">
            <thead><tr><th>Persona</th>{POLICY_MODULES.map(m => (
              <th key={m} style={{ color: MODULES[m].accent }}><Icon n={MODULES[m].icon} /> {MODULES[m].short}</th>))}</tr></thead>
            <tbody>
              {PERSONA_ORDER.map(pid => {
                const p = PERSONAS[pid]; const row = policy[pid] || p.platforms
                return (
                  <tr key={pid}>
                    <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontWeight: 600 }}>
                      <span className="ad-matrix-ic" style={{ background: p.accentSoft, color: p.accent }}><Icon n={p.icon} /></span>{p.label}</span></td>
                    {POLICY_MODULES.map(m => {
                      const on = row.includes(m)
                      return <td key={m}><span className={`ad-cell ${on ? 'on' : ''}`} style={{ '--mc': MODULES[m].accent, cursor: 'default' }}>
                        <Icon n={on ? 'ti-check' : 'ti-minus'} /></span></td>
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
