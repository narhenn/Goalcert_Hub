// Profile.jsx — the signed-in user's own account, opened from the account menu.
// Read-only identity (role and org are assigned by an admin, never self-served)
// plus the one thing you *can* change yourself: your password. Hits the same
// /api/auth/change-password as the forced first-login flow, so the current
// password is still required — this is a change, not an admin reset.
import React, { useState } from 'react'
import { Icon } from '../lib.jsx'
import { useAuth } from './auth.jsx'

const ROLE_LABEL = {
  super_admin: 'Platform Owner', admin: 'Admin / IT', coo: 'Plant Manager / COO',
  compliance: 'Compliance Officer', lnd: 'L&D / Trainer', supervisor: 'Line Supervisor', frontline: 'Frontline Operator',
}

export default function Profile({ onClose }) {
  const { user, changePassword } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [done, setDone] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setErr(null); setDone(false)
    if (next.length < 8) return setErr('New password must be at least 8 characters')
    if (next !== confirm) return setErr('Passwords do not match')
    if (next === current) return setErr('New password must differ from the current one')
    setBusy(true)
    try {
      await changePassword(current, next)
      setDone(true); setCurrent(''); setNext(''); setConfirm('')
    } catch (e2) { setErr(e2.detail || e2.message || 'Could not change password') }
    finally { setBusy(false) }
  }

  if (!user) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-head">
          <div className="modal-title"><Icon n="ti-user-circle" /> Your profile</div>
          <button className="copilot-x" onClick={onClose}><Icon n="ti-x" /></button>
        </div>

        <div className="modal-body">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="av" style={{ width: 44, height: 44, fontSize: 18 }}>
              {(user.fullName || user.email)[0].toUpperCase()}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{user.fullName || '—'}</div>
              <div className="hint" style={{ fontSize: 11.5, wordBreak: 'break-all' }}>{user.email}</div>
              <div style={{ marginTop: 5, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <span className="pill pill-purple" style={{ fontSize: 9 }}>{ROLE_LABEL[user.role] || user.role}</span>
                {user.orgName && <span className="pill pill-surface" style={{ fontSize: 9 }}>{user.orgName}</span>}
              </div>
            </div>
          </div>
          <span className="hint" style={{ fontSize: 10.5, display: 'block', marginTop: 8 }}>
            Your role and organisation are set by an administrator.
          </span>

          <div className="modal-divider">Change password</div>

          <form onSubmit={submit}>
            <label className="login-field"><span>Current password</span>
              <input className="hub-input" type="password" autoComplete="current-password"
                value={current} onChange={e => setCurrent(e.target.value)} required /></label>
            <label className="login-field"><span>New password</span>
              <input className="hub-input" type="password" autoComplete="new-password" placeholder="at least 8 characters"
                value={next} onChange={e => setNext(e.target.value)} required /></label>
            <label className="login-field"><span>Confirm new password</span>
              <input className="hub-input" type="password" autoComplete="new-password"
                value={confirm} onChange={e => setConfirm(e.target.value)} required /></label>

            {err && <div className="login-error"><Icon n="ti-alert-circle" /> {err}</div>}
            {done && <div className="login-error" style={{ color: 'var(--accent-green)' }}>
              <Icon n="ti-check" /> Password updated.
            </div>}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <button type="button" className="btn" onClick={onClose}>Close</button>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? 'Saving…' : 'Update password'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
