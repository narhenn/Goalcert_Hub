// App.jsx — the Integration Hub shell, auth-gated and role-driven.
//
// Flow: sign in → the role your admin assigned resolves to a persona → the shell
// renders exactly that persona's platform view (nav grouped by Twin/Scenario/Hive,
// gated by org entitlements + policy). No persona is chosen in the browser.
// super_admin/admin may "preview as" another persona to see its dashboard.
import React, { useEffect, useMemo, useState } from 'react'
import { Logo, Icon, pct } from './lib.jsx'
import { VerticalProvider, useVertical, VERTICALS, verticalForTwin } from './hub/verticalState.jsx'
import { AuthProvider, useAuth } from './hub/auth.jsx'
import { RbacProvider, useRbac } from './hub/rbac.jsx'
import DynamicDashboard from './hub/DynamicDashboard.jsx'
import { navigate } from './router.jsx'
import { EntitlementProvider, useEntitlements, NAV, MODULES } from './hub/registry.jsx'
import { PersonaProvider, usePersona, LOOP_STAGES } from './hub/personas.jsx'
import { LoopProvider } from './hub/loopState.jsx'
import { TwinProvider, useTwin, useTwinFrame } from './hub/twinState.jsx'
import { AuditProvider } from './hub/audit.jsx'
import Login from './hub/Login.jsx'
import ChangePassword from './hub/ChangePassword.jsx'
import Profile from './hub/Profile.jsx'
import SsoLauncher from './hub/SsoLauncher.jsx'
import SsoAutoNotice from './hub/SsoAutoNotice.jsx'
import LoopBoard from './hub/LoopBoard.jsx'
import { CoPilotDock, AIDrawer, RepairTakeover } from './hub/AILayer.jsx'
import Overview from './modules/core/Overview.jsx'
import Audit from './modules/core/Audit.jsx'
import AssetPicker from './modules/AssetPicker.jsx'
import TwinsLibrary from './modules/twin/TwinsLibrary.jsx'
import LiveDashboard from './modules/twin/LiveDashboard.jsx'
import MachineDashboard from './modules/twin/MachineDashboard.jsx'
import BuildTwin from './modules/twin/BuildTwin.jsx'
import { isMachineDomain, serviceDomain } from './modules/twin/scene/machine.js'
import Prediction from './modules/twin/Prediction.jsx'
// Scenario.jsx (twin fault injection) is no longer routed from here — it is the
// "Twin Faults" tab inside SimulationWorkspace, which now owns the Scenario & Faults page.
import Trainer from './modules/scenario/Trainer.jsx'
import SimulationWorkspace from './modules/simulation/SimulationWorkspace.jsx'
import AssignedToMe from './modules/frontline/AssignedToMe.jsx'
import FrontlineFlow from './modules/frontline/FrontlineFlow.jsx'
import SupervisorDashboard from './modules/supervisor/SupervisorDashboard.jsx'
import ComplianceAudit from './modules/core/ComplianceAudit.jsx'
import CaseStudy from './modules/core/CaseStudy.jsx'
import ContentStudio from './modules/lnd/ContentStudio.jsx'
import OpsReadiness from './modules/coo/OpsReadiness.jsx'
import AdminConsole from './modules/admin/AdminConsole.jsx'
import UserManagement from './modules/admin/UserManagement.jsx'
import SuperAdminConsole from './modules/superadmin/SuperAdminConsole.jsx'
import './commerce.css'
import Microservices from './modules/superadmin/Microservices.jsx'
import Payments from './modules/superadmin/Payments.jsx'
import Enquiries from './modules/superadmin/Enquiries.jsx'
import Plans from './modules/superadmin/Plans.jsx'
import PlatformUsers from './modules/superadmin/PlatformUsers.jsx'
import Companies from './modules/superadmin/Companies.jsx'
import Roles from './modules/superadmin/Roles.jsx'
import Permissions from './modules/superadmin/Permissions.jsx'
import SidebarBuilder from './modules/superadmin/SidebarBuilder.jsx'
import { SmtpSettings, StorageSettings } from './modules/superadmin/Settings.jsx'
import Marketplace from './modules/company/Marketplace.jsx'
import HiveMind from './modules/hivemind/HiveMind.jsx'
import './modules/hivemind/hivemind.css'
import AgentBuilder from './modules/agentbuilder/AgentBuilder.jsx'
import TeamChat from './modules/agentbuilder/TeamChat.jsx'
import AgentChat from './modules/agentbuilder/AgentChat.jsx'
import { KpiProvider } from './hub/kpiState.jsx'
import { ReadinessProvider } from './hub/readinessState.jsx'
import { FrontlineProvider, useFrontline } from './hub/frontlineState.jsx'

