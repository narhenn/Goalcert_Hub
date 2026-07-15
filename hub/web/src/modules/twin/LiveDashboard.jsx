// LiveDashboard.jsx — the Digital Twin's live operations surface: KPIs, telemetry,
// findings. Fault injection only appears if the Scenario Engine is entitled; the
// "Repair with AI" CTA only appears if the Agentic AI layer is entitled — the panel
// composes itself from what the tenant has.
import React, { useEffect, useRef, useState } from 'react'
import { Icon, SIG, sevClass, fmt, pct, hColor, tilesFor, useCountUp, HealthRing, Sparkline } from '../../lib.jsx'
import { useTwin } from '../../hub/twinState.jsx'
import { useEntitlements } from '../../hub/registry.jsx'
import { faultsFor, humanize } from '../../hub/util.js'
import BimViewer from './scene/BimViewer.jsx'
import GlbViewer from './scene/views/GlbViewer.jsx'
import API from '../../api.js'

// The only extra view a twin exposes from here is Prediction — every bespoke
// per-domain surface (network map, bed board, heatmaps, tactical map…) is
// rendered INSIDE the dashboard by MachineDashboard, from the domain the twin
// service reports. No separate hub pages.

/** The twin's real 3-D scene: a reconstructed object scan (model_url) renders
 *  its GLB; otherwise the BIM scene from the twin's own graph geometry. */
function TwinScene({ tenant }) {
  const [scene, setScene] = useState(undefined)   // undefined = loading
  useEffect(() => {
    let alive = true
    setScene(undefined)
    API.twin.scene(tenant)
      .then(r => { if (alive) setScene(r?.scene_result || null) })
      .catch(() => { if (alive) setScene(null) })
    return () => { alive = false }
  }, [tenant])

  return (
    <div className="card section-gap" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="card-title" style={{ padding: '14px 16px 0' }}>
        <Icon n="ti-3d-cube-sphere" /> Live 3-D Twin
        <span className="pill pill-green" style={{ fontSize: 9 }}>● {scene?.model_url ? 'reconstructed model' : 'reconstructed'}</span>
        <span className="hint" style={{ fontSize: 11, marginLeft: 'auto', fontWeight: 400 }}>
          drag to orbit · scroll to zoom{scene?.model_url ? '' : ' · click an asset'}
        </span>
      </div>
      <div style={{ height: 380, position: 'relative', background: '#1b1e26', marginTop: 12 }}>
        {scene === undefined
          ? <div className="empty" style={{ color: '#aab0e0', paddingTop: 160 }}><span className="spinner" /> Reconstructing scene…</div>
          : scene?.model_url
            ? <GlbViewer url={scene.model_url} height={380} label="Reconstructed model · live twin" />
            : <BimViewer scene={scene?.nodes?.length ? scene : undefined} tenant={tenant} />}
      </div>
    </div>
  )
}

