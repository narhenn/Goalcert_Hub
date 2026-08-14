// Permissions.jsx — the permission catalogue, read-only.
//
// Deliberately not editable: a permission code is a contract the backend
// asserts on (`require_permission("company.users.create")`), so inventing one
// here would produce a row nothing checks. Roles are where you compose them.
import React, { useEffect, useMemo, useState } from 'react'
import { Icon } from '../../lib.jsx'
import API from '../../api.js'

export default function Permissions() {
  const [groups, setGroups] = useState([])
  const [roles, setRoles] = useState([])
  const [q, setQ] = useState('')
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)

  useEffect(() => {
    Promise.all([API.rbac.permissions(), API.rbac.roles()])
      .then(([p, r]) => { setGroups(p.groups || []); setRoles(r.roles || []) })
      .catch(e => setErr(e.detail || e.message))
      .finally(() => setLoading(false))
  }, [])

  // Which roles grant each permission — the question you actually have when
  // looking at a permission ("who can do this?").
  const holders = useMemo(() => {
    const map = {}
    roles.forEach(r => (r.permissions || []).forEach(c => {
      (map[c] ||= []).push(r)
    }))
    return map
  }, [roles])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return groups
    return groups
      .map(g => ({ ...g, permissions: g.permissions.filter(p =>
        p.code.includes(needle) || p.name.toLowerCase().includes(needle)) }))
      .filter(g => g.permissions.length)
  }, [groups, q])

  const total = groups.reduce((n, g) => n + g.permissions.length, 0)

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">Permissions</div>
          <div className="panel-subtitle">
            {total} capabilities the platform can grant. Compose them into roles — codes
            themselves are fixed, because the backend asserts on them.
          </div>
        </div>
        <div className="pu-search">
          <Icon n="ti-search" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filter by code or name" />
        </div>
      </div>

      {err && <div className="dw-error">{err}</div>}
      {loading && <span className="st-spin" />}

      {shown.map(g => (
        <div className="rp-group" key={g.code}>
          <div className="rp-group-head">
            <b>{g.name}</b>
            <span className="ms-hint">{g.permissions.length}</span>
          </div>
          <table className="tx-table">
            <thead><tr><th>Permission</th><th>Code</th><th>Level</th><th>Granted to</th></tr></thead>
            <tbody>
              {g.permissions.map(p => (
                <tr key={p.code}>
                  <td>{p.name}</td>
                  <td className="mono" style={{ fontSize: 11 }}>{p.code}</td>
                  <td><span className={`pill pill-${p.level === 'platform' ? 'amber' : 'surface'}`}>
                    {p.level}</span></td>
                  <td>
                    <div className="pu-roles">
                      {(holders[p.code] || []).map(r => (
                        <span className="ms-chip sm" key={r.id} style={{ color: r.color }}>{r.name}</span>
                      ))}
                      {!(holders[p.code] || []).length && <em className="pu-none">no role</em>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {!loading && !shown.length && (
        <div className="dw-empty" style={{ padding: 40 }}>
          <Icon n="ti-key-off" /><span>No permissions match "{q}".</span>
        </div>
      )}
    </div>
  )
}
