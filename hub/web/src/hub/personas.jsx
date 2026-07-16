// personas.jsx — the persona backbone (from Prem's User Flow doc).
//
// Six personas run six segments of the same seven-stage loop:
//   Assess → Train → Simulate → Deploy → Assist → Observe → Improve
// A persona defines *which lens* a user gets on the composed platform:
// their entry surface, their nav (grouped by platform), the loop stages
// they own, and their definition of "done". Entitlements still gate which
// platforms exist underneath — persona ∩ entitlement = the rendered UI.
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from './auth.jsx'

// ── The seven-stage loop (print this above every design review) ───────
export const LOOP_STAGES = [
  { id: 'assess',   label: 'Assess',   icon: 'ti-target',           desc: 'Role, gap, risk',    data: 'Shift roster · asset assignments · readiness score' },
  { id: 'train',    label: 'Train',    icon: 'ti-book',             desc: 'Micro-content, LMS', data: 'Smallest content unit tied to today’s fault modes' },
  { id: 'simulate', label: 'Simulate', icon: 'ti-device-gamepad-2', desc: 'XR + fault library', data: 'Scenario built from the twin snapshot · performance capture' },
  { id: 'deploy',   label: 'Deploy',   icon: 'ti-shield-check',     desc: 'On the asset',       data: 'Signed, timestamped clearance → compliance + supervisor' },
  { id: 'assist',   label: 'Assist',   icon: 'ti-headset',          desc: 'AR remote expert',   data: 'Call routed by asset/procedure · recorded, tagged, transcribed' },
  { id: 'observe',  label: 'Observe',  icon: 'ti-activity-heartbeat', desc: 'Digital twin data', data: 'Telemetry, findings and incidents feed readiness + KPIs' },
  { id: 'improve',  label: 'Improve',  icon: 'ti-refresh',          desc: 'Agentic feedback',   data: 'AR call harvested · readiness updated · micro-refresh + new sim fault' },
]
export const stageMeta = (id) => LOOP_STAGES.find(s => s.id === id)

