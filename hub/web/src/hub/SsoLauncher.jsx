// SsoLauncher.jsx — the "Open LMS" topbar control.
//
// Signing in to the Hub is the only sign-in. This button exchanges the live Hub
// session for a one-shot ticket and drops the user straight into the satellite
// app's dashboard, already authenticated against the account that app already
// has for them. No second password, no duplicated user record.
//
// Which apps appear is decided server-side by GET /api/sso/apps — the roles that
// may open each one are configured on the hub, not here. A user whose role opens
// nothing sees no button at all.
import React, { useEffect, useState } from 'react'
import { Icon } from '../lib.jsx'
import API, { openSsoApp } from '../api.js'

const ICON_FOR = { lms: 'ti-school', vr: 'ti-augmented-reality' }

export default function SsoLauncher() {
  const [apps, setApps] = useState([])
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    API.sso.apps()
      .then(r => { if (alive) setApps(r.apps || []) })
      // A hub without SSO configured simply has no launcher — not an error
      // worth putting in the user's face.
      .catch(() => { if (alive) setApps([]) })
    return () => { alive = false }
  }, [])

  // Clear a stale error a few seconds after it appears.
  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(''), 6000)
    return () => clearTimeout(t)
  }, [error])

  if (!apps.length) return null

  // openSsoApp must be called straight from the click handler — it opens the
  // tab synchronously, before awaiting the ticket, or the pop-up blocker eats it.
  async function open(key) {
    setError('')
    setBusy(key)
    try {
      await openSsoApp(key)
    } catch (e) {
      setError(e?.detail || e?.message || 'Could not open the application.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      {apps.map(app => (
        <button
          key={app.key}
          className="btn btn-ghost"
          style={{ padding: '5px 10px', fontSize: 12, whiteSpace: 'nowrap' }}
          title={`Open ${app.label} — you are already signed in`}
          disabled={busy === app.key}
          onClick={() => open(app.key)}
        >
          <Icon n={busy === app.key ? 'ti-loader-2' : (ICON_FOR[app.key] || 'ti-external-link')} />
          {' '}Open {app.label.replace(/^GoalCert /, '')}
        </button>
      ))}
      {error && (
        <span className="pill pill-surface" style={{ fontSize: 10, color: 'var(--danger, #e5484d)' }}>
          {error}
        </span>
      )}
    </>
  )
}
