// Overview.jsx — the hub's common dashboard. Always present. Shows who the tenant is,
// what they've adopted (the composed plan), and the overall/twin health at a glance —
// then routes into whichever module surfaces are enabled.
// Includes a live platform health panel that probes all 4 backend services on mount.
import React, { useEffect, useState } from 'react'
import { Icon, pct, hColor, HealthRing, domainMeta } from '../../lib.jsx'
import { MODULE_ORDER, MODULES, planName, useEntitlements } from '../../hub/registry.jsx'
import { useTwin, useTwinFrame } from '../../hub/twinState.jsx'
import { useAudit } from '../../hub/audit.jsx'
import { timeAgo } from '../../hub/util.js'
import AssetPicker from '../AssetPicker.jsx'
import API from '../../api.js'
import { loadHistory } from '../hivemind/history.js'

const SERVICE_LABELS = {
  twin: 'NextXR Digital Twin',
  agents: 'HiveMind Agents',
  scenario: 'GoalCert Scenarios',
  agentbuilder: 'Agent Builder',
}

function PlatformHealth() {
  const [health, setHealth] = useState(null)   // null = loading, object = results

  useEffect(() => {
    API.healthCheck().then(setHealth).catch(() => setHealth({}))
  }, [])

  const recheck = () => {
    setHealth(null)
    API.healthCheck().then(setHealth).catch(() => setHealth({}))
  }

  const services = Object.keys(SERVICE_LABELS)
  const onlineCount = health ? services.filter(s => health[s]?.ok).length : 0

  return (
    <div className="card">
      <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon n="ti-server" /> Platform services
        {health && (
          <span className={`pill ${onlineCount === services.length ? 'pill-green' : onlineCount === 0 ? 'pill-red' : 'pill-amber'}`}
            style={{ fontSize: 9 }}>
            {onlineCount}/{services.length} online
          </span>
        )}
        <button className="btn" style={{ marginLeft: 'auto', padding: '3px 8px', fontSize: 11 }} onClick={recheck}
          title="Re-check services">
          <Icon n="ti-refresh" />
        </button>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 4 }}>
        {services.map(key => {
          const s = health?.[key]
          const loading = health === null
          const ok = s?.ok
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
              <span style={{
                width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                background: loading ? 'var(--muted)' : ok ? 'var(--accent-green)' : 'var(--accent-red)',
                boxShadow: loading ? 'none' : ok ? '0 0 5px rgba(22,163,74,.6)' : '0 0 5px rgba(225,29,72,.5)',
              }} />
              <span style={{ flex: 1 }}>{SERVICE_LABELS[key]}</span>
              <span className="hint" style={{ fontSize: 10.5 }}>
                {loading ? 'checking…' : ok ? `HTTP ${s.status}` : (s?.error || 'unreachable')}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function HiveMindStats({ onNav }) {
  const history = loadHistory()
  const totalBriefs = history.length
  const totalTokens = history.reduce((a, h) => a + (h.totalTokens || 0), 0)
  const lastBrief = history[0]

  return (
    <div className="card" style={{ cursor: totalBriefs > 0 ? 'pointer' : 'default' }} onClick={() => totalBriefs > 0 && onNav('hivemind')}>
      <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 22, height: 22, borderRadius: '30%', background: 'var(--brand-2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#fff' }}>
          <Icon n="ti-hexagon" />
        </span>
        HiveMind
        {totalBriefs > 0 && (
          <span className="pill pill-purple" style={{ fontSize: 9 }}>{totalBriefs} brief{totalBriefs !== 1 ? 's' : ''}</span>
        )}
      </div>
      {totalBriefs === 0 ? (
        <div className="empty" style={{ padding: '10px 0', fontSize: 12 }}>No briefs run yet — launch the hive to see stats here.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
          <div style={{ display: 'flex', gap: 16 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--display)', color: 'var(--brand-2)' }}>{totalBriefs}</div>
              <div className="hint" style={{ fontSize: 10 }}>briefs run</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--display)', color: 'var(--brand-2)' }}>{totalTokens > 0 ? (totalTokens / 1000).toFixed(1) + 'K' : '—'}</div>
              <div className="hint" style={{ fontSize: 10 }}>tokens used</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--display)', color: 'var(--brand-2)' }}>{lastBrief?.agentsUsed?.length || 0}</div>
              <div className="hint" style={{ fontSize: 10 }}>last agents</div>
            </div>
          </div>
          {lastBrief && (
            <div style={{ fontSize: 11.5, color: 'var(--muted)', borderTop: '1px solid var(--border)', paddingTop: 8, lineHeight: 1.4 }}>
              <span style={{ fontWeight: 600, color: 'var(--text)' }}>Last brief:</span>{' '}
              {(lastBrief.brief || 'Untitled').slice(0, 80)}{(lastBrief.brief || '').length > 80 ? '…' : ''}
            </div>
          )}
        </div>
      )}
      <div style={{ marginTop: 10 }}>
        <button className="btn" style={{ fontSize: 11, padding: '4px 10px', color: 'var(--brand-2)' }} onClick={e => { e.stopPropagation(); onNav('hivemind') }}>
          <Icon n="ti-arrow-right" /> Open Hive
        </button>
      </div>
    </div>
  )
}

