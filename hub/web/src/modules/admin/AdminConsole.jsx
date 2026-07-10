// AdminConsole.jsx — the Admin / IT workspace.
//
// SSO/SCIM provisioning, enterprise data connectors, the persona → platform
// policy matrix, tenant module entitlements, and observability of the platform
// itself (live probes of all backend services through the integration layer).
import React, { useState } from 'react'
import { Icon } from '../../lib.jsx'
import { MODULE_ORDER, MODULES, useEntitlements } from '../../hub/registry.jsx'
import { PERSONAS, PERSONA_ORDER, usePersona } from '../../hub/personas.jsx'
import { useLoop } from '../../hub/loopState.jsx'
import { useAudit } from '../../hub/audit.jsx'
import { SERVICES, useIntegration } from '../../services/integration.jsx'

const CONNECTORS_KEY = 'gc_hub_connectors'
const CONNECTORS = [
  { id: 'sap', label: 'SAP PM', icon: 'ti-database', desc: 'Work orders, notifications, equipment master' },
  { id: 'workday', label: 'Workday', icon: 'ti-users-group', desc: 'HR roster, roles, shift assignments' },
  { id: 'maximo', label: 'IBM Maximo', icon: 'ti-tool', desc: 'Asset registry, PM schedules' },
  { id: 'servicenow', label: 'ServiceNow', icon: 'ti-ticket', desc: 'Incidents, change requests' },
  { id: 'iiot', label: 'IIoT Gateway', icon: 'ti-router', desc: 'OPC-UA / MQTT sensor streams → twin ingestion' },
]

// the three platforms an admin can grant per persona
const POLICY_MODULES = ['twin', 'scenario', 'agentic']

function loadConnectors() {
  try { const v = JSON.parse(localStorage.getItem(CONNECTORS_KEY) || 'null'); if (v) return v } catch {}
  return { sap: true, iiot: true, workday: false, maximo: false, servicenow: false }
}

const STATUS_META = {
  live:    { label: 'online',  cls: 'pill-green' },
  offline: { label: 'offline', cls: 'pill-red' },
  error:   { label: 'error',   cls: 'pill-amber' },
  unknown: { label: 'probing…', cls: 'pill-surface' },
}

