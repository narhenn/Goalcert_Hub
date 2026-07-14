// UserManagement.jsx — where an admin/HR creates employee accounts and assigns
// each one a persona role. The role decides which dashboard that person sees when
// they log in. Org-scoped for admins; super_admin sees all tenants' users.
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Icon } from '../../lib.jsx'
import { useAuth } from '../../hub/auth.jsx'
import { PERSONAS } from '../../hub/personas.jsx'
import API from '../../api.js'

const ROLE_META = {
  admin: { label: 'Admin / IT', icon: 'ti-settings', mc: '#64748b' },
  coo: { label: 'Plant Manager / COO', icon: 'ti-chart-line', mc: '#2563eb' },
  compliance: { label: 'Compliance Officer', icon: 'ti-shield-check', mc: '#16a34a' },
  lnd: { label: 'L&D / Trainer', icon: 'ti-school', mc: '#D07C1E' },
  supervisor: { label: 'Line Supervisor', icon: 'ti-users', mc: '#0891b2' },
  frontline: { label: 'Frontline Operator', icon: 'ti-tool', mc: '#7c3aed' },
}
const STATUS_PILL = { active: 'pill-green', pending: 'pill-amber', disabled: 'pill-red' }

function genPassword() {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ', b = 'abcdefghijkmnpqrstuvwxyz', n = '23456789', s = '!@#$%'
  const pick = (set, k) => Array.from({ length: k }, () => set[Math.floor(Math.random() * set.length)]).join('')
  return pick(a, 2) + pick(b, 4) + pick(n, 3) + pick(s, 1)
}

