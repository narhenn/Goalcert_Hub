// App.jsx — the Integration Hub shell, auth-gated and role-driven.
//
// Flow: sign in → the role your admin assigned resolves to a persona → the shell
// renders exactly that persona's platform view (nav grouped by Twin/Scenario/Hive,
// gated by org entitlements + policy). No persona is chosen in the browser.
// super_admin/admin may "preview as" another persona to see its dashboard.
import React, { useEffect, useState } from 'react'
import { Logo, Icon, pct } from './lib.jsx'
import { VerticalProvider, useVertical, VERTICALS, verticalForTwin } from './hub/verticalState.jsx'
import { AuthProvider, useAuth } from './hub/auth.jsx'
import { EntitlementProvider, useEntitlements, NAV, MODULES } from './hub/registry.jsx'
import { PersonaProvider, usePersona, LOOP_STAGES } from './hub/personas.jsx'
import { LoopProvider } from './hub/loopState.jsx'
import { TwinProvider, useTwin } from './hub/twinState.jsx'
import { AuditProvider } from './hub/audit.jsx'
import Login from './hub/Login.jsx'
import ChangePassword from './hub/ChangePassword.jsx'
import PersonaSwitcher from './hub/PersonaSwitcher.jsx'
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

  if (loading) return <BootSplash />
  if (!isAuthed) return <Login />
  if (user.mustChangePassword) return <ChangePassword />

  return (
    <VerticalProvider>
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
  const { persona, isPreview, exitPreview, allows } = usePersona()
  const { active, twin, openTwin, openExisting } = useTwin()
  const frontline = useFrontline()
  const [route, setRoute] = useState(() => persona.defaultRoute)
  const [routeParams, setRouteParams] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [aiDrawer, setAiDrawer] = useState(false)
  const [takeover, setTakeover] = useState(false)
  const [acctOpen, setAcctOpen] = useState(false)
  const [, force] = useState(0)

  const nav = visibleNavFor(persona, ent, allows)
  const navIds = nav.map(n => n.id)
  const hasAgentic = ent.has('agentic') && allows(persona.id, 'agentic')

  // persona (or preview) changed → land on its home surface
  useEffect(() => {
    setRoute(navIds.includes(persona.defaultRoute) ? persona.defaultRoute : (navIds[0] || 'loop'))
    setAiDrawer(false); setTakeover(false)
  }, [persona.id]) // eslint-disable-line

  useEffect(() => {
    if (!navIds.includes(route) && route !== 'flow' && route !== 'overview' && route !== 'chat')
      setRoute(navIds.includes(persona.defaultRoute) ? persona.defaultRoute : (navIds[0] || 'loop'))
  }, [ent.enabled, nav.length]) // eslint-disable-line

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

  const sections = [
    { label: `${persona.short} workspace`, items: nav.filter(it => !HUB_IDS.includes(it.id) && !PLATFORM_MODULES.includes(it.module)), mc: persona.accent },
    { label: MODULES.twin.label, items: nav.filter(it => it.module === 'twin' && !it.hidden), mc: MODULES.twin.accent },
    { label: MODULES.scenario.label, items: nav.filter(it => it.module === 'scenario'), mc: MODULES.scenario.accent },
    { label: MODULES.hivemind.label, items: nav.filter(it => it.module === 'hivemind'), mc: MODULES.hivemind.accent },
    { label: 'Builder', items: nav.filter(it => it.module === 'agentbuilder'), mc: MODULES.agentbuilder.accent },
    { label: 'Hub', items: nav.filter(it => HUB_IDS.includes(it.id)) },
  ].filter(s => s.items.length)

  const { vertical } = useVertical()

  // sync data-vertical on the root for CSS hooks
  useEffect(() => { document.documentElement.setAttribute('data-vertical', vertical) }, [vertical])

  return (
    <div className="app-root" data-vertical={vertical} style={{ '--pa': persona.accent, '--pa-soft': persona.accentSoft }}>
      <div className="topbar">
        <button className="btn btn-ghost mobile-menu" onClick={() => setSidebarOpen(!sidebarOpen)}><Icon n="ti-menu-2" /></button>
        <span className="brand"><Logo size={32} />
          <span className="brand-word">
            <span className="brand-name">Goalcert</span>
            <span className="brand-tag">Integration Hub</span>
          </span>
        </span>
        <PersonaSwitcher />
        <div className="crumb">{active
          ? <><b>{active.name}</b> · live twin</>
          : <>{user.orgName || 'Platform'} · {persona.done}</>}</div>

        {isPreview && (
          <button className="preview-banner" onClick={exitPreview} title="Return to your own view">
            <Icon n="ti-eye" /> Previewing as {persona.short} <Icon n="ti-x" />
          </button>
        )}

        {hasAgentic && (
          <button className="topbar-ai" onClick={() => setAiDrawer(true)} title="Agentic AI actions">
            <span className="topbar-ai-dot" /><Icon n="ti-robot" /> AI
          </button>
        )}
        {active && <div className="topstat">
          <span className={`status-dot ${twin?.health == null ? '' : twin.health > 0.7 ? 'green' : twin.health > 0.4 ? 'amber' : 'red'}`} />
          Health <b>{pct(twin?.health)}</b></div>}
        <div className="topstat"><span className="status-dot live" /> LIVE</div>
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
                <button className="acct-menu-item" onClick={() => { setAcctOpen(false); logout() }}>
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
              <span className="sb-persona-entry">{isPreview ? 'preview' : persona.entry}</span>
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
            {sections.map((sec, si) => (
              <div key={si}>
                <div className="sidebar-section" style={sec.mc ? { color: sec.mc } : undefined}>{sec.label}</div>
                {sec.items.map(it => (
                  <a key={it.id} className={`nav-item ${route === it.id ? 'active' : ''}`} onClick={() => go(it.id)}>
                    <Icon n={it.icon} />{it.label}
                    {it.id === 'dashboard' && (twin?.findings || []).length > 0 && <span className="nav-badge badge-red">{twin.findings.length}</span>}
                    {it.id === 'assigned' && frontline.status === 'pending' && <span className="nav-badge badge-blue">1</span>}
                  </a>
                ))}
              </div>
            ))}
          </div>
          <div className="sidebar-foot">
            {hasAgentic && (
              <div className="sidebar-help" style={{ background: 'linear-gradient(135deg,#7A5CF0,#5b21b6)' }} onClick={() => setAiDrawer(true)}>
                <Icon n="ti-robot" /> AI layer active</div>
            )}
            <div className="sidebar-ver">Goalcert · {persona.short} view · {ent.enabled.length || 0} module(s)</div>
          </div>
        </div>

        <div className="content">
          {route === 'overview' && <Overview user={{ name: user.fullName || user.email.split('@')[0], email: user.email, tenant: user.orgName }} onNav={go} onOpenAI={() => setAiDrawer(true)} />}
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
          {route === 'users' && <UserManagement />}
          {route === 'superadmin' && <SuperAdminConsole />}
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
    </div>
  )
}

const ROLE_LABEL = {
  super_admin: 'Platform Owner', admin: 'Admin / IT', coo: 'Plant Manager / COO',
  compliance: 'Compliance Officer', lnd: 'L&D / Trainer', supervisor: 'Line Supervisor', frontline: 'Frontline Operator',
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
