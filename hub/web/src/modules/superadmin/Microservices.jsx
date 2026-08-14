// Microservices.jsx — the platform owner creates and edits what the platform
// sells. Whatever is saved here is what the public pricing page and every
// tenant's marketplace render; there is no second list in code.
import React, { useCallback, useEffect, useState } from 'react'
import { Icon } from '../../lib.jsx'
import API from '../../api.js'
import MediaUpload from '../../hub/MediaUpload.jsx'

const BLANK = {
  name: '', code: '', tagline: '', description: '', features: [],
  category: '', version: '1.0.0', icon: 'ti-box', color: '#6d28d9',
  redirect_url: '', login_url: '', logo_url: '', banner_url: '',
  thumbnail_url: '', preview_video_url: '',
  status: 'active', is_active: true, is_public: true, sort_order: 100,
}

export default function Microservices() {
  const [mods, setMods] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [editing, setEditing] = useState(null)   // module object or BLANK

  const load = useCallback(async () => {
    setLoading(true)
    try { setMods((await API.platform.modules()).modules) ; setErr(null) }
    catch (e) { setErr(e.detail || e.message) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const remove = async (m) => {
    if (!window.confirm(`Delete "${m.name}"? Tenants already subscribed will block this.`)) return
    try { await API.platform.deleteModule(m.id); load() }
    catch (e) { setErr(e.detail || e.message) }
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">Microservices</div>
          <div className="panel-subtitle">
            What the platform sells. Saved here → visible on the public pricing page
            and in every tenant's marketplace.
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing({ ...BLANK })}>
          <Icon n="ti-plus" /> New microservice
        </button>
      </div>

      {err && <div className="dw-error">{err}</div>}
      {loading && <span className="st-spin" />}

      <div className="ms-grid">
        {mods.map(m => (
          <div className="ms-card" key={m.id} style={{ '--mc': m.color }}>
            <div className="ms-card-top">
              <span className="ms-ic"><Icon n={m.icon} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="ms-name">{m.name}</div>
                <div className="ms-code">{m.code} · v{m.version}</div>
              </div>
              {!m.isPublic && <span className="pill pill-amber" style={{ fontSize: 9 }}>hidden</span>}
              {!m.isActive && <span className="pill pill-red" style={{ fontSize: 9 }}>off</span>}
            </div>
            {m.tagline && <div className="ms-tag">{m.tagline}</div>}
            <div className="ms-meta">
              <span><b>{m.planCount}</b> plans</span>
              <span><b>{m.subscriberCount}</b> subscribers</span>
              {m.category && <span>{m.category}</span>}
            </div>
            {!!(m.features || []).length && (
              <ul className="ms-feats">
                {m.features.slice(0, 3).map((f, i) => <li key={i}><Icon n="ti-check" />{f}</li>)}
                {m.features.length > 3 && <li className="more">+{m.features.length - 3} more</li>}
              </ul>
            )}
            <div className="ms-actions">
              <button className="btn btn-ghost" onClick={() => setEditing(m)}>
                <Icon n="ti-edit" /> Edit
              </button>
              {m.redirectUrl && (
                <a className="btn btn-ghost" href={m.redirectUrl} target="_blank" rel="noreferrer">
                  <Icon n="ti-external-link" /> Open
                </a>
              )}
              <button className="btn btn-ghost danger" onClick={() => remove(m)}>
                <Icon n="ti-trash" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <ModuleForm
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}
    </div>
  )
}

// ── the add / edit form ───────────────────────────────────────────────

function ModuleForm({ initial, onClose, onSaved }) {
  const isNew = !initial.id
  const [f, setF] = useState({
    ...BLANK, ...initial,
    features: initial.features || [],
    redirect_url: initial.redirectUrl || '',
    login_url: initial.loginUrl || '',
    logo_url: initial.logoUrl || '',
    banner_url: initial.bannerUrl || '',
    thumbnail_url: initial.thumbnailUrl || '',
    preview_video_url: initial.previewVideoUrl || '',
    is_active: initial.isActive ?? true,
    is_public: initial.isPublic ?? true,
    sort_order: initial.sortOrder ?? 100,
  })
  const [featDraft, setFeatDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  const addFeature = () => {
    const v = featDraft.trim()
    if (!v) return
    set('features', [...f.features, v])
    setFeatDraft('')
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!f.name.trim()) { setErr('Name is required'); return }
    setBusy(true); setErr(null)
    const body = {
      name: f.name.trim(), description: f.description, tagline: f.tagline,
      features: f.features, category: f.category, version: f.version,
      icon: f.icon, color: f.color,
      redirect_url: f.redirect_url || null, login_url: f.login_url || null,
      logo_url: f.logo_url || null, banner_url: f.banner_url || null,
      thumbnail_url: f.thumbnail_url || null,
      preview_video_url: f.preview_video_url || null,
      status: f.status, is_active: f.is_active, is_public: f.is_public,
      sort_order: Number(f.sort_order) || 100,
    }
    try {
      if (isNew) await API.platform.createModule({ ...body, code: f.code || undefined })
      else await API.platform.updateModule(initial.id, body)
      onSaved()
    } catch (e2) { setErr(e2.detail || e2.message) }
    finally { setBusy(false) }
  }

  return (
    <div className="ms-modal-wrap" onClick={onClose}>
      <form className="ms-modal" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <div className="ms-modal-head">
          <div className="panel-title">{isNew ? 'New microservice' : `Edit ${initial.name}`}</div>
          <button type="button" className="btn btn-ghost" onClick={onClose}><Icon n="ti-x" /></button>
        </div>

        {err && <div className="dw-error">{err}</div>}

        <div className="ms-form">
          <label className="ms-f full">
            <span>Name *</span>
            <input value={f.name} onChange={e => set('name', e.target.value)}
              placeholder="e.g. Predictive Maintenance AI" autoFocus />
          </label>

          {isNew && (
            <label className="ms-f">
              <span>Code <em>(URL id — auto from name if blank)</em></span>
              <input value={f.code} onChange={e => set('code', e.target.value)}
                placeholder="predictive-maintenance" />
            </label>
          )}
          <label className="ms-f">
            <span>Category</span>
            <input value={f.category} onChange={e => set('category', e.target.value)}
              placeholder="Operations" />
          </label>

          <label className="ms-f full">
            <span>Tagline <em>(one line on the card)</em></span>
            <input value={f.tagline} onChange={e => set('tagline', e.target.value)}
              placeholder="Real-time asset & infrastructure replicas" />
          </label>

          <label className="ms-f full">
            <span>Description</span>
            <textarea rows={3} value={f.description}
              onChange={e => set('description', e.target.value)}
              placeholder="What this service does, in a sentence or two." />
          </label>

          <div className="ms-f full">
            <span>Features</span>
            <div className="ms-feat-add">
              <input value={featDraft} onChange={e => setFeatDraft(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addFeature() } }}
                placeholder="Type a feature and press Enter" />
              <button type="button" className="btn btn-ghost" onClick={addFeature}>
                <Icon n="ti-plus" />
              </button>
            </div>
            <div className="ms-chips">
              {f.features.map((x, i) => (
                <span className="ms-chip" key={i}>
                  {x}
                  <button type="button"
                    onClick={() => set('features', f.features.filter((_, j) => j !== i))}>
                    <Icon n="ti-x" />
                  </button>
                </span>
              ))}
              {!f.features.length && <span className="ms-hint">No features yet.</span>}
            </div>
          </div>

          <label className="ms-f full">
            <span>Redirect URL <em>(where "Explore" sends a subscribed tenant)</em></span>
            <input value={f.redirect_url} onChange={e => set('redirect_url', e.target.value)}
              placeholder="https://service.example.com/app" />
          </label>
          <label className="ms-f">
            <span>Login URL</span>
            <input value={f.login_url} onChange={e => set('login_url', e.target.value)}
              placeholder="https://service.example.com/login" />
          </label>
          <label className="ms-f">
            <span>Version</span>
            <input value={f.version} onChange={e => set('version', e.target.value)} />
          </label>

          <label className="ms-f">
            <span>Icon <em>(tabler name)</em></span>
            <input value={f.icon} onChange={e => set('icon', e.target.value)} placeholder="ti-box" />
          </label>
          <label className="ms-f">
            <span>Accent colour</span>
            <input type="color" value={f.color} onChange={e => set('color', e.target.value)} />
          </label>

          {/* Uploaded through the storage layer, so these hold whatever URL
              the active driver returned — local disk or S3. */}
          <div className="ms-f full">
            <MediaUpload kind="image" folder="microservices/thumbnails"
              label="Thumbnail" hint="shown on the marketplace card · PNG, JPG or WebP"
              value={f.thumbnail_url || null}
              onChange={url => set('thumbnail_url', url || '')} />
          </div>
          <div className="ms-f full">
            <MediaUpload kind="video" folder="microservices/previews"
              label="Preview video" hint="plays in the Preview dialog · MP4 or WebM"
              value={f.preview_video_url || null}
              onChange={url => set('preview_video_url', url || '')} />
          </div>
          <div className="ms-f full">
            <MediaUpload kind="image" folder="microservices/logos"
              label="Logo" hint="optional — square mark"
              value={f.logo_url || null}
              onChange={url => set('logo_url', url || '')} />
          </div>
          <div className="ms-f full">
            <MediaUpload kind="image" folder="microservices/banners"
              label="Banner" hint="optional — wide header image"
              value={f.banner_url || null}
              onChange={url => set('banner_url', url || '')} />
          </div>

          <label className="ms-f ms-check">
            <input type="checkbox" checked={f.is_active}
              onChange={e => set('is_active', e.target.checked)} />
            <span>Active <em>— off disables it everywhere</em></span>
          </label>
          <label className="ms-f ms-check">
            <input type="checkbox" checked={f.is_public}
              onChange={e => set('is_public', e.target.checked)} />
            <span>Listed publicly <em>— off hides it from the pricing page</em></span>
          </label>
        </div>

        <div className="ms-modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? <span className="st-spin" /> : <Icon n="ti-check" />}
            {isNew ? 'Create microservice' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  )
}