export default function UserManagement() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState([])
  const [assignable, setAssignable] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [banner, setBanner] = useState(null)   // { email, password }
  const [editing, setEditing] = useState(null) // user id being role-edited

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const { users, assignableRoles } = await API.admin.users()
      setUsers(users); setAssignable(assignableRoles)
    } catch (e) { setErr(e.detail || e.message) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const counts = useMemo(() => {
    const c = {}
    for (const u of users) c[u.role] = (c[u.role] || 0) + 1
    return c
  }, [users])

  const changeRole = async (u, role) => {
    setEditing(null)
    try { await API.admin.updateUser(u.id, { role }); load() }
    catch (e) { setErr(e.detail || e.message) }
  }
  const toggleStatus = async (u) => {
    const status = u.status === 'disabled' ? 'active' : 'disabled'
    try { await API.admin.updateUser(u.id, { status }); load() }
    catch (e) { setErr(e.detail || e.message) }
  }
  const resetPw = async (u) => {
    const pw = genPassword()
    try {
      await API.admin.resetPassword(u.id, { new_password: pw, must_change_password: true })
      setBanner({ email: u.email, password: pw, reset: true })
    } catch (e) { setErr(e.detail || e.message) }
  }
  const removeUser = async (u) => {
    if (!window.confirm(`Delete ${u.email}? This cannot be undone.`)) return
    try { await API.admin.deleteUser(u.id); load() }
    catch (e) { setErr(e.detail || e.message) }
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">User Management</div>
          <div className="panel-subtitle">
            {me.role === 'super_admin' ? 'All tenants — ' : `${me.orgName} — `}
            create accounts and assign the role that decides each person's dashboard.
          </div>
        </div>
        <div className="panel-actions">
          <button className="btn" onClick={load}><Icon n="ti-refresh" /> Refresh</button>
          <button className="btn btn-primary" onClick={() => { setShowCreate(true); setBanner(null) }}>
            <Icon n="ti-user-plus" /> Create user
          </button>
        </div>
      </div>

      {err && <div className="login-error section-gap" style={{ maxWidth: 'none' }}><Icon n="ti-alert-circle" /> {err}
        <button className="btn btn-ghost" style={{ marginLeft: 'auto', padding: '2px 8px' }} onClick={() => setErr(null)}><Icon n="ti-x" /></button></div>}

      {banner && <CredsBanner banner={banner} onClose={() => setBanner(null)} />}

      {/* role distribution */}
      <div className="um-roles section-gap">
        {assignable.map(r => {
          const m = ROLE_META[r] || { label: r, icon: 'ti-user', mc: 'var(--brand)' }
          return (
            <div key={r} className="um-rolecard" style={{ '--mc': m.mc }}>
              <span className="um-rolecard-ic"><Icon n={m.icon} /></span>
              <div style={{ minWidth: 0 }}>
                <div className="um-rolecard-n">{counts[r] || 0}</div>
                <div className="um-rolecard-l">{m.label}</div>
              </div>
            </div>
          )
        })}
      </div>

      {/* user table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="ops-table um-table">
            <thead><tr>
              <th>User</th><th>Role (dashboard)</th>
              {me.role === 'super_admin' && <th>Org</th>}
              <th>Status</th><th>Last login</th><th style={{ textAlign: 'right' }}>Actions</th>
            </tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--hint)' }}>
                  <span className="st-spin" style={{ display: 'inline-block', verticalAlign: 'middle' }} /> loading…</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: 'var(--hint)' }}>
                  No users yet — create the first one.</td></tr>
              ) : users.map(u => {
                const m = ROLE_META[u.role] || { label: u.role, icon: 'ti-crown', mc: '#b45309' }
                const isSelf = u.id === me.id
                const canEdit = u.role !== 'super_admin' && !isSelf
                return (
                  <tr key={u.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <span className="um-av" style={{ background: m.mc }}>{(u.fullName || u.email)[0].toUpperCase()}</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontWeight: 600 }}>{u.fullName || '—'} {isSelf && <span className="hint">(you)</span>}</div>
                          <div className="hint" style={{ fontSize: 11 }}>{u.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      {editing === u.id ? (
                        <select className="hub-input" style={{ width: 190 }} autoFocus defaultValue={u.role}
                          onChange={e => changeRole(u, e.target.value)} onBlur={() => setEditing(null)}>
                          {assignable.map(r => <option key={r} value={r}>{ROLE_META[r]?.label || r}</option>)}
                        </select>
                      ) : (
                        <button className="um-role-pill" style={{ '--mc': m.mc }}
                          disabled={!canEdit} onClick={() => canEdit && setEditing(u.id)}
                          title={canEdit ? 'Change role' : ''}>
                          <Icon n={m.icon} /> {m.label} {canEdit && <Icon n="ti-pencil" />}
                        </button>
                      )}
                    </td>
                    {me.role === 'super_admin' && <td className="hint">{u.orgName || '—'}</td>}
                    <td><span className={`pill ${STATUS_PILL[u.status]}`} style={{ fontSize: 9 }}>{u.status}</span>
                      {u.mustChangePassword && <span className="pill pill-surface" style={{ fontSize: 8.5, marginLeft: 4 }}>temp pw</span>}</td>
                    <td className="hint" style={{ fontSize: 11 }}>{u.lastLogin ? new Date(u.lastLogin).toLocaleString() : 'never'}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {canEdit && <>
                        <button className="um-act" title="Reset password" onClick={() => resetPw(u)}><Icon n="ti-key" /></button>
                        <button className="um-act" title={u.status === 'disabled' ? 'Reactivate' : 'Disable'} onClick={() => toggleStatus(u)}>
                          <Icon n={u.status === 'disabled' ? 'ti-user-check' : 'ti-user-off'} /></button>
                        <button className="um-act danger" title="Delete" onClick={() => removeUser(u)}><Icon n="ti-trash" /></button>
                      </>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showCreate && <CreateUserModal assignable={assignable} isSuper={me.role === 'super_admin'}
        onClose={() => setShowCreate(false)}
        onCreated={(u, pw) => { setShowCreate(false); setBanner({ email: u.email, password: pw }); load() }} />}
    </div>
  )
}

function CredsBanner({ banner, onClose }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard?.writeText(`Email: ${banner.email}\nTemporary password: ${banner.password}`).catch(() => {})
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="um-creds section-gap">
      <Icon n="ti-shield-check" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 13 }}>{banner.reset ? 'Password reset' : 'Account created'} — hand these to the employee</div>
        <div className="mono" style={{ fontSize: 12, marginTop: 4 }}>
          <b>{banner.email}</b> · temp password: <b>{banner.password}</b></div>
        <div className="hint" style={{ fontSize: 10.5, marginTop: 3 }}>They'll be asked to set their own password on first login. This is shown once.</div>
      </div>
      <button className="btn" onClick={copy}><Icon n={copied ? 'ti-check' : 'ti-copy'} /> {copied ? 'Copied' : 'Copy'}</button>
      <button className="btn btn-ghost" onClick={onClose}><Icon n="ti-x" /></button>
    </div>
  )
}

function CreateUserModal({ assignable, isSuper, onClose, onCreated }) {
  const [form, setForm] = useState({ email: '', full_name: '', role: assignable[0] || 'frontline', password: genPassword() })
  const [orgs, setOrgs] = useState([])
  const [orgId, setOrgId] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  useEffect(() => {
    if (isSuper) API.admin.orgs().then(({ orgs }) => { setOrgs(orgs); setOrgId(orgs[0]?.id || '') }).catch(() => {})
  }, [isSuper])

  const submit = async (e) => {
    e.preventDefault(); setErr(null); setBusy(true)
    try {
      const body = { ...form, email: form.email.trim().toLowerCase() }
      if (isSuper) body.org_id = orgId
      const { user } = await API.admin.createUser(body)
      onCreated(user, form.password)
    } catch (e2) { setErr(e2.detail || e2.message); setBusy(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title"><Icon n="ti-user-plus" /> Create user</div>
          <button className="copilot-x" onClick={onClose}><Icon n="ti-x" /></button>
        </div>
        <form onSubmit={submit} className="modal-body">
          {isSuper && (
            <label className="login-field"><span>Organisation</span>
              <select className="hub-input" value={orgId} onChange={e => setOrgId(e.target.value)} required>
                {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </label>
          )}
          <label className="login-field"><span>Full name</span>
            <input className="hub-input" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Alice Tan" /></label>
          <label className="login-field"><span>Work email</span>
            <input className="hub-input" type="email" required value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="alice@company.com" /></label>
          <label className="login-field"><span>Role — decides their dashboard</span>
            <select className="hub-input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              {assignable.map(r => <option key={r} value={r}>{ROLE_META[r]?.label || r}</option>)}
            </select></label>
          <label className="login-field"><span>Temporary password</span>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="hub-input mono" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
              <button type="button" className="btn" onClick={() => setForm(f => ({ ...f, password: genPassword() }))}><Icon n="ti-refresh" /></button>
            </div>
            <span className="hint" style={{ fontSize: 10.5 }}>Employee sets their own on first login.</span></label>

          {err && <div className="login-error"><Icon n="ti-alert-circle" /> {err}</div>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create user'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
