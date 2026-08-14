// Settings.jsx — SMTP and Storage configuration.
//
// Both screens follow the same contract: the API returns which credentials are
// SET, never their values, and leaving a secret field blank keeps the stored
// one. So this page can be opened in a meeting without leaking a live key.
import React, { useCallback, useEffect, useState } from 'react'
import { Icon } from '../../lib.jsx'
import API from '../../api.js'

// ══ SMTP ══════════════════════════════════════════════════════════════

export function SmtpSettings() {
  const [d, setD] = useState(null)
  const [f, setF] = useState({})
  const [pw, setPw] = useState('')
  const [testTo, setTestTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [ok, setOk] = useState(null)

  const load = useCallback(async () => {
    try {
      const res = await API.platform.smtpSettings()
      setD(res); setF(res.values || {}); setErr(null)
    } catch (e) { setErr(e.detail || e.message) }
  }, [])
  useEffect(() => { load() }, [load])

  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  const save = async () => {
    setBusy(true); setErr(null); setOk(null)
    try {
      await API.platform.updateSmtp({
        host: f.host || '', port: Number(f.port) || 587,
        use_tls: f.use_tls !== false, from_email: f.from_email || '',
        from_name: f.from_name || '', sales_email: f.sales_email || '',
        username: f.username || '', password: pw || undefined, is_enabled: true,
      })
      setPw(''); setOk('Settings saved.'); load()
    } catch (e) { setErr(e.detail || e.message) }
    finally { setBusy(false) }
  }

  const test = async () => {
    if (!testTo) { setErr('Enter an address to send the test to'); return }
    setBusy(true); setErr(null); setOk(null)
    try {
      await API.platform.testSmtp(testTo)
      setOk(`Test message sent to ${testTo}.`)
    } catch (e) {
      // The SMTP error is the entire diagnostic — show it verbatim.
      setErr(e.detail || e.message)
    } finally { setBusy(false) }
  }

  if (!d) return <div className="panel">{err ? <div className="dw-error">{err}</div> : <span className="st-spin" />}</div>

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">SMTP</div>
          <div className="panel-subtitle">
            Outbound mail for quote alerts and password delivery.
            {d.envFallback && ' An SMTP_HOST is also set in the environment as a fallback.'}
          </div>
        </div>
        <span className={`pill pill-${d.isEnabled ? 'green' : 'surface'}`}>
          {d.isEnabled ? 'configured' : 'not configured'}
        </span>
      </div>

      {err && <div className="dw-error">{err}</div>}
      {ok && <div className="st-ok">{ok}</div>}

      <div className="ms-form" style={{ padding: 0, maxWidth: 720 }}>
        <label className="ms-f"><span>Host</span>
          <input value={f.host || ''} onChange={e => set('host', e.target.value)}
            placeholder="smtp.sendgrid.net" /></label>
        <label className="ms-f"><span>Port</span>
          <input type="number" value={f.port || 587} onChange={e => set('port', e.target.value)} /></label>
        <label className="ms-f"><span>From address</span>
          <input value={f.from_email || ''} onChange={e => set('from_email', e.target.value)}
            placeholder="no-reply@nextxrgroup.com" /></label>
        <label className="ms-f"><span>From name</span>
          <input value={f.from_name || ''} onChange={e => set('from_name', e.target.value)}
            placeholder="NextXR Group" /></label>
        <label className="ms-f"><span>Sales inbox <em>(where quote requests go)</em></span>
          <input value={f.sales_email || ''} onChange={e => set('sales_email', e.target.value)}
            placeholder="sales@nextxrgroup.com" /></label>
        <label className="ms-f"><span>Username</span>
          <input value={f.username || ''} onChange={e => set('username', e.target.value)} /></label>
        <label className="ms-f"><span>Password
          {d.configuredSecrets?.includes('password') &&
            <em className="gw-set"><Icon n="ti-lock" /> stored</em>}</span>
          <input type="password" autoComplete="new-password" value={pw}
            onChange={e => setPw(e.target.value)}
            placeholder={d.configuredSecrets?.includes('password')
              ? '•••••••• (leave blank to keep)' : 'Not set'} /></label>
        <label className="ms-f ms-check">
          <input type="checkbox" checked={f.use_tls !== false}
            onChange={e => set('use_tls', e.target.checked)} />
          <span>Use STARTTLS</span>
        </label>
      </div>

      <div className="co-row" style={{ marginTop: 14 }}>
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? <span className="st-spin" /> : <Icon n="ti-check" />} Save
        </button>
      </div>

      <div className="co-sep">Send a test message</div>
      <div className="co-row">
        <input value={testTo} onChange={e => setTestTo(e.target.value)}
          placeholder="you@example.com" />
        <button className="btn btn-ghost" onClick={test} disabled={busy}>
          <Icon n="ti-send" /> Send test
        </button>
      </div>
    </div>
  )
}

