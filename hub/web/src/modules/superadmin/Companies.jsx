// Companies.jsx — tenant administration for the platform owner.
//
// Everything about one customer in one place: create them, edit them, see who
// works there, grant a microservice on a plan, extend the tenure, cancel, and
// (with a typed confirmation) delete the tenant outright.
import React, { useCallback, useEffect, useState } from 'react'
import { Icon } from '../../lib.jsx'
import API from '../../api.js'

const money = (a, c = 'INR') =>
  `${c === 'USD' ? '$' : c === 'AUD' ? 'A$' : c === 'EUR' ? '€' : '₹'}${Number(a || 0).toLocaleString('en-IN')}`

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined,
  { year: 'numeric', month: 'short', day: 'numeric' }) : '—')

/** Days until expiry — negative once lapsed. Drives the renewal warning. */
const daysLeft = (d) => (d ? Math.ceil((new Date(d) - new Date()) / 86400000) : null)

export default function Companies() {
  const [orgs, setOrgs] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  // ?org=<id> opens that tenant straight away, so a specific company is a
  // shareable link rather than "go to Companies and find it".
  const [open, setOpen] = useState(() =>
    new URLSearchParams(window.location.search).get('org'))
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    const url = new URL(window.location.href)
    if (open) url.searchParams.set('org', open)
    else url.searchParams.delete('org')
    window.history.replaceState({}, '', url)
  }, [open])

  const load = useCallback(async () => {
    setLoading(true)
    try { setOrgs((await API.admin.orgs()).orgs); setErr(null) }
    catch (e) { setErr(e.detail || e.message) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">Companies</div>
          <div className="panel-subtitle">
            {orgs.length} tenant{orgs.length === 1 ? '' : 's'} · create, configure, subscribe and renew.
          </div>
        </div>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          <Icon n="ti-plus" /> New company
        </button>
      </div>

      {err && <div className="dw-error">{err}</div>}
      {loading && <span className="st-spin" />}

      <div className="co-grid">
        {orgs.map(o => (
          <div className="co-card" key={o.id}>
            <div className="co-head">
              <span className="co-av">{o.name[0].toUpperCase()}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="co-name">{o.name}</div>
                <div className="co-slug">{o.slug}</div>
              </div>
              <span className={`pill pill-${o.status === 'active' ? 'green' : 'red'}`}>{o.status}</span>
            </div>
            <div className="co-meta">
              <span><b>{o.userCount}</b> users</span>
              <span><b>{(o.entitlements || []).length}</b> services</span>
              <span>{fmtDate(o.createdAt)}</span>
            </div>
            <button className="btn btn-ghost co-manage" onClick={() => setOpen(o.id)}>
              <Icon n="ti-settings" /> Manage
            </button>
          </div>
        ))}
      </div>

      {creating && <CreateCompany onClose={() => setCreating(false)}
        onSaved={() => { setCreating(false); load() }} />}
      {open && <CompanyDetail orgId={open} onClose={() => setOpen(null)} onChanged={load} />}
    </div>
  )
}

// ── create ────────────────────────────────────────────────────────────

function CreateCompany({ onClose, onSaved }) {
  const [f, setF] = useState({ name: '', slug: '', admin_email: '', admin_name: '', admin_password: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  const submit = async (e) => {
    e.preventDefault()
    if (!f.name.trim()) { setErr('Company name is required'); return }
    if (f.admin_email && (f.admin_password || '').length < 8) {
      setErr('The admin password must be at least 8 characters'); return
    }
    setBusy(true); setErr(null)
    try {
      await API.admin.createOrg({
        name: f.name.trim(), slug: f.slug.trim() || undefined,
        admin_email: f.admin_email || undefined,
        admin_name: f.admin_name || undefined,
        admin_password: f.admin_password || undefined,
      })
      onSaved()
    } catch (e2) { setErr(e2.detail || e2.message) }
    finally { setBusy(false) }
  }

  return (
    <div className="ms-modal-wrap" onClick={onClose}>
      <form className="ms-modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()} onSubmit={submit}>
        <div className="ms-modal-head">
          <div className="panel-title" style={{ flex: 1 }}>New company</div>
          <button type="button" className="btn btn-ghost" onClick={onClose}><Icon n="ti-x" /></button>
        </div>
        {err && <div className="dw-error">{err}</div>}
        <div className="ms-form">
          <label className="ms-f full"><span>Company name *</span>
            <input value={f.name} onChange={e => set('name', e.target.value)} autoFocus
              placeholder="Acme Industries" /></label>
          <label className="ms-f full"><span>Slug <em>(auto from the name if blank)</em></span>
            <input value={f.slug} onChange={e => set('slug', e.target.value)} placeholder="acme-industries" /></label>

          <div className="ms-f full co-sep">Seat the first administrator (optional)</div>
          <label className="ms-f"><span>Admin email</span>
            <input type="email" value={f.admin_email} onChange={e => set('admin_email', e.target.value)}
              placeholder="admin@acme.com" /></label>
          <label className="ms-f"><span>Admin name</span>
            <input value={f.admin_name} onChange={e => set('admin_name', e.target.value)} /></label>
          <label className="ms-f full"><span>Temporary password <em>(min 8 — they must change it on first login)</em></span>
            <input value={f.admin_password} onChange={e => set('admin_password', e.target.value)} /></label>
        </div>
        <div className="ms-modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? <span className="st-spin" /> : <Icon n="ti-check" />} Create company
          </button>
        </div>
      </form>
    </div>
  )
}

// ── manage one tenant ─────────────────────────────────────────────────

function CompanyDetail({ orgId, onClose, onChanged }) {
  const [d, setD] = useState(null)
  const [modules, setModules] = useState([])
  const [plans, setPlans] = useState([])
  const [tab, setTab] = useState('subs')
  const [err, setErr] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const [detail, mods, pl] = await Promise.all([
        API.platform.company(orgId), API.platform.modules(), API.platform.plans(),
      ])
      setD(detail); setModules(mods.modules); setPlans(pl.plans); setErr(null)
    } catch (e) { setErr(e.detail || e.message) }
  }, [orgId])
  useEffect(() => { load() }, [load])

  const act = async (fn) => {
    setBusy(true); setErr(null)
    try { await fn(); await load(); onChanged?.() }
    catch (e) { setErr(e.detail || e.message) }
    finally { setBusy(false) }
  }

  if (!d) {
    return (
      <div className="ms-modal-wrap" onClick={onClose}>
        <div className="ms-modal" onClick={e => e.stopPropagation()} style={{ padding: 40 }}>
          {err ? <div className="dw-error">{err}</div> : <span className="st-spin" />}
        </div>
      </div>
    )
  }

  const org = d.org

  return (
    <div className="ms-modal-wrap" onClick={onClose}>
      <div className="ms-modal co-modal" onClick={e => e.stopPropagation()}>
        <div className="ms-modal-head">
          <span className="co-av">{org.name[0].toUpperCase()}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="panel-title">{org.name}</div>
            <div className="panel-subtitle">
              {org.slug} · {d.users.length} users · {money(d.totalSpend)} lifetime
            </div>
          </div>
          <button className="btn btn-ghost" onClick={onClose}><Icon n="ti-x" /></button>
        </div>

        {err && <div className="dw-error">{err}</div>}

        <div className="seg co-tabs">
          {[['subs', 'Subscriptions'], ['users', 'Users'], ['billing', 'Billing'], ['danger', 'Settings']]
            .map(([k, label]) => (
              <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{label}</button>
            ))}
        </div>

        <div className="co-body">
          {tab === 'subs' && (
            <Subscriptions d={d} modules={modules} plans={plans} busy={busy} act={act} />
          )}

          {tab === 'users' && (
            <table className="tx-table">
              <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th></tr></thead>
              <tbody>
                {d.users.map(u => (
                  <tr key={u.id}>
                    <td>{u.fullName || '—'}</td><td>{u.email}</td><td>{u.role}</td>
                    <td><span className={`pill pill-${u.status === 'active' ? 'green' : 'red'}`}>{u.status}</span></td>
                  </tr>
                ))}
                {!d.users.length && <tr><td colSpan={4}>No users yet.</td></tr>}
              </tbody>
            </table>
          )}

          {tab === 'billing' && (
            <table className="tx-table">
              <thead><tr><th>Date</th><th>Service</th><th>Gateway</th><th className="r">Amount</th><th>Status</th></tr></thead>
              <tbody>
                {d.transactions.map(t => (
                  <tr key={t.id}>
                    <td>{fmtDate(t.createdAt)}</td><td>{t.moduleCode || '—'}</td><td>{t.gateway}</td>
                    <td className="r mono">{money(t.amount, t.currency)}</td>
                    <td><span className={`pill pill-${t.status === 'paid' ? 'green' : 'amber'}`}>{t.status}</span></td>
                  </tr>
                ))}
                {!d.transactions.length && <tr><td colSpan={5}>No transactions recorded.</td></tr>}
              </tbody>
            </table>
          )}

          {tab === 'danger' && <Settings org={org} busy={busy} act={act} onClose={onClose} />}
        </div>
      </div>
    </div>
  )
}