export default function LiveDashboard({ onRepair, onNav }) {
  const { active, twin, running, toggleRunning, simFault, injectFault } = useTwin()
  const { has } = useEntitlements()
  const hasScenario = has('scenario')
  const hasAgentic = has('agentic')
  const extraViews = [
    { id: 'predict', label: 'Prediction / RUL', icon: 'ti-chart-histogram' },
  ]

  const live = twin?.latest || {}
  const h = twin?.health
  const findings = twin?.findings || []
  const incidents = twin?.incidents || []
  const tiles = tilesFor(active.domain)
  const risk = h == null ? null : Math.round((1 - h) * 100)
  const animRisk = useCountUp(risk ?? 0)
  const animFindings = useCountUp(findings.length)
  const headlineSig = tiles[0]
  const headline = SIG[headlineSig]
  const faults = faultsFor(active.domain)

  // sparkline history buffer
  const hist = useRef({})
  useEffect(() => {
    if (!live) return
    for (const [k, v] of Object.entries(live)) {
      if (v == null) continue
      ;(hist.current[k] || (hist.current[k] = [])).push(v)
      if (hist.current[k].length > 30) hist.current[k].shift()
    }
  }, [live])

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">Live Operations</div>
          <div className="panel-subtitle">{active.name} · streaming sensor telemetry in real time</div>
        </div>
        <div className="panel-actions">
          <button className={`btn ${running ? '' : 'btn-primary'}`} onClick={toggleRunning}>
            <Icon n={running ? 'ti-player-pause' : 'ti-player-play'} /> {running ? 'Stop twin' : 'Start twin'}
          </button>
          {hasAgentic && (
            <button className="btn btn-primary repair-cta" onClick={onRepair} title="Enter AI Maintenance Director">
              <Icon n="ti-robot" /> Repair with AI
            </button>
          )}
          {hasScenario && faults.length > 0 && (
            <select className="select" style={{ width: 'auto', minWidth: 160 }}
              value={simFault || ''} onChange={e => injectFault(e.target.value || null)}>
              <option value="">Inject fault…</option>
              <option value="">✓ Healthy (clear)</option>
              {faults.map(f => <option key={f.id} value={f.id}>⚠ {f.label}</option>)}
            </select>
          )}
        </div>
      </div>

      {/* Views of this twin (Prediction + any domain-specific map) — reached from
          here rather than the sidebar, so the twin section stays Twins + Dashboard. */}
      {onNav && (
        <div className="twin-views section-gap" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {extraViews.map(v => (
            <button key={v.id} className="btn" onClick={() => onNav(v.id)}>
              <Icon n={v.icon} /> {v.label}
            </button>
          ))}
        </div>
      )}

      {/* Live 3-D digital twin — the twin's real reconstructed scene, streamed
          from the Digital Twin service through the gateway, with live severity
          overlaid by entityId. A twin built from a photo shows its RECONSTRUCTED
          model (GLB) rather than the synthesized building. */}
      {active.tenant && <TwinScene tenant={active.tenant} />}

      {/* KPI row */}
      <div className="grid-4 section-gap">
        <div className="card kpi"><div className="card-label">Twin Health</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <HealthRing value={h} size={56} stroke={5} />
            <div><div className="card-value" style={{ color: hColor(h), fontSize: 22 }}>{pct(h)}</div>
              <div className="card-change">physics index</div></div>
          </div></div>
        <div className="card kpi"><div className="card-label">Risk Score</div>
          <div className="card-value">{risk == null ? '—' : Math.round(animRisk)}</div>
          <div className="card-change" style={{ fontWeight: 600, color: risk >= 60 ? 'var(--accent-red)' : risk >= 30 ? 'var(--accent-amber)' : 'var(--accent-green)' }}>
            {risk >= 60 ? 'HIGH' : risk >= 30 ? 'ELEVATED' : 'LOW'}</div></div>
        <div className="card kpi"><div className="card-label">Active Findings</div>
          <div className="card-value" style={{ color: findings.length > 0 ? 'var(--accent-red)' : 'var(--accent-amber)' }}>{Math.round(animFindings)}</div>
          <div className="card-change">{incidents.length} incident(s)</div></div>
        {headline && <div className="card kpi"><div className="card-label">{headline.label}</div>
          <div className="card-value" style={{ color: sevClass(headlineSig, live[headlineSig]) === 'crit' ? 'var(--accent-red)' : 'var(--text)' }}>
            {fmt(live[headlineSig])}<span style={{ fontSize: 14 }}>{headline.unit ? ' ' + headline.unit : ''}</span></div>
          <div className="card-change">live</div></div>}
      </div>

      {/* active fault banner */}
      {simFault && (
        <div className="card section-gap" style={{ borderColor: 'rgba(225,29,72,.4)', background: 'rgba(225,29,72,.06)' }}>
          <div className="card-title" style={{ color: 'var(--accent-red)', marginBottom: 6 }}>
            <Icon n="ti-alert-octagon" /> Fault injected · {humanize(simFault)}</div>
          <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>The Scenario Engine is driving this fault into the twin's physics —
            watch the coupled signals drift and health degrade. Clear it from the fault selector above.</div>
        </div>
      )}

      {/* Live telemetry */}
      <div className="card section-gap">
        <div className="card-title"><Icon n="ti-activity" /> Live Telemetry <span className="pill pill-green">● streaming</span></div>
        <div className="sensor-grid">
          {tiles.filter(s => live[s] != null).map(s => {
            const sev = sevClass(s, live[s])
            const col = sev === 'crit' ? '#e11d48' : sev === 'warn' ? '#d97706' : '#7c3aed'
            return (
              <div key={s} className={`sensor-card ${sev}`}>
                <span className="live-indicator" />
                <div className="sensor-label">{SIG[s]?.label || s}</div>
                <div><span className="sensor-value">{fmt(live[s])}</span><span className="sensor-unit">{SIG[s]?.unit}</span></div>
                <Sparkline data={hist.current[s]} color={col} />
              </div>
            )
          })}
        </div>
      </div>

      {/* Findings + incidents */}
      <div className="grid-2">
        <div className="card">
          <div className="card-title"><Icon n="ti-alert-triangle" /> Active Findings
            <span className={`pill ${findings.length > 0 ? 'pill-red' : 'pill-surface'}`}>{findings.length}</span></div>
          {findings.length === 0
            ? <div className="empty">No findings — within limits.</div>
            : <>
                <div className="event-list">{findings.slice(0, 6).map((f, i) => (
                  <div key={i} className="event-item">
                    <div className={`event-icon ${f.severity === 'critical' ? 'ev-crit' : 'ev-warn'}`}><Icon n="ti-alert-triangle" /></div>
                    <div className="event-body"><div className="event-title">{f.displayName || 'finding'}</div>
                      <div className="event-meta">{f.message}</div></div>
                  </div>))}</div>
                {hasAgentic && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                    <button className="btn btn-primary repair-cta" style={{ width: '100%', justifyContent: 'center' }} onClick={onRepair}>
                      <Icon n="ti-robot" /> Launch AI Repair Session</button>
                  </div>
                )}
              </>}
        </div>
        <div className="card">
          <div className="card-title"><Icon n="ti-git-merge" /> Incidents <span className="pill pill-surface">{incidents.length}</span></div>
          {incidents.length === 0
            ? <div className="empty">No incidents grouped yet.</div>
            : <div className="event-list">{incidents.map((inc, i) => (
                <div key={i} className="event-item" style={{ borderColor: 'rgba(225,29,72,.25)' }}>
                  <div className="event-icon ev-crit"><Icon n="ti-urgent" /></div>
                  <div className="event-body"><div className="event-title">{inc.displayName || 'Incident'}</div>
                    <div className="event-meta">{inc.severity || 'critical'}</div></div>
                </div>))}</div>}
        </div>
      </div>

      {!hasScenario && !hasAgentic && (
        <div className="cta-band section-gap" style={{ marginTop: 16 }}>
          <h3>Add reasoning or what-ifs</h3>
          <p>You're monitoring the twin. Enable the <b>Agentic AI</b> layer for an always-on co-pilot and one-tap
            diagnosis, or the <b>Scenario Engine</b> to inject faults and run what-ifs — from the module switcher up top.</p>
        </div>
      )}
    </div>
  )
}
