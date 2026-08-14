// SuperAdminConsole.jsx — the platform owner's workspace.
//
// Provision organisations (tenants), seat their first admin, set each tenant's
// entitlements (which of the 3 platforms + modules they adopted) and persona
// policy, and watch platform service health across every tenant.
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Icon } from '../../lib.jsx'
import { MODULE_ORDER, MODULES } from '../../hub/registry.jsx'
import { PERSONA_ORDER, PERSONAS } from '../../hub/personas.jsx'
import { SERVICES, useIntegration } from '../../services/integration.jsx'
import API from '../../api.js'
import UsersModal from './Users.jsx'

const POLICY_MODULES = ['twin', 'scenario', 'agentic']

export default function SuperAdminConsole() {
  const { services, refresh } = useIntegration()
  const [platform, setPlatform] = useState(null)
  const [orgs, setOrgs] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [banner, setBanner] = useState(null)
  const [selected, setSelected] = useState(null)   // org id being edited
  const [showUsers, setShowUsers] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [{ orgs }, plat] = await Promise.all([API.admin.orgs(), API.admin.platform().catch(() => null)])
      setOrgs(orgs); setPlatform(plat?.services || null)
    } catch (e) { setErr(e.detail || e.message) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const totals = useMemo(() => ({
    orgs: orgs.length,
    users: orgs.reduce((a, o) => a + (o.userCount || 0), 0),
    liveServices: Object.values(services).filter(s => s.status === 'live').length,
  }), [orgs, services])

  const selectedOrg = orgs.find(o => o.id === selected) || null

  const saveOrg = async (id, patch) => {
    try { const { org } = await API.admin.updateOrg(id, patch); setOrgs(prev => prev.map(o => o.id === id ? org : o)) }
    catch (e) { setErr(e.detail || e.message) }
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">Platform Owner</div>
          <div className="panel-subtitle">Provision organisations, seat their admins, and govern entitlements across every tenant.</div>
        </div>
        <div className="panel-actions">
          <button className="btn" onClick={() => { load(); refresh() }}><Icon n="ti-refresh" /> Refresh</button>
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}><Icon n="ti-building-plus" /> New organisation</button>
          <button className="btn" onClick={() => setShowUsers(true)}><Icon n="ti-users" /> Users</button>
        </div>
      </div>

      {err && <div className="login-error section-gap" style={{ maxWidth: 'none' }}><Icon n="ti-alert-circle" /> {err}
        <button className="btn btn-ghost" style={{ marginLeft: 'auto', padding: '2px 8px' }} onClick={() => setErr(null)}><Icon n="ti-x" /></button></div>}
      {banner && <div className="um-creds section-gap"><Icon n="ti-shield-check" />
        <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 13 }}>Organisation created</div>
          <div className="mono" style={{ fontSize: 12, marginTop: 4 }}>Admin <b>{banner.email}</b> · temp password <b>{banner.password}</b></div></div>
        <button className="btn btn-ghost" onClick={() => setBanner(null)}><Icon n="ti-x" /></button></div>}

      {/* platform KPIs */}
      <div className="grid-4 section-gap">
        <div className="card kpi"><div className="card-label">Organisations</div><div className="card-value">{totals.orgs}</div>
          <div className="card-change">tenants provisioned</div></div>
        <div className="card kpi"><div className="card-label">Total users</div><div className="card-value">{totals.users}</div>
          <div className="card-change">across all tenants</div></div>
        <div className="card kpi"><div className="card-label">Live services</div>
          <div className="card-value" style={{ color: totals.liveServices === 4 ? 'var(--accent-green)' : totals.liveServices ? 'var(--accent-amber)' : 'var(--accent-red)' }}>
            {totals.liveServices}<span style={{ fontSize: 15 }}>/4</span></div>
          <div className="card-change">rest run on the simulator</div></div>
        <div className="card kpi"><div className="card-label">Gateway</div>
          <div className="card-value" style={{ fontSize: 20 }}>{platform ? Object.values(platform).filter(s => s.configured).length : '—'}<span style={{ fontSize: 14 }}>/3</span></div>
          <div className="card-change">platform APIs wired server-side</div></div>
      </div>

      <div className="grid-2 section-gap">
        {/* service + gateway observability */}
        <div className="card">
          <div className="card-title"><Icon n="ti-server-cog" /> Platform services & gateway</div>
          <div className="ad-services">
            {Object.values(SERVICES).map(svc => {
              const s = services[svc.id] || { status: 'unknown' }
              const g = platform?.[svc.id]
              const dot = s.status === 'live' ? 'var(--accent-green)' : s.status === 'unknown' ? 'var(--hint)' : 'var(--accent-red)'
              return (
                <div key={svc.id} className="ad-service">
                  <span className="ad-service-dot" style={{ background: dot }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 12.5 }}>{svc.label}</div>
                    <div className="hint mono" style={{ fontSize: 10 }}>
                      {g ? (g.configured ? `→ ${g.base}` : 'gateway: not configured (sim)') : svc.health}
                    </div>
                  </div>
                  {s.latency != null && <span className="hint mono" style={{ fontSize: 10.5 }}>{s.latency}ms</span>}
                  <span className={`pill ${s.status === 'live' ? 'pill-green' : s.status === 'unknown' ? 'pill-surface' : 'pill-red'}`} style={{ fontSize: 9 }}>
                    {s.status === 'live' ? 'online' : s.status === 'unknown' ? 'probing' : 'sim'}</span>
                </div>
              )
            })}
          </div>
          <div className="ad-note"><Icon n="ti-plug-connected" /> Configure each service's URL + key in the hub backend env. Keys are injected server-side and never reach the browser; unconfigured services fall back to the simulator.</div>
        </div>

        {/* org list */}
        <div className="card">
          <div className="card-title"><Icon n="ti-building" /> Organisations <span className="pill pill-surface">{orgs.length}</span></div>
          {loading ? <div className="empty"><span className="st-spin" style={{ display: 'inline-block' }} /> loading…</div>
            : orgs.length === 0 ? <div className="empty">No organisations yet — create the first tenant.</div>
            : (
              <div className="sa-orglist">
                {orgs.map(o => (
                  <button key={o.id} className={`sa-org ${selected === o.id ? 'on' : ''}`} onClick={() => setSelected(s => s === o.id ? null : o.id)}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{o.name}</div>
                      <div className="hint" style={{ fontSize: 11 }}>{o.userCount} user{o.userCount !== 1 ? 's' : ''} · {(o.entitlements || []).length} modules</div>
                    </div>
                    <span className={`pill ${o.status === 'active' ? 'pill-green' : 'pill-surface'}`} style={{ fontSize: 9 }}>{o.status}</span>
                    <Icon n={selected === o.id ? 'ti-chevron-up' : 'ti-chevron-down'} />
                  </button>
                ))}
              </div>
            )}
        </div>
      </div>

      {/* org entitlement + policy editor */}
      {selectedOrg && (
        <div className="card section-gap">
          <div className="card-title"><Icon n="ti-adjustments" /> {selectedOrg.name} — entitlements & policy
            <span className="pill pill-surface" style={{ marginLeft: 'auto' }}>{selectedOrg.slug}</span></div>

          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 8, fontWeight: 600 }}>Modules this tenant adopted</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
            {MODULE_ORDER.map(id => {
              const m = MODULES[id]; const on = (selectedOrg.entitlements || []).includes(id)
              return (
                <button key={id} className={`mod-chip ${on ? '' : 'off'}`} style={{ '--mc': m.accent, '--mc-soft': m.accentSoft, cursor: 'pointer' }}
                  onClick={() => {
                    const next = on ? selectedOrg.entitlements.filter(x => x !== id)
                      : MODULE_ORDER.filter(x => [...selectedOrg.entitlements, id].includes(x))
                    saveOrg(selectedOrg.id, { entitlements: next })
                  }}>
                  <Icon n={on ? 'ti-check' : 'ti-plus'} /> {m.short}
                </button>
              )
            })}
          </div>

          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginBottom: 8, fontWeight: 600 }}>Persona × platform policy — who may use what</div>
          <div style={{ overflowX: 'auto' }}>
            <table className="ops-table ad-matrix">
              <thead><tr><th>Persona</th>{POLICY_MODULES.map(m => (
                <th key={m} style={{ color: MODULES[m].accent }}><Icon n={MODULES[m].icon} /> {MODULES[m].short}</th>))}</tr></thead>
              <tbody>
                {PERSONA_ORDER.map(pid => {
                  const p = PERSONAS[pid]; const row = selectedOrg.policy?.[pid] || []
                  return (
                    <tr key={pid}>
                      <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontWeight: 600 }}>
                        <span className="ad-matrix-ic" style={{ background: p.accentSoft, color: p.accent }}><Icon n={p.icon} /></span>{p.label}</span></td>
                      {POLICY_MODULES.map(m => {
                        const on = row.includes(m)
                        return (
                          <td key={m}><button className={`ad-cell ${on ? 'on' : ''}`} style={{ '--mc': MODULES[m].accent }}
                            onClick={() => {
                              const cur = selectedOrg.policy?.[pid] || []
                              const nextRow = on ? cur.filter(x => x !== m) : [...cur, m]
                              saveOrg(selectedOrg.id, { policy: { ...selectedOrg.policy, [pid]: nextRow } })
                            }}><Icon n={on ? 'ti-check' : 'ti-minus'} /></button></td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showCreate && <CreateOrgModal onClose={() => setShowCreate(false)}
        onCreated={(res) => {
          setShowCreate(false)
          if (res.admin) setBanner({ email: res.admin.email, password: res._pw })
          load()
        }} />}
      {showUsers && <UsersModal onClose={() => setShowUsers(false)} />}
    </div>
  )
}

function genPassword() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ', b = 'abcdefghijkmnpqrstuvwxyz', n = '23456789', s = '!@#$%'
  const pick = (set, k) => Array.from({ length: k }, () => set[Math.floor(Math.random() * set.length)]).join('')
  return pick(a, 2) + pick(b, 4) + pick(n, 3) + pick(s, 1)
}

function CreateOrgModal({ onClose, onCreated }) {
  const [name, setName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminName, setAdminName] = useState('')
  const [pw, setPw] = useState(genPassword())
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const submit = async (e) => {
    e.preventDefault(); setErr(null); setBusy(true)
    try {
      const res = await API.admin.createOrg({
        name, admin_email: adminEmail.trim().toLowerCase() || undefined,
        admin_name: adminName || undefined, admin_password: adminEmail ? pw : undefined,
      })
      onCreated({ ...res, _pw: pw })
    } catch (e2) { setErr(e2.detail || e2.message); setBusy(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head"><div className="modal-title"><Icon n="ti-building-plus" /> New organisation</div>
          <button className="copilot-x" onClick={onClose}><Icon n="ti-x" /></button></div>
        <form onSubmit={submit} className="modal-body">
          <label className="login-field"><span>Organisation name</span>
            <input className="hub-input" required value={name} onChange={e => setName(e.target.value)} placeholder="Acme Industrial" autoFocus /></label>
          <div className="modal-divider">Seat the first admin (optional — can add later)</div>
          <label className="login-field"><span>Admin full name</span>
            <input className="hub-input" value={adminName} onChange={e => setAdminName(e.target.value)} placeholder="Dana HR" /></label>
          <label className="login-field"><span>Admin email</span>
            <input className="hub-input" type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} placeholder="hr@acme.com" /></label>
          {adminEmail && (
            <label className="login-field"><span>Admin temporary password</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="hub-input mono" value={pw} onChange={e => setPw(e.target.value)} />
                <button type="button" className="btn" onClick={() => setPw(genPassword())}><Icon n="ti-refresh" /></button>
              </div></label>
          )}
          {err && <div className="login-error"><Icon n="ti-alert-circle" /> {err}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy || !name}>{busy ? 'Creating…' : 'Create organisation'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
