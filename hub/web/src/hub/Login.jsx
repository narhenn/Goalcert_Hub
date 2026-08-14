// Login.jsx — the entry gate. Email + password → JWT. The role your admin
// assigned decides which persona dashboard you land on; there is no free choice.
import React, { useState } from 'react'
import { Logo, Icon } from '../lib.jsx'
import { useAuth } from './auth.jsx'

export default function Login() {
  const { login, error, setError } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [show, setShow] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!email || !password) return
    setBusy(true)
    try { await login(email.trim(), password) }
    catch { /* error surfaced via context */ }
    finally { setBusy(false) }
  }

  return (
    <div className="login">
      <div className="onb-bg" />
      <div className="login-card">
        <div className="login-brand">
          <Logo size={40} />
          <div className="brand-word">
            <span className="brand-name">Goalcert</span>
            <span className="brand-tag">Integration Hub</span>
          </div>
        </div>
        <div className="login-head">
          <div className="login-title">Sign in</div>
          <div className="login-sub">Use the credentials your organisation's admin gave you.</div>
        </div>

        <form onSubmit={submit} className="login-form">
          <label className="login-field">
            <span>Work email</span>
            <div className="login-input-wrap">
              <Icon n="ti-mail" />
              <input type="email" autoComplete="username" placeholder="you@company.com"
                value={email} onChange={e => { setEmail(e.target.value); setError(null) }} autoFocus />
            </div>
          </label>
          <label className="login-field">
            <span>Password</span>
            <div className="login-input-wrap">
              <Icon n="ti-lock" />
              <input type={show ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••••"
                value={password} onChange={e => { setPassword(e.target.value); setError(null) }} />
              <button type="button" className="login-eye" onClick={() => setShow(s => !s)} tabIndex={-1}>
                <Icon n={show ? 'ti-eye-off' : 'ti-eye'} />
              </button>
            </div>
          </label>

          {error && <div className="login-error"><Icon n="ti-alert-circle" /> {error}</div>}

          <button type="submit" className="btn btn-primary login-cta" disabled={busy || !email || !password}>
            {busy ? <><span className="st-spin" style={{ borderTopColor: '#fff' }} /> Signing in…</>
                  : <>Sign in <Icon n="ti-arrow-right" /></>}
          </button>
        </form>

        <div className="login-foot">
          <Icon n="ti-shield-lock" /> Access is provisioned by your admin. No public sign-up.
        </div>
      </div>
    </div>
  )
}
