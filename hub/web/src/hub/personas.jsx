// personas.jsx — the persona backbone (from Prem's User Flow doc).
//
// Six personas run six segments of the same seven-stage loop:
//   Assess → Train → Simulate → Deploy → Assist → Observe → Improve
// A persona defines *which lens* a user gets on the composed platform:
// their entry surface, their nav (grouped by platform), the loop stages
// they own, and their definition of "done". Entitlements still gate which
// platforms exist underneath — persona ∩ entitlement = the rendered UI.
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'

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
    platforms: ['scenario', 'agentic'],
    nav: ['studio', 'scenario', 'train', 'loop'],
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
    platforms: ['twin', 'agentic', 'hivemind'],
    nav: ['ops', 'casestudy', 'dashboard', 'predict', 'hivemind', 'loop'],
    defaultRoute: 'ops',
  },
  admin: {
    id: 'admin', label: 'Admin / IT', short: 'Admin', icon: 'ti-settings',
    accent: '#64748b', accentSoft: 'rgba(100,116,139,.12)',
    entry: 'Configuration console',
    blurb: 'SSO / SCIM provisioning → data connectors (SAP, Workday, Maximo, ServiceNow, IIoT) → twin ingestion → role & policy → platform observability.',
    done: 'Platform trusted by IT and Security',
    stages: [],
    platforms: ['twin', 'scenario', 'agentic'],
    nav: ['admin', 'build', 'twins', 'audit', 'loop'],
    defaultRoute: 'admin',
  },
}
export const PERSONA_ORDER = ['frontline', 'supervisor', 'lnd', 'compliance', 'coo', 'admin']

// ── Persona context (persisted; switchable any time from the topbar) ──
const KEY = 'gc_hub_persona'
const POLICY_KEY = 'gc_hub_policy'
const PersonaCtx = createContext(null)

// default policy: each persona sees exactly its registry platforms
const defaultPolicy = () => Object.fromEntries(PERSONA_ORDER.map(p => [p, [...PERSONAS[p].platforms]]))

export function PersonaProvider({ children }) {
  const [personaId, setPersonaId] = useState(() => {
    const v = localStorage.getItem(KEY)
    return v && PERSONAS[v] ? v : null
  })
  // Admin-editable persona → platform policy (the "role / policy configuration"
  // surface in the Admin console). Filters which platform nav a persona gets.
  const [policy, setPolicyState] = useState(() => {
    try {
      const v = JSON.parse(localStorage.getItem(POLICY_KEY) || 'null')
      if (v && typeof v === 'object') return { ...defaultPolicy(), ...v }
    } catch {}
    return defaultPolicy()
  })

  useEffect(() => {
    if (personaId) localStorage.setItem(KEY, personaId)
    else localStorage.removeItem(KEY)
  }, [personaId])
  useEffect(() => { try { localStorage.setItem(POLICY_KEY, JSON.stringify(policy)) } catch {} }, [policy])

  const api = useMemo(() => ({
    personaId,
    persona: personaId ? PERSONAS[personaId] : null,
    setPersona: (id) => { if (PERSONAS[id]) setPersonaId(id) },
    clearPersona: () => setPersonaId(null),
    policy,
    allows: (pid, moduleId) => (policy[pid] || PERSONAS[pid]?.platforms || []).includes(moduleId),
    togglePolicy: (pid, moduleId) => setPolicyState(prev => {
      const cur = prev[pid] || [...(PERSONAS[pid]?.platforms || [])]
      const next = cur.includes(moduleId) ? cur.filter(m => m !== moduleId) : [...cur, moduleId]
      return { ...prev, [pid]: next }
    }),
    resetPolicy: () => setPolicyState(defaultPolicy()),
  }), [personaId, policy])

  return <PersonaCtx.Provider value={api}>{children}</PersonaCtx.Provider>
}

export function usePersona() {
  const ctx = useContext(PersonaCtx)
  if (!ctx) throw new Error('usePersona must be used within PersonaProvider')
  return ctx
}
