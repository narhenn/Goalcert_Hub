// SidebarBuilder.jsx — edit the navigation every user sees.
//
// The sidebar is rows in `menus` + `sidebar_permissions`, so this screen is the
// authoring surface for both: label, icon, route, order, visibility, and which
// permissions reveal an entry. Changes take effect on the next bootstrap fetch.
import React, { useCallback, useEffect, useState } from 'react'
import { Icon } from '../../lib.jsx'
import API from '../../api.js'

export default function SidebarBuilder() {
  const [menus, setMenus] = useState([])
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [editing, setEditing] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [m, p] = await Promise.all([API.rbac.menus(), API.rbac.permissions()])
      setMenus(m.menus || []); setGroups(p.groups || []); setErr(null)
    } catch (e) { setErr(e.detail || e.message) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const quickToggle = async (m) => {
    try { await API.rbac.updateMenu(m.id, { is_visible: !m.isVisible }); load() }
    catch (e) { setErr(e.detail || e.message) }
  }

  const platform = menus.filter(m => m.level === 'platform')
  const company = menus.filter(m => m.level === 'company')

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">Sidebar Builder</div>
          <div className="panel-subtitle">
            Every menu entry, its order and the permissions that reveal it.
            An entry with no permissions is visible to anyone who can see the sidebar.
          </div>
        </div>
        <button className="btn btn-ghost" onClick={load}><Icon n="ti-refresh" /> Reload</button>
      </div>

      {err && <div className="dw-error">{err}</div>}
      {loading && <span className="st-spin" />}

      <div className="mk-section">Platform navigation</div>
      <MenuTree menus={platform} onEdit={setEditing} onToggle={quickToggle} />

      <div className="mk-section">Company navigation</div>
      <MenuTree menus={company} onEdit={setEditing} onToggle={quickToggle} />

      {editing && (
        <MenuEditor menu={editing} groups={groups}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }} />
      )}
    </div>
  )
}

function MenuTree({ menus, onEdit, onToggle }) {
  return (
    <div className="sb-list">
      {menus.map(m => (
        <React.Fragment key={m.id}>
          <MenuRow m={m} onEdit={onEdit} onToggle={onToggle} />
          {(m.children || []).map(c => (
            <MenuRow key={c.id} m={c} child onEdit={onEdit} onToggle={onToggle} />
          ))}
        </React.Fragment>
      ))}
      {!menus.length && <div className="ms-hint">No entries.</div>}
    </div>
  )
}

function MenuRow({ m, child, onEdit, onToggle }) {
  return (
    <div className={`sb-row ${child ? 'child' : ''} ${m.isVisible ? '' : 'hidden'}`}>
      <span className="sb-order">{m.sortOrder}</span>
      <Icon n={m.icon} />
      <span className="sb-label">{m.label}</span>
      <span className="sb-route">{m.route || <em>group</em>}</span>
      <span className="sb-perms">
        {(m.permissions || []).map(p => <span className="ms-chip sm" key={p}>{p}</span>)}
        {!(m.permissions || []).length && <em className="pu-none">open to all</em>}
      </span>
      {m.moduleCode && <span className="pill pill-surface" style={{ fontSize: 9 }}>{m.moduleCode}</span>}
      <button className="btn btn-ghost" title={m.isVisible ? 'Hide' : 'Show'}
        onClick={() => onToggle(m)}>
        <Icon n={m.isVisible ? 'ti-eye' : 'ti-eye-off'} />
      </button>
      <button className="btn btn-ghost" onClick={() => onEdit(m)}><Icon n="ti-edit" /></button>
    </div>
  )
}

function MenuEditor({ menu, groups, onClose, onSaved }) {
  const [f, setF] = useState({
    label: menu.label, icon: menu.icon, route: menu.route || '',
    section: menu.section || '', sort_order: menu.sortOrder, is_visible: menu.isVisible,
  })
  const [sel, setSel] = useState(new Set(menu.permissions || []))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))
  const toggle = (c) => setSel(s => {
    const n = new Set(s); n.has(c) ? n.delete(c) : n.add(c); return n
  })

  const save = async () => {
    setBusy(true); setErr(null)
    try {
      await API.rbac.updateMenu(menu.id, {
        ...f, route: f.route || null, sort_order: Number(f.sort_order) || 0,
        permissions: [...sel],
      })
      onSaved()
    } catch (e) { setErr(e.detail || e.message) }
    finally { setBusy(false) }
  }

  return (
    <div className="ms-modal-wrap" onClick={onClose}>
      <div className="ms-modal co-modal" onClick={e => e.stopPropagation()}>
        <div className="ms-modal-head">
          <div style={{ flex: 1 }}>
            <div className="panel-title">{menu.label}</div>
            <div className="panel-subtitle">{menu.code}</div>
          </div>
          <button className="btn btn-ghost" onClick={onClose}><Icon n="ti-x" /></button>
        </div>

        {err && <div className="dw-error">{err}</div>}

        <div className="co-body">
          <div className="ms-form" style={{ padding: 0 }}>
            <label className="ms-f"><span>Label</span>
              <input value={f.label} onChange={e => set('label', e.target.value)} /></label>
            <label className="ms-f"><span>Icon</span>
              <input value={f.icon} onChange={e => set('icon', e.target.value)} /></label>
            <label className="ms-f"><span>Route <em>(blank = grouping row)</em></span>
              <input value={f.route} onChange={e => set('route', e.target.value)} /></label>
            <label className="ms-f"><span>Section heading</span>
              <input value={f.section} onChange={e => set('section', e.target.value)} /></label>
            <label className="ms-f"><span>Sort order</span>
              <input type="number" value={f.sort_order}
                onChange={e => set('sort_order', e.target.value)} /></label>
            <label className="ms-f ms-check">
              <input type="checkbox" checked={f.is_visible}
                onChange={e => set('is_visible', e.target.checked)} />
              <span>Visible</span>
            </label>
          </div>

          <div className="co-sep">Reveal this entry to anyone holding…</div>
          {groups.map(g => (
            <div className="rp-group" key={g.code}>
              <div className="rp-group-head"><b>{g.name}</b></div>
              <div className="rp-perms">
                {g.permissions.map(p => (
                  <label className={`rp-perm ${sel.has(p.code) ? 'on' : ''}`} key={p.code}>
                    <input type="checkbox" checked={sel.has(p.code)} onChange={() => toggle(p.code)} />
                    <span><b>{p.name}</b><em>{p.code}</em></span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="ms-modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save} disabled={busy}>
            {busy ? <span className="st-spin" /> : <Icon n="ti-check" />} Save entry
          </button>
        </div>
      </div>
    </div>
  )
}