export default function AdminConsole() {
  const ent = useEntitlements()
  const { policy, togglePolicy, resetPolicy } = usePersona()
  const { services, refresh } = useIntegration()
  const { events } = useLoop()
  const { entries } = useAudit()
  const [connectors, setConnectors] = useState(loadConnectors)

  const toggleConnector = (id) => {
    setConnectors(prev => {
      const next = { ...prev, [id]: !prev[id] }
      try { localStorage.setItem(CONNECTORS_KEY, JSON.stringify(next)) } catch {}
      return next
    })
  }

  const liveCount = Object.values(services).filter(s => s.status === 'live').length
  const connectedCount = Object.values(connectors).filter(Boolean).length

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">Admin Console</div>
          <div className="panel-subtitle">Identity, connectors, policy and observability — the platform IT and Security sign off on.</div>
        </div>
        <div className="panel-actions">
          <button className="btn" onClick={refresh}><Icon n="ti-refresh" /> Re-probe services</button>
        </div>
      </div>

      {/* observability strip */}
      <div className="grid-4 section-gap">
        <div className="card kpi"><div className="card-label">Backend services</div>
          <div className="card-value" style={{ color: liveCount === 4 ? 'var(--accent-green)' : liveCount === 0 ? 'var(--accent-red)' : 'var(--accent-amber)' }}>
            {liveCount}<span style={{ fontSize: 15 }}>/4</span></div>
          <div className="card-change">live — rest run on the built-in simulator</div></div>
        <div className="card kpi"><div className="card-label">Data connectors</div>
          <div className="card-value">{connectedCount}<span style={{ fontSize: 15 }}>/{CONNECTORS.length}</span></div>
          <div className="card-change">enterprise systems wired in</div></div>
        <div className="card kpi"><div className="card-label">Loop events</div>
          <div className="card-value">{events.length}</div>
          <div className="card-change">flowing through the data bus</div></div>
        <div className="card kpi"><div className="card-label">Audit entries</div>
          <div className="card-value">{entries.length}</div>
          <div className="card-change">this session, immutable trail</div></div>
      </div>

      <div className="grid-2 section-gap">
        {/* platform services — the integration layer's probe state */}
        <div className="card">
          <div className="card-title"><Icon n="ti-server" /> Platform services
            <span className={`pill ${liveCount === 4 ? 'pill-green' : liveCount === 0 ? 'pill-red' : 'pill-amber'}`}>{liveCount}/4 live</span>
          </div>
          <div className="ad-services">
            {Object.values(SERVICES).map(svc => {
              const s = services[svc.id] || { status: 'unknown' }
              const m = STATUS_META[s.status] || STATUS_META.unknown
              return (
                <div key={svc.id} className="ad-service">
                  <span className="ad-service-dot" style={{
                    background: s.status === 'live' ? 'var(--accent-green)' : s.status === 'unknown' ? 'var(--hint)' : 'var(--accent-red)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 12.5 }}>{svc.label}</div>
                    <div className="hint mono" style={{ fontSize: 10 }}>{svc.health}</div>
                  </div>
                  {s.latency != null && <span className="hint mono" style={{ fontSize: 10.5 }}>{s.latency}ms</span>}
                  <span className={`pill ${m.cls}`} style={{ fontSize: 9 }}>{m.label}</span>
                </div>
              )
            })}
          </div>
          <div className="ad-note">
            <Icon n="ti-plug-connected" /> Offline services fall back to the built-in simulator automatically — every surface shows a LIVE / SIM badge for its data source.
          </div>
        </div>

        {/* identity */}
        <div className="card">
          <div className="card-title"><Icon n="ti-fingerprint" /> Identity & provisioning</div>
          <div className="ad-id-rows">
            <div className="ad-id-row">
              <Icon n="ti-key" />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 12.5 }}>SAML SSO</div>
                <div className="hint" style={{ fontSize: 11 }}>idp.acme-industrial.com · auto-login to shift context</div>
              </div>
              <span className="pill pill-green" style={{ fontSize: 9 }}>enforced</span>
            </div>
            <div className="ad-id-row">
              <Icon n="ti-refresh-dot" />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 12.5 }}>SCIM provisioning</div>
                <div className="hint" style={{ fontSize: 11 }}>Roster sync from Workday · 42 users · hourly</div>
              </div>
              <span className="pill pill-green" style={{ fontSize: 9 }}>active</span>
            </div>
            <div className="ad-id-row">
              <Icon n="ti-user-shield" />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 12.5 }}>Persona login mapping</div>
                <div className="hint" style={{ fontSize: 11 }}>IdP group → persona, so users land on their view at SSO</div>
              </div>
              <span className="pill pill-surface" style={{ fontSize: 9 }}>planned</span>
            </div>
          </div>

          <div className="card-title" style={{ marginTop: 18 }}><Icon n="ti-layout-grid" /> Module entitlements</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {MODULE_ORDER.map(id => {
              const m = MODULES[id]; const on = ent.has(id)
              return (
                <button key={id} className={`mod-chip ${on ? '' : 'off'}`} onClick={() => ent.toggle(id)}
                  style={{ '--mc': m.accent, '--mc-soft': m.accentSoft, cursor: 'pointer' }}
                  title={`${on ? 'Disable' : 'Enable'} ${m.label} tenant-wide`}>
                  <Icon n={on ? 'ti-check' : 'ti-plus'} /> {m.short}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* data connectors */}
      <div className="card section-gap">
        <div className="card-title"><Icon n="ti-plug" /> Data connectors
          <span className="pill pill-surface">{connectedCount}/{CONNECTORS.length}</span></div>
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
                <button className={`switcher-toggle ${on ? 'on' : ''}`} style={{ '--mc': 'var(--brand)' , border: 0, cursor: 'pointer' }}
                  onClick={() => toggleConnector(c.id)} title={on ? 'Disconnect' : 'Connect'}>
                  <span className="knob" /></button>
              </div>
            )
          })}
        </div>
      </div>

      {/* persona → platform policy matrix */}
      <div className="card">
        <div className="card-title"><Icon n="ti-shield-lock" /> Role & policy — persona × platform
          <button className="btn" style={{ marginLeft: 'auto', padding: '3px 10px', fontSize: 11 }} onClick={resetPolicy}>
            <Icon n="ti-restore" /> Reset defaults</button>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="ops-table ad-matrix">
            <thead>
              <tr>
                <th>Persona</th>
                {POLICY_MODULES.map(m => (
                  <th key={m} style={{ color: MODULES[m].accent }}><Icon n={MODULES[m].icon} /> {MODULES[m].short}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PERSONA_ORDER.map(pid => {
                const p = PERSONAS[pid]
                return (
                  <tr key={pid}>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontWeight: 600 }}>
                        <span className="ad-matrix-ic" style={{ background: p.accentSoft, color: p.accent }}><Icon n={p.icon} /></span>
                        {p.label}
                      </span>
                    </td>
                    {POLICY_MODULES.map(m => {
                      const on = (policy[pid] || []).includes(m)
                      return (
                        <td key={m}>
                          <button className={`ad-cell ${on ? 'on' : ''}`} style={{ '--mc': MODULES[m].accent }}
                            onClick={() => togglePolicy(pid, m)}
                            title={`${on ? 'Revoke' : 'Grant'} ${MODULES[m].label} for ${p.label}`}>
                            <Icon n={on ? 'ti-check' : 'ti-minus'} />
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="ad-note" style={{ marginTop: 12 }}>
          <Icon n="ti-info-circle" /> Policy filters each persona's navigation live — revoke Scenario from L&D and their studio locks instantly. Entitlements gate the tenant; policy gates the persona.
        </div>
      </div>
    </div>
  )
}
