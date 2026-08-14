// SsoAutoNotice.jsx — the fallback when the sign-in auto-launch did not happen.
//
// An automatic window.open is at the mercy of the pop-up blocker, and the
// satellite app can be down. Neither should look like the hub is broken, so the
// blocked launch becomes a one-line offer instead: this button IS a click, so
// it carries the user activation the automatic attempt lacked.
import React, { useEffect, useState } from 'react'
import { Icon } from '../lib.jsx'
import { openSsoApp } from '../api.js'
import { clearPending, getPending } from './ssoAuto.js'

export default function SsoAutoNotice() {
  const [pending, setPendingState] = useState(getPending)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState('')

  useEffect(() => {
    const sync = () => setPendingState(getPending())
    window.addEventListener('sso:pending', sync)
    return () => window.removeEventListener('sso:pending', sync)
  }, [])

  if (!pending) return null

  async function open() {
    setBusy(true)
    setFailed('')
    try {
      await openSsoApp(pending.app)
      clearPending()
    } catch (e) {
      setFailed(e?.detail || e?.message || 'Could not open the application.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="sso-notice" role="status">
      <Icon n="ti-external-link" />
      <span className="sso-notice-txt">
        {failed || 'Your browser blocked the automatic sign-in tab.'}
      </span>
      <button className="btn bp" onClick={open} disabled={busy}>
        {busy ? 'Opening…' : 'Open the LMS'}
      </button>
      <button className="sso-notice-x" onClick={clearPending} aria-label="Dismiss">
        <Icon n="ti-x" />
      </button>
    </div>
  )
}
