// Marketplace.jsx — every microservice the platform offers, from this tenant's
// point of view.
//
//   owned   → Explore (opens the service)
//   locked  → gold crown in the corner, Preview + Purchase
//
// "Owned" is decided by the server (commerce_routes.owned_modules), the same
// function that gates the sidebar — so a card can never claim access that the
// menu withholds.
import React, { useCallback, useEffect, useState } from 'react'
import { Icon } from '../../lib.jsx'
import API, { openSsoApp } from '../../api.js'
import { navigate } from '../../router.jsx'

const money = (amt, cur) => {
  if (amt == null) return null
  const sym = cur === 'USD' ? '$' : cur === 'EUR' ? '€' : '₹'
  return `${sym}${Number(amt).toLocaleString('en-IN')}`
}

export default function Marketplace({ onNav }) {
  const [mods, setMods] = useState([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState(null)
  const [preview, setPreview] = useState(null)

  // Which owned services this user can be dropped straight into, keyed by the
  // module they correspond to. The server decides — the card only asks. A hub
  // with SSO unconfigured, or a role that may open nothing, gets an empty map
  // and the cards fall back to Explore.
  const [ssoByModule, setSsoByModule] = useState({})

  const load = useCallback(async () => {
    setLoading(true)
    try { setMods((await API.store.catalog()).modules); setErr(null) }
    catch (e) { setErr(e.detail || e.message) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  useEffect(() => {
    let alive = true
    API.sso.apps()
      .then(r => {
        if (!alive) return
        const map = {}
        for (const a of r.apps || []) if (a.moduleCode) map[a.moduleCode] = a
        setSsoByModule(map)
      })
      .catch(() => { if (alive) setSsoByModule({}) })
    return () => { alive = false }
  }, [])

  // Purchase always hands off to the public pricing funnel, pre-selected —
  // one checkout path, whether the visitor starts inside the app or outside it.
  const purchase = (m) => navigate(`/pricing?product=${encodeURIComponent(m.code)}`)

  const owned = mods.filter(m => m.owned)
  const locked = mods.filter(m => !m.owned)

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">Microservices</div>
          <div className="panel-subtitle">
            {owned.length} of {mods.length} active on your plan.
            Locked services can be previewed before you buy.
          </div>
        </div>
        <button className="btn btn-ghost" onClick={load}><Icon n="ti-refresh" /> Refresh</button>
      </div>

      {err && <div className="dw-error">{err}</div>}
      {loading && <span className="st-spin" />}

      {!!owned.length && <div className="mk-section">Your services</div>}
      <div className="mk-grid">
        {owned.map(m => <Card key={m.id} m={m} onExplore={onNav} sso={ssoByModule[m.code]} />)}
      </div>

      {!!locked.length && <div className="mk-section">Available to add</div>}
      <div className="mk-grid">
        {locked.map(m => (
          <Card key={m.id} m={m} onPreview={() => setPreview(m)} onPurchase={() => purchase(m)} />
        ))}
      </div>

      {preview && (
        <PreviewModal m={preview} onClose={() => setPreview(null)}
          onPurchase={() => purchase(preview)} />
      )}
    </div>
  )
}

function Card({ m, onExplore, onPreview, onPurchase, sso }) {
  const from = m.fromPrice
  const cur = m.plans?.[0]?.price?.currency || 'INR'
  const [busy, setBusy] = useState(false)
  const [ssoErr, setSsoErr] = useState('')

  // openSsoApp opens the tab synchronously before awaiting the ticket, so it
  // must be called straight from the handler or the pop-up blocker eats it.
  async function openViaSso() {
    setSsoErr('')
    setBusy(true)
    try { await openSsoApp(sso.key) }
    catch (e) { setSsoErr(e?.detail || e?.message || 'Could not open the application.') }
    finally { setBusy(false) }
  }

  return (
    <div className={`mk-card ${m.owned ? '' : 'locked'}`} style={{ '--mc': m.color }}>
      {/* the gold crown marks everything this tenant has not bought */}
      {!m.owned && (
        <span className="mk-crown" title="Not included in your plan">
          <Icon n="ti-crown" />
        </span>
      )}

      <div className="mk-top">
        <span className="mk-ic"><Icon n={m.icon} /></span>
        <div style={{ minWidth: 0 }}>
          <div className="mk-name">{m.name}</div>
          {m.category && <div className="mk-cat">{m.category}</div>}
        </div>
      </div>

      <div className="mk-tag">{m.tagline || m.description}</div>

      {!!(m.features || []).length && (
        <ul className="mk-feats">
          {m.features.slice(0, 3).map((f, i) => <li key={i}><Icon n="ti-check" />{f}</li>)}
        </ul>
      )}

      <div className="mk-foot">
        {m.owned ? (
          <>
            <span className="mk-badge live"><span className="status-dot green" /> Active</span>
            {sso ? (
              // This service is a satellite app we hold a session for: open it
              // signed in rather than dumping the user on its login screen.
              <button className="btn btn-primary" disabled={busy} onClick={openViaSso}
                title={`Open ${sso.label} — you are already signed in`}>
                <Icon n={busy ? 'ti-loader-2' : 'ti-external-link'} />{' '}
                Open {sso.label.replace(/^GoalCert /, '')}
              </button>
            ) : (
              <button className="btn btn-primary"
                onClick={() => {
                  // An external service opens where the owner pointed it;
                  // an in-app module just routes.
                  if (m.redirectUrl) window.open(m.redirectUrl, '_blank', 'noopener')
                  else onExplore?.('overview')
                }}>
                Explore <Icon n="ti-arrow-right" />
              </button>
            )}
          </>
        ) : (
          <>
            {from != null
              ? <span className="mk-price">from <b>{money(from, cur)}</b></span>
              : <span className="mk-price muted">Contact sales</span>}
            <div className="mk-btns">
              <button className="btn btn-ghost" onClick={onPreview}>Preview</button>
              <button className="btn btn-primary" onClick={onPurchase}>Purchase</button>
            </div>
          </>
        )}
      </div>
      {ssoErr && <div className="dw-error" style={{ marginTop: 8 }}>{ssoErr}</div>}
    </div>
  )
}

function PreviewModal({ m, onClose, onPurchase }) {
  return (
    <div className="ms-modal-wrap" onClick={onClose}>
      <div className="ms-modal" onClick={e => e.stopPropagation()} style={{ '--mc': m.color }}>
        <div className="ms-modal-head">
          <span className="mk-ic"><Icon n={m.icon} /></span>
          <div style={{ flex: 1 }}>
            <div className="panel-title">{m.name}</div>
            <div className="panel-subtitle">{m.tagline}</div>
          </div>
          <button className="btn btn-ghost" onClick={onClose}><Icon n="ti-x" /></button>
        </div>

        <div className="mk-preview">
          {m.bannerUrl && <img className="mk-banner" src={m.bannerUrl} alt="" />}
          <p>{m.description || 'No description provided yet.'}</p>

          {!!(m.features || []).length && (
            <>
              <div className="mk-section">What you get</div>
              <ul className="mk-feats big">
                {m.features.map((f, i) => <li key={i}><Icon n="ti-check" />{f}</li>)}
              </ul>
            </>
          )}

          {!!(m.plans || []).length && (
            <>
              <div className="mk-section">Plans</div>
              <div className="mk-plans">
                {m.plans.map(p => (
                  <div className="mk-plan" key={p.id}>
                    <div className="mk-plan-name">
                      {p.name}{p.isPopular && <span className="pill pill-purple">popular</span>}
                    </div>
                    <div className="mk-plan-scope">{p.scope}</div>
                    <div className="mk-plan-price">
                      {p.price ? <>{money(p.price.amount, p.price.currency)}
                        <em>{p.price.period}</em></> : 'Custom'}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="ms-modal-foot">
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
          <button className="btn btn-primary" onClick={onPurchase}>
            Purchase <Icon n="ti-arrow-right" />
          </button>
        </div>
      </div>
    </div>
  )
}
