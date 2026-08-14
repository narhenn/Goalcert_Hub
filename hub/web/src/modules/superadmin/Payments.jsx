// Payments.jsx — gateway configuration + the transaction ledger.
//
// Credentials are write-only from the browser's point of view: the API returns
// which keys are set, never their values, and submitting a blank field leaves
// the stored secret untouched. So this screen can be opened in a meeting.
import React, { useCallback, useEffect, useState } from 'react'
import { Icon } from '../../lib.jsx'
import API from '../../api.js'

// The credential each gateway needs. Labels only — no value ever comes back.
const FIELDS = {
  stripe: [['publishable_key', 'Publishable key'], ['secret_key', 'Secret key'],
           ['webhook_secret', 'Webhook signing secret']],
  razorpay: [['key_id', 'Key ID'], ['key_secret', 'Key secret'],
             ['webhook_secret', 'Webhook secret']],
  paypal: [['client_id', 'Client ID'], ['client_secret', 'Client secret']],
}

const money = (a, c) => `${c === 'USD' ? '$' : c === 'EUR' ? '€' : '₹'}${Number(a || 0).toLocaleString('en-IN')}`

export default function Payments() {
  const [tab, setTab] = useState('gateways')
  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">Payments</div>
          <div className="panel-subtitle">Gateway credentials and every transaction on the platform.</div>
        </div>
        <div className="seg">
          <button className={tab === 'gateways' ? 'on' : ''} onClick={() => setTab('gateways')}>Gateways</button>
          <button className={tab === 'tx' ? 'on' : ''} onClick={() => setTab('tx')}>Transactions</button>
        </div>
      </div>
      {tab === 'gateways' ? <Gateways /> : <Transactions />}
    </div>
  )
}

function Gateways() {
  const [rows, setRows] = useState([])
  const [err, setErr] = useState(null)
  const [draft, setDraft] = useState({})

  const load = useCallback(async () => {
    try { setRows((await API.platform.gateways()).gateways) }
    catch (e) { setErr(e.detail || e.message) }
  }, [])
  useEffect(() => { load() }, [load])

  const save = async (g) => {
    const config = draft[g.code] || {}
    try {
      await API.platform.updateGateway(g.code, { config })
      setDraft(d => ({ ...d, [g.code]: {} }))
      load()
    } catch (e) { setErr(e.detail || e.message) }
  }

  const toggle = async (g, field, value) => {
    try { await API.platform.updateGateway(g.code, { [field]: value }); load() }
    catch (e) { setErr(e.detail || e.message) }
  }

  return (
    <>
      {err && <div className="dw-error">{err}</div>}
      <div className="gw-grid">
        {rows.map(g => (
          <div className="gw-card" key={g.code}>
            <div className="gw-head">
              <div>
                <div className="gw-name">{g.name}</div>
                <div className="gw-cur">{(g.currencies || []).join(' · ') || '—'}</div>
              </div>
              <label className="gw-switch">
                <input type="checkbox" checked={g.isEnabled}
                  onChange={e => toggle(g, 'is_enabled', e.target.checked)} />
                <span>{g.isEnabled ? 'Enabled' : 'Disabled'}</span>
              </label>
            </div>

            <label className="gw-mode">
              <input type="checkbox" checked={g.isTestMode}
                onChange={e => toggle(g, 'is_test_mode', e.target.checked)} />
              <span>Test mode</span>
            </label>

            {FIELDS[g.code]?.map(([key, label]) => {
              const isSet = g.configuredKeys.includes(key)
              return (
                <label className="gw-f" key={key}>
                  <span>
                    {label}
                    {isSet && <em className="gw-set"><Icon n="ti-lock" /> stored</em>}
                  </span>
                  <input type="password" autoComplete="new-password"
                    placeholder={isSet ? '•••••••• (leave blank to keep)' : 'Not set'}
                    value={draft[g.code]?.[key] || ''}
                    onChange={e => setDraft(d => ({
                      ...d, [g.code]: { ...(d[g.code] || {}), [key]: e.target.value },
                    }))} />
                </label>
              )
            })}

            <button className="btn btn-primary" onClick={() => save(g)}>Save credentials</button>

            <div className="gw-note">
              <Icon n="ti-info-circle" />
              Credentials are stored server-side and never returned to the browser.
              Charge processing and webhooks are not wired yet — see the handover note.
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function Transactions() {
  const [d, setD] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    API.platform.transactions(100, 0).then(setD).catch(e => setErr(e.detail || e.message))
  }, [])

  if (err) return <div className="dw-error">{err}</div>
  if (!d) return <span className="st-spin" />
  if (!d.transactions.length) {
    return (
      <div className="dw-empty" style={{ padding: 40 }}>
        <Icon n="ti-receipt-off" />
        <span>No transactions recorded yet.</span>
      </div>
    )
  }

  return (
    <table className="tx-table">
      <thead>
        <tr><th>Date</th><th>Company</th><th>Service</th><th>Gateway</th>
          <th className="r">Amount</th><th>Status</th></tr>
      </thead>
      <tbody>
        {d.transactions.map(t => (
          <tr key={t.id}>
            <td>{t.createdAt ? new Date(t.createdAt).toLocaleDateString() : '—'}</td>
            <td>{t.orgName || '—'}</td>
            <td>{t.moduleCode || '—'}</td>
            <td>{t.gateway}</td>
            <td className="r mono">{money(t.amount, t.currency)}</td>
            <td><span className={`pill pill-${t.status === 'paid' ? 'green'
              : t.status === 'pending' ? 'amber' : 'red'}`}>{t.status}</span></td>
          </tr>
        ))}
      </tbody>
      <tfoot><tr><td colSpan={6}>{d.total} transaction(s)</td></tr></tfoot>
    </table>
  )
}