// ── subscriptions: assign, extend, cancel ─────────────────────────────

function Subscriptions({ d, modules, plans, busy, act }) {
  const [addMod, setAddMod] = useState('')
  const [addPlan, setAddPlan] = useState('')
  const [addSeats, setAddSeats] = useState(1)
  const [addMonths, setAddMonths] = useState(12)

  const held = new Set(d.subscriptions.map(s => s.moduleCode))
  const available = modules.filter(m => !held.has(m.code))
  const plansFor = (code) => {
    const mod = modules.find(m => m.code === code)
    return mod ? plans.filter(p => p.moduleId === mod.id) : []
  }

  return (
    <>
      <div className="co-sub-list">
        {d.subscriptions.map(s => {
          const left = daysLeft(s.expiresAt)
          const expiring = left != null && left <= 30
          return (
            <div className={`co-sub ${s.isLive ? '' : 'dead'}`} key={s.id}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="co-sub-top">
                  <b>{s.moduleCode}</b>
                  <span className={`pill pill-${s.isLive ? 'green' : 'red'}`}>{s.status}</span>
                  {expiring && s.isLive && (
                    <span className="pill pill-amber">
                      {left <= 0 ? 'expired' : `${left}d left`}
                    </span>
                  )}
                </div>
                <div className="co-sub-sub">
                  {s.planName || 'no plan'} · {s.seats} seat{s.seats === 1 ? '' : 's'} ·
                  expires {fmtDate(s.expiresAt)}
                </div>
              </div>
              <div className="co-sub-actions">
                {/* Tenure extension — the common renewal path, one click. */}
                {[1, 6, 12].map(m => (
                  <button key={m} className="btn btn-ghost" disabled={busy}
                    title={`Extend by ${m} month${m === 1 ? '' : 's'}`}
                    onClick={() => act(() => API.platform.editSubscription(s.id, { extend_months: m }))}>
                    +{m}m
                  </button>
                ))}
                <SeatEditor sub={s} busy={busy} act={act} />
                <button className="btn btn-ghost danger" disabled={busy}
                  title="Cancel — revokes access, keeps billing history"
                  onClick={() => act(() => API.platform.cancelSubscription(s.id))}>
                  <Icon n="ti-ban" />
                </button>
              </div>
            </div>
          )
        })}
        {!d.subscriptions.length && <div className="ms-hint">No subscriptions yet.</div>}
      </div>

      <div className="co-sep">Add a subscription</div>
      <div className="co-add">
        <select value={addMod} onChange={e => { setAddMod(e.target.value); setAddPlan('') }}>
          <option value="">Microservice…</option>
          {available.map(m => <option key={m.id} value={m.code}>{m.name}</option>)}
        </select>
        <select value={addPlan} onChange={e => setAddPlan(e.target.value)} disabled={!addMod}>
          <option value="">Plan (optional)</option>
          {plansFor(addMod).map(p => (
            <option key={p.id} value={p.id}>
              {p.name}{p.price ? ` — ${money(p.price.amount, p.price.currency)}` : ''}
            </option>
          ))}
        </select>
        <input type="number" min="1" value={addSeats} title="Seats"
          onChange={e => setAddSeats(+e.target.value)} style={{ width: 74 }} />
        <input type="number" min="1" value={addMonths} title="Months"
          onChange={e => setAddMonths(+e.target.value)} style={{ width: 74 }} />
        <button className="btn btn-primary" disabled={!addMod || busy}
          onClick={() => act(async () => {
            await API.platform.grantSubscription({
              org_id: d.org.id, module_code: addMod, plan_id: addPlan || null,
              seats: addSeats, months: addMonths,
            })
            setAddMod(''); setAddPlan('')
          })}>
          <Icon n="ti-plus" /> Grant
        </button>
      </div>
    </>
  )
}

