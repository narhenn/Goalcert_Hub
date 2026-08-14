// Roles.jsx — the role editor.
//
// A role is a named bundle of permissions, so this screen is essentially a
// checkbox matrix grouped by permission group. Shipped roles can be renamed and
// re-permissioned but never deleted; the API enforces that, and the UI reflects
// it rather than pretending otherwise.
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Icon } from '../../lib.jsx'
import API from '../../api.js'

export default function Roles() {
  const [roles, setRoles] = useState([])
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [editing, setEditing] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [r, p] = await Promise.all([API.rbac.roles(), API.rbac.permissions()])
      setRoles(r.roles || []); setGroups(p.groups || []); setErr(null)
    } catch (e) { setErr(e.detail || e.message) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const remove = async (r) => {
    if (!window.confirm(`Delete the role "${r.name}"?`)) return
    try { await API.rbac.deleteRole(r.id); load() }
    catch (e) { setErr(e.detail || e.message) }
  }

  const templates = roles.filter(r => r.isTemplate)
  const platform = roles.filter(r => !r.isTemplate)

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">Roles</div>
          <div className="panel-subtitle">
            Platform roles, and the company blueprints every new tenant is cloned from.
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({ permissions: [] })}>
          <Icon n="ti-plus" /> New role
        </button>
      </div>

      {err && <div className="dw-error">{err}</div>}
      {loading && <span className="st-spin" />}

      {!!platform.length && <div className="mk-section">Platform roles</div>}
      <RoleList roles={platform} onEdit={setEditing} onRemove={remove} />

      {!!templates.length && <div className="mk-section">Company role blueprints</div>}
      <RoleList roles={templates} onEdit={setEditing} onRemove={remove} />

      {editing && (
        <RoleEditor role={editing} groups={groups}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }} />
      )}
    </div>
  )
}

function RoleList({ roles, onEdit, onRemove }) {
  return (
    <div className="ms-grid">
      {roles.map(r => (
        <div className="ms-card" key={r.id} style={{ '--mc': r.color }}>
          <div className="ms-card-top">
            <span className="ms-ic"><Icon n={r.icon} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="ms-name">{r.name}</div>
              <div className="ms-code">{r.code}</div>
            </div>
            {r.isSystem && <span className="pill pill-surface" style={{ fontSize: 9 }}>shipped</span>}
            {r.isReadonly && <span className="pill pill-amber" style={{ fontSize: 9 }}>read-only</span>}
          </div>
          <div className="ms-tag">{r.description}</div>
          <div className="ms-meta">
            <span><b>{(r.permissions || []).length}</b> permissions</span>
            <span><b>{r.userCount}</b> users</span>
            {r.isDefault && <span>default</span>}
          </div>
          <div className="ms-actions">
            <button className="btn btn-ghost" onClick={() => onEdit(r)}>
              <Icon n="ti-edit" /> Edit
            </button>
            {!r.isSystem && (
              <button className="btn btn-ghost danger" onClick={() => onRemove(r)}>
                <Icon n="ti-trash" />
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── editor ────────────────────────────────────────────────────────────

function RoleEditor({ role, groups, onClose, onSaved }) {
  const isNew = !role.id
  const [f, setF] = useState({
    code: role.code || '', name: role.name || '', description: role.description || '',
    icon: role.icon || 'ti-user', color: role.color || '#6d28d9',
  })
  const [sel, setSel] = useState(new Set(role.permissions || []))
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  const toggle = (code) => setSel(s => {
    const n = new Set(s); n.has(code) ? n.delete(code) : n.add(code); return n
  })

  const toggleGroup = (perms) => setSel(s => {
    const n = new Set(s)
    const all = perms.every(p => n.has(p.code))
    perms.forEach(p => all ? n.delete(p.code) : n.add(p.code))
    return n
  })

  // Filter within groups so searching never hides a group's select-all control
  // for permissions that still match.
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return groups
    return groups
      .map(g => ({ ...g, permissions: g.permissions.filter(p =>
        p.code.includes(needle) || p.name.toLowerCase().includes(needle)) }))
      .filter(g => g.permissions.length)
  }, [groups, q])

  const save = async () => {
    if (!f.name.trim()) { setErr('Name is required'); return }
    setBusy(true); setErr(null)
    const body = { ...f, permissions: [...sel] }
    try {
      if (isNew) await API.rbac.createRole({ ...body, code: f.code || f.name.toLowerCase().replace(/\W+/g, '_') })
      else await API.rbac.updateRole(role.id, body)
      onSaved()
    } catch (e) { setErr(e.detail || e.message) }
    finally { setBusy(false) }
  }

  return (
    <div className="ms-modal-wrap" onClick={onClose}>
      <div className="ms-modal co-modal" onClick={e => e.stopPropagation()}>
        <div className="ms-modal-head">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="panel-title">{isNew ? 'New role' : `Edit ${role.name}`}</div>
            <div className="panel-subtitle">{sel.size} permission(s) selected</div>
          </div>
          <button className="btn btn-ghost" onClick={onClose}><Icon n="ti-x" /></button>
        </div>

        {err && <div className="dw-error">{err}</div>}

        <div className="co-body">
          <div className="ms-form" style={{ padding: 0 }}>
            <label className="ms-f"><span>Name *</span>
              <input value={f.name} onChange={e => set('name', e.target.value)} autoFocus /></label>
            {isNew && (
              <label className="ms-f"><span>Code</span>
                <input value={f.code} onChange={e => set('code', e.target.value)}
                  placeholder="auto from name" /></label>
            )}
            <label className="ms-f full"><span>Description</span>
              <input value={f.description} onChange={e => set('description', e.target.value)} /></label>
            <label className="ms-f"><span>Icon</span>
              <input value={f.icon} onChange={e => set('icon', e.target.value)} /></label>
            <label className="ms-f"><span>Colour</span>
              <input type="color" value={f.color} onChange={e => set('color', e.target.value)} /></label>
          </div>

          <div className="co-sep">Permissions</div>
          <div className="pu-search" style={{ marginBottom: 8 }}>
            <Icon n="ti-search" />
            <input value={q} onChange={e => setQ(e.target.value)}
              placeholder="Filter permissions" style={{ width: '100%' }} />
          </div>

          {shown.map(g => {
            const all = g.permissions.every(p => sel.has(p.code))
            return (
              <div className="rp-group" key={g.code}>
                <div className="rp-group-head">
                  <b>{g.name}</b>
                  <button className="btn btn-ghost" onClick={() => toggleGroup(g.permissions)}>
                    {all ? 'Clear all' : 'Select all'}
                  </button>
                </div>
                <div className="rp-perms">
                  {g.permissions.map(p => (
                    <label className={`rp-perm ${sel.has(p.code) ? 'on' : ''}`} key={p.code}>
                      <input type="checkbox" checked={sel.has(p.code)}
                        onChange={() => toggle(p.code)} />
                      <span>
                        <b>{p.name}</b>
                        <em>{p.code}</em>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )
          })}
          {!shown.length && <div className="ms-hint">No permissions match "{q}".</div>}
        </div>

        <div className="ms-modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? <span className="st-spin" /> : <Icon n="ti-check" />} Save role
          </button>
        </div>
      </div>
    </div>
  )
}
