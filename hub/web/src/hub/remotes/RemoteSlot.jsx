// RemoteSlot.jsx — the placeholder a navigation page renders until its platform
// remote is federated in. It proves the page contract end-to-end: it calls the
// page's hub API (/api/pages/<platform>/<page>) and shows the stub response, the
// configured remote URL, and what will mount here at integration time.
import React, { useEffect, useState } from 'react'
import { Icon } from '../../lib.jsx'
import { PageAPI } from '../../services/pageApi.js'
import './remotes.css'

export default function RemoteSlot({ platform, page, title, accent, remoteUrl, pending }) {
  const [info, setInfo] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(() => {
    let live = true
    setInfo(null); setErr(null)
    PageAPI.load(platform, page)
      .then(d => { if (live) setInfo(d) })
      .catch(e => { if (live) setErr(e.message) })
    return () => { live = false }
  }, [platform, page])

  return (
    <div className="panel">
      <div className="panel-header"><div>
        <div className="panel-title">{title || info?.label || page}</div>
        <div className="panel-subtitle">{platform} · {page} · integration slot</div>
      </div></div>

      <div className="slot-body" style={{ '--acc': accent || '#7A5CF0' }}>
        <div className="slot-badge"><Icon n="ti-plug-connected" /> {pending || 'Remote not yet mounted'}</div>

        <p className="slot-lead">
          This page is part of the hub skeleton. Once the <b>{platform}</b> platform is
          federated in, its real page renders here <b>natively</b> — no re-porting, and
          updates to the platform flow through automatically.
        </p>

        <div className="slot-grid">
          <div className="slot-card">
            <div className="slot-card-h">Page API</div>
            <code>GET /api/pages/{platform}/{page}</code>
            {err
              ? <div className="slot-err">contract error: {err}</div>
              : <div className="slot-ok">{info ? `contract OK · ${info.status}` : 'checking…'}</div>}
          </div>

          <div className="slot-card">
            <div className="slot-card-h">Remote</div>
            <code>{remoteUrl || '(set VITE_*_REMOTE to the remoteEntry.js URL)'}</code>
            <div className={remoteUrl ? 'slot-ok' : 'slot-warn'}>
              {remoteUrl ? 'configured' : 'not configured yet'}
            </div>
          </div>

          <div className="slot-card">
            <div className="slot-card-h">Source · buttons</div>
            <code>{info?.source || '…'}</code>
            {info?.buttons?.length
              ? <div className="slot-buttons">{info.buttons.map(b => <span key={b} className="pill pill-surface">{b}</span>)}</div>
              : null}
          </div>
        </div>
      </div>
    </div>
  )
}