// platform-owned nav modules (gated by entitlement + persona policy);
// everything else is persona workspace or hub chrome.
const PLATFORM_MODULES = ['twin', 'scenario', 'hivemind', 'agentbuilder']
const HUB_IDS = ['loop', 'audit']

// Routes the seeded sidebar exposes that have no screen behind them yet. Listed
// explicitly so a genuine typo still shows the "not built" panel rather than a
// silently empty pane — and so this list shrinks visibly as pages get built.
const UNBUILT_ROUTES = [
  'billing', 'invoices',
  'maintenance', 'quality', 'safety',
]

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  )
}

// Auth gate: decides login vs forced-password-change vs the running app.
function Gate() {
  const { loading, isAuthed, user } = useAuth()
  useEffect(() => { const t = localStorage.getItem('theme'); if (t) document.documentElement.setAttribute('data-theme', t) }, [])

  // /login is only the sign-in screen. Once a session exists, the dashboard is
  // the real destination — swap the URL so refresh/back land somewhere sensible.
  useEffect(() => {
    if (isAuthed && window.location.pathname.replace(/\/+$/, '') === '/login')
      navigate('/dashboard', { replace: true })
  }, [isAuthed])

  if (loading) return <BootSplash />
  if (!isAuthed) return <Login />
  if (user.mustChangePassword) return <ChangePassword />

  return (
    <VerticalProvider>
      <RbacProvider>
      <EntitlementProvider>
        <PersonaProvider>
          <AuditProvider>
            <LoopProvider>
              <KpiProvider>
                <TwinProvider>
                  <FrontlineWrapper>
                    <Shell />
                  </FrontlineWrapper>
                </TwinProvider>
              </KpiProvider>
            </LoopProvider>
          </AuditProvider>
        </PersonaProvider>
      </EntitlementProvider>
      </RbacProvider>
    </VerticalProvider>
  )
}

function BootSplash() {
  return (
    <div className="login"><div className="onb-bg" />
      <div className="boot-splash"><Logo size={44} /><span className="st-spin" style={{ width: 20, height: 20 }} /></div>
    </div>
  )
}

// Wrap children with Readiness + Frontline providers (need twin context)
function FrontlineWrapper({ children }) {
  const { active } = useTwin()
  const { setVertical } = useVertical()
  const domain = active?.domain || 'edm-machine'
  const twin = active?.twin

  // Opening a twin snaps the top-left vertical switcher to that twin's vertical
  // (MRT → Railway, St. Vera → Hospital, …). Twins with no vertical leave it as-is.
  useEffect(() => {
    const v = verticalForTwin(active?.domain)
    if (v) setVertical(v)
  }, [active?.domain]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ReadinessProvider domain={domain}>
      <FrontlineProvider domain={domain} twin={twin}>
        {children}
      </FrontlineProvider>
    </ReadinessProvider>
  )
}

// resolve the persona's visible nav: persona.nav ∩ entitlements ∩ policy
function visibleNavFor(persona, ent, allows) {
  return persona.nav
    .map(id => NAV.find(n => n.id === id))
    .filter(Boolean)
    .filter(it => {
      if (HUB_IDS.includes(it.id)) return true
      if (PLATFORM_MODULES.includes(it.module)) {
        if (!ent.has(it.module)) return false
        if (it.module === 'hivemind') return true // no per-persona policy for the hive
        return allows(persona.id, it.module)
      }
      return true // persona workspace surfaces
    })
}

