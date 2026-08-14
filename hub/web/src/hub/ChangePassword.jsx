// ChangePassword.jsx — forced on first login (admin-issued temp password) or when
// an admin resets a password. Blocks the app until the user sets their own.
import React, { useState } from 'react'
import { Logo, Icon } from '../lib.jsx'
import { useAuth } from './auth.jsx'

export default function ChangePassword() {
  const { user, changePassword, logout } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setErr(null)
    if (next.length < 8) return setErr('New password must be at least 8 characters')
    if (next !== confirm) return setErr('Passwords do not match')
    setBusy(true)
    try { await changePassword(current, next) }
    catch (e2) { setErr(e2.detail || e2.message || 'Could not change password') }
    finally { setBusy(false) }
  }

  return (
    <div className="login">
      <div className="onb-bg" />
      <div className="login-card">
        <div className="login-brand">
          <Logo size={40} />
        </div>
        <div className="login-head">
          <div className="login-title">Set your password</div>
          <div className="login-sub">Welcome, {user?.fullName || user?.email}. Choose a new password to continue.</div>
        </div>

        <form onSubmit={submit} className="login-form">
          <label className="login-field"><span>Current (temporary) password</span>
            <div className="login-input-wrap"><Icon n="ti-lock" />
              <input type="password" value={current} onChange={e => setCurrent(e.target.value)} autoFocus /></div>
          </label>
          <label className="login-field"><span>New password</span>
            <div className="login-input-wrap"><Icon n="ti-lock-check" />
              <input type="password" value={next} onChange={e => setNext(e.target.value)} placeholder="at least 8 characters" /></div>
          </label>
          <label className="login-field"><span>Confirm new password</span>
            <div className="login-input-wrap"><Icon n="ti-lock-check" />
              <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} /></div>
          </label>

          {err && <div className="login-error"><Icon n="ti-alert-circle" /> {err}</div>}

          <button type="submit" className="btn btn-primary login-cta" disabled={busy}>
            {busy ? 'Saving…' : <>Set password & continue <Icon n="ti-arrow-right" /></>}
          </button>
        </form>
        <div className="login-foot">
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={logout}><Icon n="ti-logout" /> Sign out</button>
        </div>
      </div>
    </div>
  )
}