// ── The six personas ──────────────────────────────────────────────────
// nav: ordered route ids (must exist in registry NAV); the shell groups them
// by owning platform. platforms: which of the three platforms the persona
// leans on (drives the chips on the picker + the agentic layer gating).
export const PERSONAS = {
  frontline: {
    id: 'frontline', label: 'Frontline Operator', short: 'Frontline', icon: 'ti-tool',
    accent: '#7c3aed', accentSoft: 'rgba(124,58,237,.12)',
    entry: 'Mobile · headset · AR glasses',
    blurb: 'What is assigned to me today → micro-lesson → XR practice → sim-verified check → cleared to work → AR overlay → one-tap expert.',
    done: 'Cleared, competent, supported',
    stages: ['assess', 'train', 'simulate', 'deploy', 'assist', 'observe', 'improve'],
    platforms: ['twin', 'scenario', 'agentic'],
    nav: ['assigned', 'train', 'dashboard', 'loop'],
    defaultRoute: 'assigned',
  },
  supervisor: {
    id: 'supervisor', label: 'Line Supervisor', short: 'Supervisor', icon: 'ti-users',
    accent: '#0891b2', accentSoft: 'rgba(8,145,178,.12)',
    entry: 'Tablet or desktop · dashboard-first',
    blurb: 'Readiness heatmap by team → agentic recommendation → one-tap reassign / push refresh → live AR call visibility → shift close-out.',
    done: 'Right person on the right task, every shift',
    stages: ['assess', 'deploy', 'assist', 'improve'],
    platforms: ['twin', 'agentic'],
    nav: ['supervisor', 'dashboard', 'predict', 'loop', 'audit'],
    defaultRoute: 'supervisor',
  },
  lnd: {
    id: 'lnd', label: 'L&D / Trainer', short: 'L&D', icon: 'ti-school',
    accent: '#D07C1E', accentSoft: 'rgba(208,124,30,.12)',
    entry: 'Desktop content studio',
    blurb: 'Upload an SOP → the agentic engine drafts the LMS quiz, XR storyboard, sim fault list and AR overlay → review, approve, publish across the loop.',
    done: '80% content generated, 20% curated',
    stages: ['train', 'simulate', 'improve'],
    platforms: ['scenario', 'agentic', 'agentbuilder'],
    nav: ['studio', 'scenario', 'train', 'agents', 'templates', 'loop'],
    defaultRoute: 'studio',
  },
  compliance: {
    id: 'compliance', label: 'Compliance Officer', short: 'Compliance', icon: 'ti-shield-check',
    accent: '#16a34a', accentSoft: 'rgba(22,163,74,.12)',
    entry: 'Audit console',
    blurb: '"Show every operator certified on procedure X in period Y" → evidence chain (LMS + XR + sim + AR + twin logs) → signed, timestamped export.',
    done: 'Defensible evidence in one click',
    stages: ['deploy'],
    platforms: ['twin', 'scenario'],
    nav: ['compliance', 'audit', 'loop'],
    defaultRoute: 'compliance',
  },
  coo: {
    id: 'coo', label: 'Plant Manager / COO', short: 'COO', icon: 'ti-chart-line',
    accent: '#2563eb', accentSoft: 'rgba(37,99,235,.12)',
    entry: 'Operational Readiness dashboard',
    blurb: 'Readiness score by site / shift / role → trends on time-to-competency, first-time-fix, incident risk, cost per certified operator → business case export.',
    done: 'A number to run the business on',
    stages: ['observe', 'improve'],
    platforms: ['twin', 'agentic', 'hivemind', 'agentbuilder'],
    nav: ['ops', 'casestudy', 'dashboard', 'predict', 'hivemind', 'agents', 'analytics', 'reports', 'loop'],
    defaultRoute: 'ops',
  },
  admin: {
    id: 'admin', label: 'Admin / IT', short: 'Admin', icon: 'ti-settings',
    accent: '#64748b', accentSoft: 'rgba(100,116,139,.12)',
    entry: 'Configuration console',
    blurb: 'Create user accounts, assign persona roles, wire data connectors (SAP, Workday, Maximo, ServiceNow, IIoT) → twin ingestion → platform observability.',
    done: 'Right people, right roles, platform trusted',
    stages: [],
    platforms: ['twin', 'scenario', 'agentic', 'agentbuilder'],
    nav: ['admin', 'users', 'twins', 'dashboard', 'build', 'agents', 'agentic', 'integrations', 'audit', 'loop'],
    defaultRoute: 'admin',
  },
  superadmin: {
    id: 'superadmin', label: 'Platform Owner', short: 'Owner', icon: 'ti-crown',
    accent: '#b45309', accentSoft: 'rgba(180,83,9,.12)',
    entry: 'Platform console',
    blurb: 'Provision organisations, seat their admins, set each tenant\'s entitlements and policy, and watch platform + service health across every tenant.',
    done: 'Every tenant provisioned and trusted',
    stages: [],
    platforms: ['twin', 'scenario', 'agentic'],
    nav: ['superadmin', 'loop', 'audit'],
    defaultRoute: 'superadmin',
  },
}
// operational personas an admin can assign / preview (super_admin excluded)
export const PERSONA_ORDER = ['frontline', 'supervisor', 'lnd', 'compliance', 'coo', 'admin']

// a user's assigned role decides their persona — not a free picker.
export function personaForRole(role) {
  if (role === 'super_admin') return 'superadmin'
  return PERSONAS[role] ? role : null
}

// ── Persona context (auth-driven; locked to the assigned role) ────────
// The persona is decided by the user's role. Only super_admin / admin may
// "preview as" another persona to see that dashboard; operational users are
// locked to their own. Policy comes from the org (server), not the browser.
const PersonaCtx = createContext(null)

export function PersonaProvider({ children }) {
  const { user } = useAuth()
  const role = user?.role || null
  const homeId = personaForRole(role)
  const canPreview = role === 'super_admin' || role === 'admin'
  const [previewId, setPreviewId] = useState(null)

  // a new login resets any preview
  useEffect(() => { setPreviewId(null) }, [role])

  const personaId = (canPreview && previewId && PERSONAS[previewId]) ? previewId : homeId
  const policy = user?.policy || {}

  const api = useMemo(() => ({
    personaId,
    persona: personaId ? PERSONAS[personaId] : null,
    homeId,
    role,
    canPreview,
    isPreview: !!(previewId && previewId !== homeId),
    previewAs: (id) => { if (canPreview && PERSONAS[id]) setPreviewId(id) },
    exitPreview: () => setPreviewId(null),
    policy,
    // org policy gates which platform a persona may use; admins/owners see all entitled
    allows: (pid, moduleId) => {
      if (pid === 'admin' || pid === 'superadmin') return true
      const list = policy[pid]
      return list ? list.includes(moduleId) : (PERSONAS[pid]?.platforms || []).includes(moduleId)
    },
  }), [personaId, homeId, role, canPreview, previewId, policy])

  return <PersonaCtx.Provider value={api}>{children}</PersonaCtx.Provider>
}

export function usePersona() {
  const ctx = useContext(PersonaCtx)
  if (!ctx) throw new Error('usePersona must be used within PersonaProvider')
  return ctx
}