function VerticalSwitcher() {
  const { vertical, setVertical } = useVertical()
  return (
    <div className="vertical-switcher">
      {VERTICALS.map(v => (
        <button key={v.id}
          className={`v-pill ${vertical === v.id ? 'active' : ''}`}
          style={vertical === v.id ? { background: v.color } : undefined}
          onClick={() => setVertical(v.id)}
          title={v.label}>
          <span className="status-dot" style={{ width: 7, height: 7, background: v.color, boxShadow: 'none', flexShrink: 0 }} />
          <span className="v-pill-label">{v.label}</span>
        </button>
      ))}
    </div>
  )
}

function Shell() {
  const ent = useEntitlements()
  const { user, logout } = useAuth()
  const rbac = useRbac()
  const { persona, allows } = usePersona()   // preview mode removed from the shell
  const { active, openTwin, openExisting } = useTwin()
  const frontline = useFrontline()
  const [route, setRoute] = useState(() => persona.defaultRoute)
  const [routeParams, setRouteParams] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [aiDrawer, setAiDrawer] = useState(false)
  const [takeover, setTakeover] = useState(false)
  const [acctOpen, setAcctOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [, force] = useState(0)

  // The sidebar comes from the SERVER (menus + sidebar_permissions), not from
  // registry.jsx. Nothing here decides what a role may see.
  const navTree = rbac.navigation
  const navIds = rbac.routes
  const hasAgentic = rbac.can('company.agents.use')

  // Once the server's navigation arrives, land on the first route it grants —
  // unless the URL names one (?screen=users), which makes dashboard screens
  // linkable and survives a refresh. A screen the viewer may not open is
  // ignored, so a shared link can never bypass a permission.
  useEffect(() => {
    if (rbac.loading || !navIds.length) return
    const internal = ['flow', 'chat', 'predict']   // reachable, but not sidebar entries
    const wanted = new URLSearchParams(window.location.search).get('screen')
    if (wanted && navIds.includes(wanted)) { setRoute(wanted); return }
    if (!navIds.includes(route) && !internal.includes(route)) setRoute(navIds[0])
  }, [rbac.loading, navIds.join('|')]) // eslint-disable-line

  // Keep the URL in step so refresh and back land where the user was.
  useEffect(() => {
    if (rbac.loading || !route) return
    const url = new URL(window.location.href)
    if (url.searchParams.get('screen') === route) return
    url.searchParams.set('screen', route)
    window.history.replaceState({}, '', url)
  }, [route, rbac.loading])

  useEffect(() => { setAiDrawer(false); setTakeover(false) }, [persona.id])

  useEffect(() => {
    const handler = (e) => { if (e.detail?.route) go(e.detail.route) }
    window.addEventListener('copilot:nav', handler)
    return () => window.removeEventListener('copilot:nav', handler)
  }, []) // eslint-disable-line

  const toggleTheme = () => {
    const t = document.documentElement.getAttribute('data-theme') === 'dark' ? '' : 'dark'
    document.documentElement.setAttribute('data-theme', t); localStorage.setItem('theme', t); force(x => x + 1)
  }
  const go = (r, params) => { setRoute(r); setRouteParams(params || null); setSidebarOpen(false) }
  const isDark = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark'

  // Group the server's menu tree by its own `section` label, preserving the
  // order the database gave us. No client-side knowledge of what belongs where.
  const sections = useMemo(() => {
    const out = []
    for (const item of navTree) {
      const label = item.section || 'Workspace'
      let sec = out.find(s => s.label === label)
      if (!sec) { sec = { label, items: [] }; out.push(sec) }
      sec.items.push(item)
    }
    return out
  }, [navTree])

  const { vertical } = useVertical()

  // sync data-vertical on the root for CSS hooks
  useEffect(() => { document.documentElement.setAttribute('data-vertical', vertical) }, [vertical])

  return (
    <div className="app-root" data-vertical={vertical} style={{ '--pa': persona.accent, '--pa-soft': persona.accentSoft }}>
      <div className="topbar">
        <button className="btn btn-ghost mobile-menu" onClick={() => setSidebarOpen(!sidebarOpen)}><Icon n="ti-menu-2" /></button>
        {/* The lockup already says "Goalcert Hub" — nothing to stack beside it. */}
        <span className="brand"><Logo size={30} /></span>
        {/* Context only: the open twin, or which tenant you are inside. The
            platform owner belongs to no tenant, so their crumb stays empty
            rather than restating what the sidebar already says. */}
        <div className="crumb">{active
          ? <><b>{active.name}</b> · live twin</>
          : (user.orgName || null)}</div>

        {hasAgentic && (
          <button className="topbar-ai" onClick={() => setAiDrawer(true)} title="Agentic AI actions">
            <span className="topbar-ai-dot" /><Icon n="ti-robot" /> AI
          </button>
        )}
        {active && <TopHealthStat />}
        <div className="topstat"><span className="status-dot live" /> LIVE</div>
        {/* Single sign-on into the satellite LMS apps — platform owner only.
            Everyone else who may open one reaches it from the Microservices
            card for that service, so the topbar stays the platform operator's
            tool rather than a permanent fixture in a tenant's chrome. This is
            placement, not permission: /api/sso/apps is still the authority on
            who may open what, and it gates the Microservices route too. */}
        {user.role === 'super_admin' && <SsoLauncher />}
        <button className="btn btn-ghost" style={{ padding: '5px 8px', fontSize: 14 }} title="Toggle theme" onClick={toggleTheme}>
          <Icon n={isDark ? 'ti-sun' : 'ti-moon'} />
        </button>
        <div className="acct-wrap">
          <button className="acct" onClick={() => setAcctOpen(o => !o)}>
            <span className="av">{(user.fullName || user.email)[0].toUpperCase()}</span>
            <span className="acct-name">{user.fullName || user.email.split('@')[0]}</span>
            <Icon n="ti-chevron-down" />
          </button>
          {acctOpen && (
            <>
              <div className="acct-overlay" onClick={() => setAcctOpen(false)} />
              <div className="acct-menu">
                <div className="acct-menu-head">
                  <div className="acct-menu-name">{user.fullName || '—'}</div>
                  <div className="acct-menu-email">{user.email}</div>
                  <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span className="pill pill-purple" style={{ fontSize: 9 }}>{ROLE_LABEL[user.role] || user.role}</span>
                    {user.orgName && <span className="pill pill-surface" style={{ fontSize: 9 }}>{user.orgName}</span>}
                  </div>
                </div>
                <button className="acct-menu-item" onClick={() => { setAcctOpen(false); setProfileOpen(true) }}>
                  <Icon n="ti-user-circle" /> Profile & password
                </button>
                <button className="acct-menu-item" onClick={() => { setAcctOpen(false); logout(); navigate('/') }}>
                  <Icon n="ti-logout" /> Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="body">
        {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
        <div className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
          <div className="sb-persona" title={`${persona.label} — ${persona.entry}`}
            style={{ '--mc': persona.accent, '--mc-soft': persona.accentSoft }}>
            <span className="sb-persona-ic"><Icon n={persona.icon} /></span>
            <span className="sb-persona-body">
              <span className="sb-persona-label">{persona.label}</span>
              <span className="sb-persona-entry">{persona.entry}</span>
            </span>
          </div>
          <div className="sb-stages" title={`Loop stages this persona runs`}>
            {LOOP_STAGES.map(s => (
              <span key={s.id} className={`sb-stage ${persona.stages.includes(s.id) ? 'on' : ''}`}
                style={{ '--mc': persona.accent }} />
            ))}
            <span className="sb-stages-label">{persona.stages.length ? `${persona.stages.length}/7 loop stages` : 'runs the rails'}</span>
          </div>

          <div className="sidebar-nav">
            {rbac.loading && <div className="sidebar-section">Loading menu…</div>}
            {!rbac.loading && !sections.length && (
              <div className="sidebar-section">No menus assigned</div>
            )}
            {sections.map((sec, si) => (
              <div key={si}>
                <div className="sidebar-section">{sec.label}</div>
                {sec.items.map(it => (
                  <NavEntry key={it.id} item={it} route={route} go={go}
                    frontline={frontline} />
                ))}
              </div>
            ))}
          </div>
          <div className="sidebar-foot">
            {hasAgentic && (
              <div className="sidebar-help" style={{ background: 'linear-gradient(135deg,#7A5CF0,#5b21b6)' }} onClick={() => setAiDrawer(true)}>
                <Icon n="ti-robot" /> AI layer active</div>
            )}
            <div className="sidebar-ver">{persona.short} view · {ent.enabled.length || 0} module(s)</div>
          </div>
        </div>

        <div className="content">
          {/* Only renders when a sign-in auto-launch was blocked. */}
          <SsoAutoNotice />
          {/* The role's landing page: widgets resolved from dashboard_permissions. */}
          {route === 'overview' && <DynamicDashboard />}
          {route === 'superadmin' && <SuperAdminConsole />}
          {/* Catalogue, commerce and the tenant storefront. */}
          {route === 'modules' && <Microservices />}
          {route === 'payments' && <Payments />}
          {route === 'plans' && <Plans />}
          {route === 'companies' && <Companies />}
          {route === 'roles' && <Roles />}
          {route === 'permissions' && <Permissions />}
          {route === 'menus' && <SidebarBuilder />}
          {route === 'smtp' && <SmtpSettings />}
          {route === 'storage' && <StorageSettings />}
          {route === 'enquiries' && <Enquiries />}
          {route === 'marketplace' && <Marketplace onNav={go} />}
          {/* Menu rows the database defines but no screen implements yet. */}
          {UNBUILT_ROUTES.includes(route) && <NotBuilt route={route} />}
          {route === 'twins' && <TwinsLibrary active={active?.domain} canBuild={ent.has('twin')}
            onOpen={(d, n) => { openTwin(d, n); go('dashboard') }}
            onOpenExisting={(t) => { openExisting(t.tenant_id, t.domain, t.name); go('dashboard') }}
            onBuild={() => go('build')} />}
          {route === 'dashboard' && (active
            ? (active.tenant && isMachineDomain(serviceDomain(active.domain))
                ? <MachineDashboard tenant={active.tenant} domain={serviceDomain(active.domain)} name={active.name} onNav={go} />
                : <LiveDashboard onRepair={() => setTakeover(true)} onNav={go} />)
            : <NeedAsset onNav={go} />)}
          {route === 'build' && <BuildTwin onOpened={() => go('dashboard')} />}
          {route === 'predict' && (active ? <Prediction /> : <NeedAsset onNav={go} />)}

          {/* Scenario & Faults — SimulationWorkspace owns all tabs including twin faults.
              Not gated on active twin — cascade engine has no twin dependency. */}
          {route === 'scenario' && <SimulationWorkspace />}

          {/* Train with AI — guided repair drill, needs active twin */}
          {route === 'train' && (active
            ? <div className="panel">
                <div className="panel-header"><div>
                  <div className="panel-title">Train with AI</div>
                  <div className="panel-subtitle">
                    {active.name} · interactive guided-repair drill
                  </div>
                </div></div>
                <Trainer />
              </div>
            : <NeedAsset onNav={go} />)}
          {route === 'assigned' && <AssignedToMe onStart={() => { frontline.startFlow(); go('flow') }} onNav={go} />}
          {route === 'flow' && <FrontlineFlow onComplete={() => go('assigned')} />}
          {route === 'supervisor' && <SupervisorDashboard />}
          {route === 'compliance' && <ComplianceAudit />}
          {route === 'casestudy' && <CaseStudy />}
          {route === 'studio' && <ContentStudio />}
          {route === 'ops' && <OpsReadiness onNav={go} />}
          {route === 'admin' && <AdminConsole onNav={go} />}
          {/* Same route id, two audiences: the platform owner manages users
              across every tenant; a company admin manages only their own. */}
          {route === 'users' && (rbac.isPlatform ? <PlatformUsers /> : <UserManagement />)}
          {route === 'loop' && <LoopBoard />}
          {route === 'audit' && <Audit />}
          {route === 'hivemind' && (
            <div className="panel">
              <HiveMind />
            </div>
          )}
          {route === 'builder' && <AgentBuilder onNav={go} vertical={vertical} />}
          {route === 'teamchat' && <TeamChat onNav={go} />}
          {route === 'chat' && (routeParams?.agent
            ? <AgentChat agent={routeParams.agent} onBack={() => go('builder')} />
            : <AgentBuilder onNav={go} vertical={vertical} />)}
        </div>
      </div>

      {hasAgentic && <>
        <CoPilotDock />
        <AIDrawer open={aiDrawer} onClose={() => setAiDrawer(false)}
          onPickTwin={() => go('overview')} onRepair={() => setTakeover(true)} />
        <RepairTakeover open={takeover} onClose={() => setTakeover(false)} />
      </>}

      {profileOpen && <Profile onClose={() => setProfileOpen(false)} />}
    </div>
  )
}

const ROLE_LABEL = {
  super_admin: 'Platform Owner', admin: 'Admin / IT', coo: 'Plant Manager / COO',
  compliance: 'Compliance Officer', lnd: 'L&D / Trainer', supervisor: 'Line Supervisor', frontline: 'Frontline Operator',
}

// One sidebar entry from the server. A parent with children renders as an
// expandable group; a leaf navigates. Depth is whatever the database says.
function NavEntry({ item, route, go, frontline }) {
  const kids = item.children || []
  const childActive = kids.some(c => c.route === route)
  const [open, setOpen] = useState(childActive)
  useEffect(() => { if (childActive) setOpen(true) }, [childActive])

  if (!kids.length) {
    return (
      <a className={`nav-item ${route === item.route ? 'active' : ''}`}
        onClick={() => item.route && go(item.route)}>
        <Icon n={item.icon} />{item.label}
        {item.route === 'dashboard' && <DashboardFindingsBadge />}
        {item.route === 'assigned' && frontline?.status === 'pending' &&
          <span className="nav-badge badge-blue">1</span>}
      </a>
    )
  }

  return (
    <>
      <a className={`nav-item nav-parent ${childActive ? 'has-active' : ''}`}
        onClick={() => setOpen(o => !o)}>
        <Icon n={item.icon} />{item.label}
        <Icon n={open ? 'ti-chevron-down' : 'ti-chevron-right'} />
      </a>
      {open && kids.map(c => (
        <a key={c.id} className={`nav-item nav-child ${route === c.route ? 'active' : ''}`}
          onClick={() => c.route && go(c.route)}>
          <Icon n={c.icon} />{c.label}
        </a>
      ))}
    </>
  )
}

// A menu row whose screen hasn't been built yet. The sidebar is data, so it can
// legitimately point at a route with no component — say so instead of blanking.
function NotBuilt({ route }) {
  return (
    <div className="panel">
      <div className="panel-header"><div>
        <div className="panel-title">Not built yet</div>
        <div className="panel-subtitle">
          This menu entry (<code>{route}</code>) is defined in the database but has no
          screen behind it yet. Remove or hide it in the Sidebar Builder, or build the page.
        </div>
      </div></div>
    </div>
  )
}

// The sidebar's live findings badge. Subscribes to the live frame on its own so
// the whole Shell doesn't re-render every telemetry tick.
function DashboardFindingsBadge() {
  const twin = useTwinFrame()
  const n = (twin?.findings || []).length
  return n > 0 ? <span className="nav-badge badge-red">{n}</span> : null
}

// The topbar live-health chip. Same reason it's its own component: it reads the
// per-frame twin health, so isolating it keeps that update out of Shell (which
// would otherwise re-render the whole app every tick — the jitter).
function TopHealthStat() {
  const twin = useTwinFrame()
  const h = twin?.health
  return (
    <div className="topstat">
      <span className={`status-dot ${h == null ? '' : h > 0.7 ? 'green' : h > 0.4 ? 'amber' : 'red'}`} />
      Health <b>{pct(h)}</b>
    </div>
  )
}

function NeedAsset({ onNav }) {
  const { openTwin } = useTwin()
  return (
    <div className="panel">
      <div className="panel-header"><div>
        <div className="panel-title">Pick an asset</div>
        <div className="panel-subtitle">This surface needs an active twin. Open one on the built-in simulator.</div>
      </div></div>
      <AssetPicker onOpen={(d, n) => openTwin(d, n)} compact />
    </div>
  )
}
