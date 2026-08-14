// DynamicDashboard.jsx — the role's landing page, assembled from the database.
//
// The server returns a list of widgets (code, title, component, size, config);
// this file maps `component` onto a React implementation and lays them out.
// Adding a tile to a role is an INSERT into dashboard_permissions — no code
// change, no deploy.
//
// Honesty rule: a widget backed by an endpoint shows real data; a widget whose
// backend does not exist yet says so. It never invents a number, because a
// dashboard that lies is worse than one that admits a gap.
import React, { useEffect, useState } from 'react'
import { Icon } from '../lib.jsx'
import API from '../api.js'
import { useRbac } from './rbac.jsx'
import { useAuth } from './auth.jsx'

// ── shared shell ──────────────────────────────────────────────────────

function Tile({ w, children, foot }) {
  return (
    <div className={`dw dw-${w.size}`} style={{ '--wc': w.color }}>
      <div className="dw-head">
        <span className="dw-ic"><Icon n={w.icon} /></span>
        <div className="dw-titles">
          <div className="dw-title">{w.title}</div>
          {w.subtitle && <div className="dw-sub">{w.subtitle}</div>}
        </div>
      </div>
      <div className="dw-body">{children}</div>
      {foot && <div className="dw-foot">{foot}</div>}
    </div>
  )
}

/** Shown when a widget's backing service isn't wired yet. Deliberately plain. */
function NotConnected({ what }) {
  return (
    <div className="dw-empty">
      <Icon n="ti-plug-connected-x" />
      <span>{what} not connected</span>
    </div>
  )
}

function Metric({ value, label, tone }) {
  return (
    <div className="dw-metric">
      <b className={tone ? `tone-${tone}` : ''}>{value}</b>
      <span>{label}</span>
    </div>
  )
}

// ── widget implementations ────────────────────────────────────────────
// Each receives the widget row; `config` carries per-instance props.

/**
 * Platform counters. All of them read the same /api/platform/stats payload, so
 * it is fetched ONCE per render pass and shared — five tiles must not mean five
 * identical requests. `config.metric` names which number this tile shows.
 */
let _statsPromise = null
const platformStats = () => {
  if (!_statsPromise) {
    _statsPromise = API.platform.stats()
    // Let the next mount refetch rather than serving a stale figure forever.
    setTimeout(() => { _statsPromise = null }, 15000)
  }
  return _statsPromise
}

function PlatformStat({ w }) {
  const [n, setN] = useState(null)
  const [err, setErr] = useState(false)

  useEffect(() => {
    let dead = false
    platformStats()
      .then(d => { if (!dead) setN(d.counts?.[w.config?.metric] ?? 0) })
      .catch(() => { if (!dead) setErr(true) })
    return () => { dead = true }
  }, [w.config?.metric])

  if (err) return <Tile w={w}><NotConnected what="Platform stats" /></Tile>
  return (
    <Tile w={w}>
      <div className="dw-big">{n == null ? <span className="st-spin" /> : n}</div>
    </Tile>
  )
}

function EarningsTile({ w }) {
  const [d, setD] = useState(null)
  const [err, setErr] = useState(false)

  useEffect(() => {
    let dead = false
    platformStats()
      .then(x => { if (!dead) setD(x) })
      .catch(() => { if (!dead) setErr(true) })
    return () => { dead = true }
  }, [])

  if (err) return <Tile w={w}><NotConnected what="Earnings" /></Tile>
  if (!d) return <Tile w={w}><span className="st-spin" /></Tile>

  const e = d.earnings || {}
  const money = (v) => `₹${Number(v || 0).toLocaleString('en-IN')}`
  const byModule = (d.earningsByModule || []).filter(x => x.amount > 0)

  return (
    <Tile w={w} foot={e.pending ? `${money(e.pending)} pending` : 'Nothing pending'}>
      <div className="dw-row" style={{ gap: 26, marginBottom: 10 }}>
        <Metric value={money(e.total)} label="Paid to date" />
        <Metric value={money(e.monthToDate)} label="This month" tone="ok" />
      </div>
      {byModule.length > 0 && (
        <div className="dw-list">
          {byModule.map(x => (
            <div className="dw-row" key={x.moduleCode}>
              <span className="dw-row-label">{x.moduleCode}</span>
              <em>{money(x.amount)}</em>
            </div>
          ))}
        </div>
      )}
      {/* Revenue counts only settled payments; see the note in platform_stats. */}
      {!byModule.length && <div className="ms-hint">No settled payments yet.</div>}
    </Tile>
  )
}

function StatTile({ w }) {
  const [n, setN] = useState(null)
  const [err, setErr] = useState(false)

  useEffect(() => {
    let dead = false
    const source = w.code === 'w.plat.tenants' ? API.admin.orgs() : API.admin.users()
    source
      .then(d => { if (!dead) setN((d.orgs || d.users || []).length) })
      .catch(() => { if (!dead) setErr(true) })
    return () => { dead = true }
  }, [w.code])

  if (err) return <Tile w={w}><NotConnected what="Source" /></Tile>
  return (
    <Tile w={w}>
      <div className="dw-big">{n == null ? <span className="st-spin" /> : n}</div>
    </Tile>
  )
}