// ══ Storage ═══════════════════════════════════════════════════════════

export function StorageSettings() {
  const [d, setD] = useState(null)
  const [f, setF] = useState({})
  const [sec, setSec] = useState({ access_key_id: '', secret_access_key: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [ok, setOk] = useState(null)

  const load = useCallback(async () => {
    try {
      const res = await API.platform.storageSettings()
      setD(res); setF(res.values || {}); setErr(null)
    } catch (e) { setErr(e.detail || e.message) }
  }, [])
  useEffect(() => { load() }, [load])

  const set = (k, v) => setF(p => ({ ...p, [k]: v }))

  const save = async () => {
    setBusy(true); setErr(null); setOk(null)
    try {
      await API.platform.updateStorage({
        driver: f.driver || 'local', bucket: f.bucket || '', region: f.region || '',
        endpoint: f.endpoint || '', base_url: f.base_url || '',
        access_key_id: sec.access_key_id || undefined,
        secret_access_key: sec.secret_access_key || undefined,
      })
      setSec({ access_key_id: '', secret_access_key: '' })
      setOk('Storage settings saved.'); load()
    } catch (e) { setErr(e.detail || e.message) }
    finally { setBusy(false) }
  }

  if (!d) return <div className="panel">{err ? <div className="dw-error">{err}</div> : <span className="st-spin" />}</div>

  const isS3 = (f.driver || 'local') === 's3'

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">Storage</div>
          <div className="panel-subtitle">
            Where uploaded thumbnails and preview videos are kept.
            Active driver: <b>{d.activeDriver}</b>.
          </div>
        </div>
      </div>

      {err && <div className="dw-error">{err}</div>}
      {ok && <div className="st-ok">{ok}</div>}

      <div className="gw-grid">
        {d.drivers.map(drv => (
          <label className={`gw-card ${(f.driver || 'local') === drv.code ? 'on' : ''}`} key={drv.code}>
            <div className="gw-head">
              <div>
                <div className="gw-name">{drv.name}</div>
                <div className="gw-cur">{drv.code}</div>
              </div>
              <input type="radio" name="driver" checked={(f.driver || 'local') === drv.code}
                onChange={() => set('driver', drv.code)} />
            </div>
            {!drv.ready && (
              <div className="gw-note">
                <Icon n="ti-alert-triangle" />
                boto3 is not installed, so this driver cannot be used yet.
              </div>
            )}
          </label>
        ))}
      </div>

      {isS3 && (
        <>
          <div className="co-sep">S3 configuration</div>
          <div className="ms-form" style={{ padding: 0, maxWidth: 720 }}>
            <label className="ms-f"><span>Bucket *</span>
              <input value={f.bucket || ''} onChange={e => set('bucket', e.target.value)} /></label>
            <label className="ms-f"><span>Region</span>
              <input value={f.region || ''} onChange={e => set('region', e.target.value)}
                placeholder="ap-south-1" /></label>
            <label className="ms-f"><span>Endpoint <em>(S3-compatible only)</em></span>
              <input value={f.endpoint || ''} onChange={e => set('endpoint', e.target.value)}
                placeholder="https://…" /></label>
            <label className="ms-f"><span>Public base URL <em>(CDN)</em></span>
              <input value={f.base_url || ''} onChange={e => set('base_url', e.target.value)} /></label>
            <label className="ms-f"><span>Access key ID
              {d.configuredSecrets?.includes('access_key_id') &&
                <em className="gw-set"><Icon n="ti-lock" /> stored</em>}</span>
              <input type="password" autoComplete="new-password" value={sec.access_key_id}
                onChange={e => setSec(s => ({ ...s, access_key_id: e.target.value }))}
                placeholder="leave blank to keep" /></label>
            <label className="ms-f"><span>Secret access key
              {d.configuredSecrets?.includes('secret_access_key') &&
                <em className="gw-set"><Icon n="ti-lock" /> stored</em>}</span>
              <input type="password" autoComplete="new-password" value={sec.secret_access_key}
                onChange={e => setSec(s => ({ ...s, secret_access_key: e.target.value }))}
                placeholder="leave blank to keep" /></label>
          </div>
        </>
      )}

      <div className="co-row" style={{ marginTop: 14 }}>
        <button className="btn btn-primary" onClick={save} disabled={busy}>
          {busy ? <span className="st-spin" /> : <Icon n="ti-check" />} Save
        </button>
      </div>

      <div className="gw-note" style={{ marginTop: 16 }}>
        <Icon n="ti-info-circle" />
        <span>
          Local files are written under <code>{d.mediaRoot}</code> and served at /media.
          Limits: {d.limits.imageMb} MB per image, {d.limits.videoMb} MB per video.
          Accepted: {d.allowedTypes.join(', ')}.
        </span>
      </div>
    </div>
  )
}
