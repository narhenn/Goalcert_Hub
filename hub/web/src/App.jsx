// App.jsx — the Integration Hub shell, now persona-composed.
//
// Two axes compose the UI: entitlements (which platforms the tenant adopted)
// × persona (which lens the user works through). Onboarding picks the modules,
// the persona picker picks the lens, and the shell renders exactly that
// intersection — nav grouped by platform, a persona-owned home view, and the
// agentic layer only where the persona's policy allows it.
import React, { useEffect, useState } from 'react'
import { Logo, Icon, pct } from './lib.jsx'
import { EntitlementProvider, useEntitlements, NAV, MODULES } from './hub/registry.jsx'
import { PersonaProvider, usePersona, LOOP_STAGES } from './hub/personas.jsx'
import { LoopProvider } from './hub/loopState.jsx'
import { TwinProvider, useTwin } from './hub/twinState.jsx'
import { AuditProvider } from './hub/audit.jsx'
import { nameFromEmail } from './hub/util.js'
import Onboarding from './hub/Onboarding.jsx'
import PersonaPicker from './hub/PersonaPicker.jsx'
import PersonaSwitcher from './hub/PersonaSwitcher.jsx'
import Switcher from './hub/Switcher.jsx'
import LoopBoard from './hub/LoopBoard.jsx'
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
import ContentStudio from './modules/lnd/ContentStudio.jsx'
import OpsReadiness from './modules/coo/OpsReadiness.jsx'
import AdminConsole from './modules/admin/AdminConsole.jsx'
import HiveMind from './modules/hivemind/HiveMind.jsx'
import './modules/hivemind/hivemind.css'
import { KpiProvider } from './hub/kpiState.jsx'
import { ReadinessProvider } from './hub/readinessState.jsx'
import { FrontlineProvider, useFrontline } from './hub/frontlineState.jsx'

// Mocked authenticated tenant (a real hub resolves this from SSO at the edge).
const USER = { email: 'tejeshachutaa19@gmail.com', tenant: 'Acme Industrial' }
USER.name = nameFromEmail(USER.email)

// platform-owned nav modules (gated by entitlement + persona policy);
// everything else is persona workspace or hub chrome.
const PLATFORM_MODULES = ['twin', 'scenario', 'hivemind']
const HUB_IDS = ['loop', 'audit']

export default function App() {
  return (
    <EntitlementProvider>
      <PersonaProvider>
        <AuditProvider>
          <LoopProvider>
            <KpiProvider>
              <TwinProvider>
                <FrontlineWrapper>
                  <Root />
                </FrontlineWrapper>
              </TwinProvider>
            </KpiProvider>
          </LoopProvider>
        </AuditProvider>
      </PersonaProvider>
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
  const { persona } = usePersona()
  useEffect(() => { const t = localStorage.getItem('theme'); if (t) document.documentElement.setAttribute('data-theme', t) }, [])
  if (!onboarded) return <Onboarding />
  if (!persona) return <PersonaPicker />
  return <Shell />
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

function Shell() {
  const ent = useEntitlements()
  const { persona, allows, clearPersona } = usePersona()
  const { active, twin, openTwin } = useTwin()
  const frontline = useFrontline()
  const [route, setRoute] = useState(() => persona.defaultRoute)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [aiDrawer, setAiDrawer] = useState(false)
  const [takeover, setTakeover] = useState(false)
  const [, force] = useState(0)

  const nav = visibleNavFor(persona, ent, allows)
  const navIds = nav.map(n => n.id)
  const hasAgentic = ent.has('agentic') && allows(persona.id, 'agentic')

  // persona switched → land on its home surface
  useEffect(() => {
    setRoute(navIds.includes(persona.defaultRoute) ? persona.defaultRoute : (navIds[0] || 'loop'))
    setAiDrawer(false); setTakeover(false)
  }, [persona.id]) // eslint-disable-line

  // if the current route's surface was just gated away, fall back home
  // ('flow' and 'overview' are reachable without a nav entry)
  useEffect(() => {
    if (!navIds.includes(route) && route !== 'flow' && route !== 'overview')
      setRoute(navIds.includes(persona.defaultRoute) ? persona.defaultRoute : (navIds[0] || 'loop'))
  }, [ent.enabled, nav.length]) // eslint-disable-line

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

  // sidebar: persona workspace first, then the persona's platform surfaces, then hub
  const sections = [
    { label: `${persona.short} workspace`, items: nav.filter(it => !HUB_IDS.includes(it.id) && !PLATFORM_MODULES.includes(it.module)), mc: persona.accent },
    { label: MODULES.twin.label, items: nav.filter(it => it.module === 'twin'), mc: MODULES.twin.accent },
    { label: MODULES.scenario.label, items: nav.filter(it => it.module === 'scenario'), mc: MODULES.scenario.accent },
    { label: MODULES.hivemind.label, items: nav.filter(it => it.module === 'hivemind'), mc: MODULES.hivemind.accent },
    { label: 'Hub', items: nav.filter(it => HUB_IDS.includes(it.id)) },
  ].filter(s => s.items.length)

  return (
    <div className="app-root" style={{ '--pa': persona.accent, '--pa-soft': persona.accentSoft }}>
      <div className="topbar">
        <button className="btn btn-ghost mobile-menu" onClick={() => setSidebarOpen(!sidebarOpen)}><Icon n="ti-menu-2" /></button>
        <span className="brand"><Logo size={32} />
          <span className="brand-word">
            <span className="brand-name">Goalcert</span>
            <span className="brand-tag">Integration Hub</span>
          </span>
        </span>
        <PersonaSwitcher />
        {persona.id === 'admin' && <Switcher />}
        <div className="crumb">{active
          ? <><b>{active.name}</b> · live twin</>
          : <>{persona.done}</>}</div>

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
          {/* persona identity — who this UI is composed for */}
          <div className="sb-persona" title={`${persona.label} — ${persona.entry}`}
            style={{ '--mc': persona.accent, '--mc-soft': persona.accentSoft }}>
            <span className="sb-persona-ic"><Icon n={persona.icon} /></span>
            <span className="sb-persona-body">
              <span className="sb-persona-label">{persona.label}</span>
              <span className="sb-persona-entry">{persona.entry}</span>
            </span>
            <button className="sb-persona-switch" onClick={clearPersona} title="Change persona">
              <Icon n="ti-switch-horizontal" />
            </button>
          </div>
          {/* the persona's segment of the loop */}
          <div className="sb-stages" title={`Loop stages this persona runs: ${persona.stages.join(' → ') || 'operates the rails'}`}>
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
          {route === 'studio' && <ContentStudio />}
          {route === 'ops' && <OpsReadiness onNav={go} />}
          {route === 'admin' && <AdminConsole />}
          {route === 'loop' && <LoopBoard />}
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
