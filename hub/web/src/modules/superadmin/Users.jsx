// Users.jsx — Superadmin user management: list, edit details, assign roles
import React, { useEffect, useState } from 'react'
import API from '../../api.js'
import { Icon } from '../../lib.jsx'

export default function UsersModal({ onClose }) {
  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [editing, setEditing] = useState(null)

  useEffect(() => { load() }, [])
  async function load() {
    setLoading(true)
    try {
      const [uRes, rRes] = await Promise.all([API.admin.users(), API.rbac.roles()])
      setUsers(uRes.users || [])
      setRoles(rRes.roles || [])
      setErr(null)
    } catch (e) { setErr(e.detail || e.message) }
    finally { setLoading(false) }
  }

  const openEdit = (u) => setEditing({ ...u, roleIds: [] })

  useEffect(() => {
    if (!editing) return
    (async () => {
      try {
        const res = await API.rbac.userRoles(editing.id)
        setEditing(e => ({ ...e, roleIds: res.role_ids || [] }))
      } catch (e) { /* ignore */ }
    })()
  }, [editing])

  const save = async () => {
    if (!editing) return
    try {
      await API.admin.updateUser(editing.id, { full_name: editing.full_name, email: editing.email })
      await API.rbac.setUserRoles(editing.id, editing.roleIds || [])
      setEditing(null); load()
    } catch (e) { setErr(e.detail || e.message) }
  }

  return (
    <div className="ms-modal-wrap" onClick={onClose}>
      <div className="ms-modal" onClick={e => e.stopPropagation()} style={{ width: 820 }}>
        <div className="ms-modal-head">
          <div className="panel-title">Platform Users</div>
          <button className="btn btn-ghost" onClick={onClose}><Icon n="ti-x" /></button>
        </div>
        <div style={{ padding: 14 }}>
          {err && <div className="dw-error" style={{ marginBottom: 8 }}>{err}</div>}
          {loading ? <div className="empty"><span className="st-spin" /> loading…</div> : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 12 }}>
              <div>
                <div style={{ marginBottom: 8, fontWeight: 700 }}>All users</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {users.map(u => (
                    <div key={u.id} className="sa-org" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700 }}>{u.full_name || u.email}</div>
                        <div className="hint" style={{ fontSize: 12 }}>{u.email} · {u.orgName || ''}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn" onClick={() => openEdit(u)}><Icon n="ti-edit" /> Edit</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ marginBottom: 8, fontWeight: 700 }}>Edit user</div>
                {!editing ? <div className="hint">Select a user to edit their details and roles.</div> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <label className="ms-f full"><span>Full name</span>
                      <input className="hub-input" value={editing.full_name || ''} onChange={e => setEditing(s => ({ ...s, full_name: e.target.value }))} /></label>
                    <label className="ms-f full"><span>Email</span>
                      <input className="hub-input" value={editing.email || ''} onChange={e => setEditing(s => ({ ...s, email: e.target.value }))} /></label>
                    <div>
                      <div style={{ fontWeight: 600, marginBottom: 6 }}>Roles</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {roles.map(r => (
                          <label key={r.code} style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            <input type="checkbox" checked={(editing.roleIds || []).includes(r.id)}
                              onChange={e => setEditing(s => ({ ...s, roleIds: e.target.checked ? [...(s.roleIds || []), r.id] : (s.roleIds || []).filter(x => x !== r.id) }))} />
                            <span className="pill pill-surface">{r.code}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                      <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
                      <button className="btn btn-primary" onClick={save}><Icon n="ti-check" /> Save</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
