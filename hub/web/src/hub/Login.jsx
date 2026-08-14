// Login.jsx — the entry gate. Email + password → JWT. The role your admin
// assigned decides which persona dashboard you land on; there is no free choice.
import React, { useState } from 'react'
import { Logo, Icon } from '../lib.jsx'
import { useAuth } from './auth.jsx'
import { navigate, useRoute } from '../router.jsx'
import { openSsoApp } from '../api.js'
import { alreadyLaunched, markLaunched, setPending } from './ssoAuto.js'

export default function Login() {
  const { login, error, setError } = useAuth()
  const { query } = useRoute()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [show, setShow] = useState(false)

  // "Sign Up" from the landing page arrives as /login?mode=signup. There is no
  // public registration endpoint — accounts are either provisioned by an admin
  // or created by choosing a plan — so signup mode explains both routes rather
  // than showing a register form that could not post anywhere.
  const signup = query.get('mode') === 'signup'

  const submit = async (e) => {
    e.preventDefault()
    if (!email || !password) return
    setBusy(true)
    try {
      const { user, ssoAutoLaunch } = await login(email.trim(), password)
      // Roles the hub marks for auto-launch land in their satellite app without
      // a second sign-in. This runs HERE, in the submit handler, rather than in
      // the shell after it mounts: browsers only honour window.open while the
      // sign-in click is still recent, and a mount is too late.
      if (ssoAutoLaunch && !alreadyLaunched(user?.id)) {
        markLaunched(user?.id)
        try {
          await openSsoApp(ssoAutoLaunch)
        } catch (err) {
          // Blocked pop-up or an unreachable satellite. Never fail the sign-in
          // over it — the hub session is valid either way; offer the tab instead.
          setPending(ssoAutoLaunch, err?.detail || err?.message || '')
        }
      }
    }
    catch { /* error surfaced via context */ }
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
          <div className="login-title">{signup ? 'Create your account' : 'Sign in'}</div>
          <div className="login-sub">
            {signup
              ? 'Choose a plan to open an account, or sign in below if your admin has already provisioned one.'
              : "Use the credentials your organisation's admin gave you."}
          </div>
        </div>

        {signup && (
          <button type="button" className="login-signup" onClick={() => navigate('/pricing')}>
            <span className="login-signup-ico"><Icon n="ti-sparkles" /></span>
            <span className="login-signup-txt">
              <b>Get started with a plan</b>
              Published pricing · activated within 2 hours
            </span>
            <Icon n="ti-arrow-right" />
          </button>
        )}

        <form onSubmit={submit} className="login-form">
          <label className="login-field">
            <span>Email or username</span>
            <div className="login-input-wrap">
              <Icon n="ti-user" />
              {/* type="text", not "email": the browser's own validator would
                  reject a bare username like "admin" before we ever POST. */}
              <input type="text" autoComplete="username" placeholder="you@company.com or admin"
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
        <button type="button" className="login-back" onClick={() => navigate('/')}>
          <Icon n="ti-arrow-left" /> Back to nextxrgroup.com
        </button>
      </div>
    </div>
  )
}