function ServiceHealth({ w }) {
  const [svc, setSvc] = useState(null)
  useEffect(() => {
    API.healthCheck().then(setSvc).catch(() => setSvc({}))
  }, [])
  if (!svc) return <Tile w={w}><span className="st-spin" /></Tile>
  const rows = Object.entries(svc)
  return (
    <Tile w={w}>
      {rows.length === 0 && <NotConnected what="Services" />}
      <div className="dw-list">
        {rows.map(([name, s]) => (
          <div className="dw-row" key={name}>
            <span className={`status-dot ${s.ok ? 'green' : 'red'}`} />
            <span className="dw-row-label">{name}</span>
            <em>{s.ok ? 'reachable' : (s.error || `HTTP ${s.status}`)}</em>
          </div>
        ))}
      </div>
    </Tile>
  )
}

function AuditFeed({ w }) {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    API.admin.audit(8).then(d => setRows(d.entries || [])).catch(() => setRows([]))
  }, [])
  if (!rows) return <Tile w={w}><span className="st-spin" /></Tile>
  return (
    <Tile w={w}>
      {rows.length === 0
        ? <div className="dw-empty"><Icon n="ti-history" /><span>No activity recorded yet</span></div>
        : (
          <div className="dw-list">
            {rows.map(r => (
              <div className="dw-row" key={r.id}>
                <span className="dw-row-label"><b>{r.actorEmail}</b> · {r.action}</span>
                <em>{r.createdAt ? new Date(r.createdAt).toLocaleString() : ''}</em>
              </div>
            ))}
          </div>
        )}
    </Tile>
  )
}

function UserBreakdown({ w }) {
  const [users, setUsers] = useState(null)
  useEffect(() => {
    API.admin.users().then(d => setUsers(d.users || [])).catch(() => setUsers([]))
  }, [])
  if (!users) return <Tile w={w}><span className="st-spin" /></Tile>
  const byRole = users.reduce((acc, u) => { acc[u.role] = (acc[u.role] || 0) + 1; return acc }, {})
  return (
    <Tile w={w} foot={`${users.length} total`}>
      <div className="dw-list">
        {Object.entries(byRole).sort((a, b) => b[1] - a[1]).map(([role, n]) => (
          <div className="dw-row" key={role}>
            <span className="dw-row-label">{role}</span><em>{n}</em>
          </div>
        ))}
      </div>
    </Tile>
  )
}

/** Everything whose backend does not exist yet resolves here — named honestly. */
function Pending({ w, what }) {
  return <Tile w={w}><NotConnected what={what} /></Tile>
}

const REGISTRY = {
  PlatformStat,
  EarningsTile,
  StatTile,
  ServiceHealth,
  AuditFeed,
  UserBreakdown,
  ReadinessGauge: (p) => <Pending {...p} what="Readiness service" />,
  KpiStrip: (p) => <Pending {...p} what="Production KPI feed" />,
  TeamHeatmap: (p) => <Pending {...p} what="Team readiness feed" />,
  MyShift: (p) => <Pending {...p} what="Shift assignment service" />,
  TrainingProgress: (p) => <Pending {...p} what="Training service" />,
  ComplianceTile: (p) => <Pending {...p} what="Compliance service" />,
  WorkOrderList: (p) => <Pending {...p} what="Maintenance service" />,
  IncidentTile: (p) => <Pending {...p} what="Incident service" />,
  BillingTile: (p) => <Pending {...p} what="Billing service" />,
}

// ── the page ──────────────────────────────────────────────────────────

export default function DynamicDashboard() {
  const { dashboard, roles, loading, error } = useRbac()
  const { user } = useAuth()

  if (loading) return <div className="panel"><span className="st-spin" /></div>

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">
            {user.fullName ? `Welcome, ${user.fullName.split(' ')[0]}` : 'Dashboard'}
          </div>
          <div className="panel-subtitle">
            {roles.map(r => r.name).join(' · ') || 'No role assigned'}
            {user.orgName ? ` · ${user.orgName}` : ' · Platform'}
          </div>
        </div>
      </div>

      {error && <div className="dw-error">Could not load your dashboard: {error}</div>}

      {dashboard.length === 0 && !error && (
        <div className="dw-empty" style={{ padding: 40 }}>
          <Icon n="ti-layout-dashboard" />
          <span>No widgets are assigned to your role yet.</span>
        </div>
      )}

      <div className="dw-grid">
        {dashboard.map(w => {
          const C = REGISTRY[w.component]
          if (!C) {
            // An unknown component name is a data problem, not a crash.
            return <Pending key={w.code} w={w} what={`Widget "${w.component}"`} />
          }
          return <C key={w.code} w={w} />
        })}
      </div>
    </div>
  )
}
