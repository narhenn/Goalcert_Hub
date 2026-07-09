// App.jsx — the Integration Hub shell. Authenticates a tenant (mocked), reads its
// entitlements, and composes exactly that UI: the sidebar, the panels and the AI
// layer are all gated by which modules are enabled. Flip a module in the switcher
// and the whole product recomposes.
import React, { useEffect, useState } from 'react'
import { Logo, Icon, pct } from './lib.jsx'
import { EntitlementProvider, useEntitlements, navFor, MODULES, planName } from './hub/registry.jsx'
import { TwinProvider, useTwin } from './hub/twinState.jsx'
import { AuditProvider } from './hub/audit.jsx'
import { nameFromEmail } from './hub/util.js'
import Onboarding from './hub/Onboarding.jsx'
import Switcher from './hub/Switcher.jsx'
import { CoPilotDock, AIDrawer, RepairTakeover } from './hub/AILayer.jsx'
import Overview from './modules/core/Overview.jsx'
import Audit from './modules/core/Audit.jsx'
import AssetPicker from './modules/AssetPicker.jsx'
import TwinsLibrary from './modules/twin/TwinsLibrary.jsx'
import LiveDashboard from './modules/twin/LiveDashboard.jsx'
import BuildTwin from './modules/twin/BuildTwin.jsx'
import Prediction from './modules/twin/Prediction.jsx'
import Scenario from './modules/scenario/Scenario.jsx'
import Trainer from './modules/scenario/Trainer.jsx'
import AssignedToMe from './modules/frontline/AssignedToMe.jsx'
import FrontlineFlow from './modules/frontline/FrontlineFlow.jsx'
import SupervisorDashboard from './modules/supervisor/SupervisorDashboard.jsx'
import ComplianceAudit from './modules/core/ComplianceAudit.jsx'
import CaseStudy from './modules/core/CaseStudy.jsx'
import HiveMind from './modules/hivemind/HiveMind.jsx'
import './modules/hivemind/hivemind.css'
import { KpiProvider } from './hub/kpiState.jsx'
import { ReadinessProvider } from './hub/readinessState.jsx'
import { FrontlineProvider, useFrontline } from './hub/frontlineState.jsx'

// Mocked authenticated tenant (a real hub resolves this from SSO at the edge).
const USER = { email: 'tejeshachutaa19@gmail.com', tenant: 'Acme Industrial' }
USER.name = nameFromEmail(USER.email)

export default function App() {
  return (
    <EntitlementProvider>
      <AuditProvider>
        <KpiProvider>
        <TwinProvider>
          <FrontlineWrapper>
            <Root />
          </FrontlineWrapper>
        </TwinProvider>
        </KpiProvider>
      </AuditProvider>
    </EntitlementProvider>
  )
}

// Wrap children with Readiness + Frontline providers (need twin context)
function FrontlineWrapper({ children }) {
  const { active } = useTwin()
  const domain = active?.domain || 'edm-machine'
  const twin = active?.twin
  return (
    <ReadinessProvider domain={domain}>
      <FrontlineProvider domain={domain} twin={twin}>
        {children}
      </FrontlineProvider>
    </ReadinessProvider>
  )
}

function Root() {
  const { onboarded } = useEntitlements()
  useEffect(() => { const t = localStorage.getItem('theme'); if (t) document.documentElement.setAttribute('data-theme', t) }, [])
  return onboarded ? <Shell /> : <Onboarding />
}