export default function Overview({ user, onNav, onOpenAI }) {
  const { enabled, has } = useEntitlements()
  const { active, openTwin } = useTwin()
  const twin = useTwinFrame()
  const { entries } = useAudit()
  const h = twin?.health
  const findings = twin?.findings || []

  const quickActions = []
  if (has('twin')) quickActions.push(
    { label: 'Open Twins', icon: 'ti-stack-2', go: () => onNav('twins'), mc: MODULES.twin.accent },
    { label: 'Build a twin', icon: 'ti-sparkles', go: () => onNav('build'), mc: MODULES.twin.accent })
  if (has('scenario')) quickActions.push(
    { label: 'Run a scenario', icon: 'ti-urgent', go: () => onNav('scenario'), mc: MODULES.scenario.accent })
  if (has('agentic')) quickActions.push(
    { label: 'AI actions', icon: 'ti-robot', go: onOpenAI, mc: MODULES.agentic.accent })

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">Welcome back, {user.name}</div>
          <div className="panel-subtitle">Your composed platform — {planName(enabled)}</div>
        </div>
      </div>

      {/* Top row: account · composition · health */}
      <div className="grid-3 section-gap">
        {/* account */}
        <div className="card ov-account">
          <div className="ov-avatar">{user.name[0]}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, fontFamily: 'var(--display)' }}>{user.name}</div>
            <div className="hint" style={{ fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</div>
            <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span className="pill pill-surface" style={{ fontSize: 9 }}><Icon n="ti-building" /> {user.tenant}</span>
              <span className="pill pill-purple" style={{ fontSize: 9 }}>{planName(enabled)}</span>
            </div>
          </div>
        </div>

        {/* composition */}
        <div className="card">
          <div className="card-title"><Icon n="ti-layout-grid" /> Adopted modules</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {MODULE_ORDER.map(id => {
              const m = MODULES[id]; const on = has(id)
              return (
                <div key={id} className="ov-mod" style={{ '--mc': m.accent, '--mc-soft': m.accentSoft, opacity: on ? 1 : 0.5 }}>
                  <span className="ov-mod-ic"><Icon n={m.icon} /></span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span className="ov-mod-label">{m.label}</span>
                    <span className="ov-mod-role">{m.role}</span>
                  </span>
                  <span className={`pill ${on ? 'pill-green' : 'pill-surface'}`} style={{ fontSize: 9 }}>{on ? 'active' : 'off'}</span>
                </div>
              )
            })}
          </div>
          {has('twin') && has('agentic') && (
            <div className="ov-ailine"><Icon n="ti-sparkles" /> AI layer engaged over the twin</div>
          )}
        </div>

        {/* health */}
        <div className="card">
          <div className="card-title"><Icon n="ti-heart-rate-monitor" /> Health</div>
          {active ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <HealthRing value={h} size={78} stroke={7} label="health" />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{active.name}</div>
                <div className="hint" style={{ fontSize: 11.5 }}>{domainMeta(active.domain).tag}</div>
                <div style={{ marginTop: 8, fontSize: 12 }}>
                  <span style={{ color: hColor(h), fontWeight: 700 }}>{pct(h)}</span> physics health ·{' '}
                  <span style={{ color: findings.length ? 'var(--accent-red)' : 'var(--accent-green)', fontWeight: 700 }}>{findings.length}</span> findings</div>
                <button className="btn" style={{ marginTop: 10, padding: '5px 12px' }} onClick={() => onNav(has('twin') ? 'dashboard' : 'scenario')}>
                  <Icon n="ti-arrow-right" /> Open</button>
              </div>
            </div>
          ) : (
            <div className="empty" style={{ padding: '18px 8px' }}>No active twin. Pick an asset below to bring its health online.</div>
          )}
        </div>
      </div>

      {/* Platform health + HiveMind stats */}
      <div className="grid-2 section-gap">
        <PlatformHealth />
        <HiveMindStats onNav={onNav} />
      </div>

      {/* Quick actions */}
      {quickActions.length > 0 && (
        <div className="ov-actions section-gap">
          {quickActions.map((a, i) => (
            <button key={i} className="ov-action" style={{ '--mc': a.mc }} onClick={a.go}>
              <span className="ov-action-ic"><Icon n={a.icon} /></span>{a.label}</button>
          ))}
        </div>
      )}

      {/* No twin yet → inline asset picker (works for any module) */}
      {!active && (
        <div className="card section-gap">
          <div className="card-title"><Icon n="ti-stack-2" /> Start with an asset</div>
          <div style={{ fontSize: 12.5, color: 'var(--muted)', marginBottom: 14 }}>
            Open a twin to run it on the built-in simulator — telemetry, health and findings come online instantly.</div>
          <AssetPicker onOpen={(d, n) => { openTwin(d, n); onNav(has('twin') ? 'dashboard' : has('scenario') ? 'scenario' : 'overview') }} compact />
        </div>
      )}

      {/* Recent activity */}
      <div className="card section-gap">
        <div className="card-title"><Icon n="ti-history" /> Recent activity
          <span className="pill pill-surface">{entries.length}</span></div>
        {entries.length === 0
          ? <div className="empty">Nothing yet — build a twin, run a scenario or ask the AI to get started.</div>
          : <div className="event-list">{entries.slice(0, 6).map(e => (
              <div key={e.id} className="event-item">
                <div className="event-icon" style={{ background: MODULES[e.module]?.accentSoft, color: MODULES[e.module]?.accent }}>
                  <Icon n={MODULES[e.module]?.icon || 'ti-point'} /></div>
                <div className="event-body"><div className="event-title">{e.summary}</div>
                  <div className="event-meta">{e.detail}</div></div>
                <div className="event-time">{timeAgo(e.ts)}</div>
              </div>))}</div>}
      </div>
    </div>
  )
}