function SeatEditor({ sub, busy, act }) {
  const [editing, setEditing] = useState(false)
  const [seats, setSeats] = useState(sub.seats)
  if (!editing) {
    return (
      <button className="btn btn-ghost" title="Change seats" disabled={busy}
        onClick={() => setEditing(true)}><Icon n="ti-users" /></button>
    )
  }
  return (
    <span className="co-seat-edit">
      <input type="number" min="1" value={seats} onChange={e => setSeats(+e.target.value)} />
      <button className="btn btn-primary" disabled={busy}
        onClick={() => act(async () => {
          await API.platform.editSubscription(sub.id, { seats })
          setEditing(false)
        })}><Icon n="ti-check" /></button>
    </span>
  )
}

// ── settings / danger zone ────────────────────────────────────────────

function Settings({ org, busy, act, onClose }) {
  const [name, setName] = useState(org.name)
  const [confirm, setConfirm] = useState('')

  return (
    <>
      <label className="ms-f full"><span>Company name</span>
        <input value={name} onChange={e => setName(e.target.value)} /></label>
      <div className="co-row">
        <button className="btn btn-primary" disabled={busy || name === org.name}
          onClick={() => act(() => API.admin.updateOrg(org.id, { name }))}>Save name</button>
        <button className="btn btn-ghost" disabled={busy}
          onClick={() => act(() => API.admin.updateOrg(org.id,
            { status: org.status === 'active' ? 'disabled' : 'active' }))}>
          <Icon n={org.status === 'active' ? 'ti-ban' : 'ti-check'} />
          {org.status === 'active' ? 'Suspend company' : 'Reactivate company'}
        </button>
      </div>

      <div className="co-danger">
        <div className="co-danger-t"><Icon n="ti-alert-triangle" /> Delete this company</div>
        <p>
          Removes the organisation, its {org.userCount} user account(s), its roles and every
          subscription. Billing history is lost with it. This cannot be undone.
        </p>
        <div className="co-row">
          <input value={confirm} onChange={e => setConfirm(e.target.value)}
            placeholder={`Type "${org.slug}" to confirm`} />
          <button className="btn btn-primary co-del" disabled={busy || confirm !== org.slug}
            onClick={() => act(async () => {
              await API.platform.deleteCompany(org.id, org.slug)
              onClose()
            })}>
            Delete permanently
          </button>
        </div>
      </div>
    </>
  )
}