function Shell() {
  const ent = useEntitlements()
  const { active, twin, openTwin } = useTwin()
  const frontline = useFrontline()
  // default to 'assigned' if frontline module is enabled
  const [route, setRoute] = useState(ent.has('frontline') ? 'assigned' : 'overview')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [aiDrawer, setAiDrawer] = useState(false)
  const [takeover, setTakeover] = useState(false)
  const [, force] = useState(0)

  const nav = navFor(ent.enabled)
  const hasAgentic = ent.has('agentic')

  // if the current route's module was just disabled, fall back to Overview
  useEffect(() => { if (!nav.find(n => n.id === route)) setRoute('overview') }, [ent.enabled]) // eslint-disable-line

  // listen for copilot slash-command navigation events
  useEffect(() => {
    const handler = (e) => { if (e.detail?.route) go(e.detail.route) }
    window.addEventListener('copilot:nav', handler)
    return () => window.removeEventListener('copilot:nav', handler)
  }, []) // eslint-disable-line

  const toggleTheme = () => {
    const t = document.documentElement.getAttribute('data-theme') === 'dark' ? '' : 'dark'
    document.documentElement.setAttribute('data-theme', t); localStorage.setItem('theme', t); force(x => x + 1)
  }
  const go = (r) => { setRoute(r); setSidebarOpen(false) }
  const isDark = typeof document !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark'

  // sidebar sections, gated by entitlement
  const sections = [
    { label: 'Platform', items: nav.filter(n => n.id === 'overview') },
    { label: MODULES.twin.label, items: nav.filter(n => n.module === 'twin'), mc: MODULES.twin.accent },
    { label: MODULES.scenario.label, items: nav.filter(n => n.module === 'scenario'), mc: MODULES.scenario.accent },
    { label: 'Hub', items: nav.filter(n => n.id === 'audit') },
  ].filter(s => s.items.length)

  return (
    <div className="app-root">
      <div className="topbar">
        <button className="btn btn-ghost mobile-menu" onClick={() => setSidebarOpen(!sidebarOpen)}><Icon n="ti-menu-2" /></button>
        <span className="brand"><Logo size={32} />
          <span className="brand-word">
            <span className="brand-name">Goalcert</span>
            <span className="brand-tag">Integration Hub</span>
          </span>
        </span>
        <Switcher />
        <div className="crumb">{active
          ? <><b>{active.name}</b> · live twin</>
          : <>Composed platform · {planName(ent.enabled)}</>}</div>

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
        <div className="acct"><span className="av">{USER.name[0]}</span>{USER.name}</div>
      </div>

      <div className="body">
        {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}
        <div className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
          <div className="sidebar-nav">
            {sections.map((sec, si) => (
              <div key={si}>
                <div className="sidebar-section" style={sec.mc ? { color: sec.mc } : undefined}>{sec.label}</div>
                {sec.items.map(it => (
                  <a key={it.id} className={`nav-item ${route === it.id ? 'active' : ''}`} onClick={() => go(it.id)}>
                    <Icon n={it.icon} />{it.label}
                    {it.id === 'dashboard' && (twin?.findings || []).length > 0 && <span className="nav-badge badge-red">{twin.findings.length}</span>}
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
            <div className="sidebar-ver">Goalcert · Integration Hub · composes {ent.enabled.length || 0} module(s)</div>
          </div>
        </div>

        <div className="content">
          {route === 'overview' && <Overview user={USER} onNav={go} onOpenAI={() => setAiDrawer(true)} />}
          {route === 'twins' && <TwinsLibrary active={active?.domain} canBuild={ent.has('twin')}
            onOpen={(d, n) => { openTwin(d, n); go('dashboard') }} onBuild={() => go('build')} />}
          {route === 'dashboard' && (active ? <LiveDashboard onRepair={() => setTakeover(true)} /> : <NeedAsset onNav={go} />)}
          {route === 'build' && <BuildTwin onOpened={() => go('dashboard')} />}
          {route === 'predict' && (active ? <Prediction /> : <NeedAsset onNav={go} />)}
          {route === 'scenario' && (active ? <Scenario /> : <NeedAsset onNav={go} />)}
          {route === 'train' && (active
            ? <div className="panel"><div className="panel-header"><div>
                <div className="panel-title">Train with AI</div>
                <div className="panel-subtitle">{active.name} · interactive guided-repair simulator with scoring</div>
              </div></div><Trainer /></div>
            : <NeedAsset onNav={go} />)}
          {route === 'assigned' && <AssignedToMe onStart={() => { frontline.startFlow(); go('flow') }} onNav={go} />}
          {route === 'flow' && <FrontlineFlow onComplete={() => go('assigned')} />}
          {route === 'supervisor' && <SupervisorDashboard />}
          {route === 'compliance' && <ComplianceAudit />}
          {route === 'casestudy' && <CaseStudy />}
          {route === 'audit' && <Audit />}
          {route === 'hivemind' && (
            <div className="panel">
              <HiveMind />
            </div>
          )}
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
