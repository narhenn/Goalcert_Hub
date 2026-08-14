// PlatformUsers.jsx — the platform owner's view of every user, in every tenant.
//
// Distinct from the company-level UserManagement screen: this one crosses
// tenant boundaries, shows which organisation each person belongs to, and lets
// the owner reassign roles anywhere. It is searchable and paginated because a
// platform that works will not fit on one page.
import React, { useCallback, useEffect, useState } from 'react'
import { Icon } from '../../lib.jsx'
import API from '../../api.js'

const PAGE = 25
const STATUS_PILL = { active: 'pill-green', pending: 'pill-amber', disabled: 'pill-red' }

export default function PlatformUsers() {
  const [d, setD] = useState({ users: [], total: 0, organizations: [] })
  const [q, setQ] = useState('')
  const [orgId, setOrgId] = useState('')
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [editing, setEditing] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setD(await API.platform.users({ q, orgId, limit: PAGE, offset: page * PAGE }))
      setErr(null)
    } catch (e) { setErr(e.detail || e.message) }
    finally { setLoading(false) }
  }, [q, orgId, page])

  // Debounced so typing a name does not fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0)
    return () => clearTimeout(t)
  }, [load, q])

  const toggleStatus = async (u) => {
    const status = u.status === 'disabled' ? 'active' : 'disabled'
    try { await API.admin.updateUser(u.id, { status }); load() }
    catch (e) { setErr(e.detail || e.message) }
  }

  const remove = async (u) => {
    if (!window.confirm(`Delete ${u.email}? This cannot be undone.`)) return
    try { await API.admin.deleteUser(u.id); load() }
    catch (e) { setErr(e.detail || e.message) }
  }

  const pages = Math.ceil(d.total / PAGE) || 1

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">User Management</div>
          <div className="panel-subtitle">
            {d.total} user{d.total === 1 ? '' : 's'} across {d.organizations.length} organisation
            {d.organizations.length === 1 ? '' : 's'}.
          </div>
        </div>
        <div className="pu-filters">
          <div className="pu-search">
            <Icon n="ti-search" />
            <input value={q} placeholder="Search name, email or username"
              onChange={e => { setQ(e.target.value); setPage(0) }} />
          </div>
          <select value={orgId} onChange={e => { setOrgId(e.target.value); setPage(0) }}>
            <option value="">All organisations</option>
            {d.organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
      </div>

      {err && <div className="dw-error">{err}</div>}
      {loading && <span className="st-spin" />}

      {!loading && !d.users.length && (
        <div className="dw-empty" style={{ padding: 40 }}>
          <Icon n="ti-users" /><span>No users match this filter.</span>
        </div>
      )}

      {!!d.users.length && (
        <table className="tx-table pu-table">
          <thead>
            <tr><th>User</th><th>Organisation</th><th>Roles</th><th>Status</th><th /></tr>
          </thead>
          <tbody>
            {d.users.map(u => (
              <tr key={u.id}>
                <td>
                  <div className="pu-user">
                    <span className="pu-av">{(u.fullName || u.email)[0].toUpperCase()}</span>
                    <div style={{ minWidth: 0 }}>
                      <div className="pu-name">{u.fullName || '—'}</div>
                      <div className="pu-mail">{u.email}{u.username && ` · ${u.username}`}</div>
                    </div>
                  </div>
                </td>
                <td>{u.orgName || <em className="pu-plat">Platform</em>}</td>
                <td>
                  <div className="pu-roles">
                    {(u.roles || []).map(r => (
                      <span className="ms-chip sm" key={r.id} style={{ color: r.color }}>{r.name}</span>
                    ))}
                    {!(u.roles || []).length && <em className="pu-none">no roles</em>}
                  </div>
                </td>
                <td><span className={`pill ${STATUS_PILL[u.status] || ''}`}>{u.status}</span></td>
                <td className="r">
                  <button className="btn btn-ghost" onClick={() => setEditing(u)} title="Assign roles">
                    <Icon n="ti-shield-lock" />
                  </button>
                  <button className="btn btn-ghost" onClick={() => toggleStatus(u)}
                    title={u.status === 'disabled' ? 'Activate' : 'Suspend'}>
                    <Icon n={u.status === 'disabled' ? 'ti-user-check' : 'ti-user-off'} />
                  </button>
                  <button className="btn btn-ghost danger" onClick={() => remove(u)} title="Delete">
                    <Icon n="ti-trash" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {pages > 1 && (
        <div className="pu-pager">
          <button className="btn btn-ghost" disabled={page === 0}
            onClick={() => setPage(p => p - 1)}><Icon n="ti-chevron-left" /> Previous</button>
          <span>Page {page + 1} of {pages}</span>
          <button className="btn btn-ghost" disabled={page + 1 >= pages}
            onClick={() => setPage(p => p + 1)}>Next <Icon n="ti-chevron-right" /></button>
        </div>
      )}

      {editing && (
        <RoleAssigner user={editing} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }} />
      )}
    </div>
  )
}

// ── assign roles ──────────────────────────────────────────────────────

function RoleAssigner({ user, onClose, onSaved }) {
  const [roles, setRoles] = useState([])
  const [sel, setSel] = useState(new Set((user.roles || []).map(r => r.id)))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  useEffect(() => {
    // Only roles that live where this user lives can be granted — the API
    // enforces it too, but showing the wrong ones would just invite a 403.
    API.rbac.roles(user.orgId || undefined)
      .then(d => setRoles(d.roles || []))
      .catch(e => setErr(e.detail || e.message))
  }, [user.orgId])

  const toggle = (id) => setSel(s => {
    const n = new Set(s)
    n.has(id) ? n.delete(id) : n.add(id)
    return n
  })

  const save = async () => {
    setBusy(true); setErr(null)
    try { await API.rbac.setUserRoles(user.id, [...sel]); onSaved() }
    catch (e) { setErr(e.detail || e.message) }
    finally { setBusy(false) }
  }

  return (
    <div className="ms-modal-wrap" onClick={onClose}>
      <div className="ms-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <div className="ms-modal-head">
          <div style={{ flex: 1 }}>
            <div className="panel-title">Roles for {user.fullName || user.email}</div>
            <div className="panel-subtitle">{user.orgName || 'Platform'} · multiple roles allowed</div>
          </div>
          <button className="btn btn-ghost" onClick={onClose}><Icon n="ti-x" /></button>
        </div>

        {err && <div className="dw-error">{err}</div>}

        <div className="pu-rolelist">
          {roles.map(r => (
            <label className={`pu-role ${sel.has(r.id) ? 'on' : ''}`} key={r.id}>
              <input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} />
              <span className="pu-role-ic" style={{ color: r.color }}><Icon n={r.icon} /></span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <b>{r.name}</b>
                <em>{r.description}</em>
              </span>
              <span className="pu-role-n">{(r.permissions || []).length}</span>
            </label>
          ))}
          {!roles.length && <div className="ms-hint">No roles available for this user.</div>}
        </div>

        <div className="ms-modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? <span className="st-spin" /> : <Icon n="ti-check" />} Save roles
          </button>
        </div>
      </div>
    </div>
  )
}
