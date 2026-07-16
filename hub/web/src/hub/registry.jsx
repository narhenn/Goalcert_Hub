// registry.jsx — the composition backbone.
//
// Three composable platforms live behind the hub. A tenant's *entitlements* are
// the set of modules they've adopted; the hub renders exactly the intersection of
// (what a module offers) ∩ (what's enabled). This one file is the single source of
// truth the shell, the sidebar, the overview and the AI layer all read from.
import React, { createContext, useContext, useMemo } from 'react'
import { useAuth } from './auth.jsx'

// ── The three platforms ──────────────────────────────────────────────
// Shell chrome stays Goalcert purple→blue; each module keeps its signature
// accent (from the platform-architecture map: twin teal, scenario amber,
// agentic violet) so a composed product still reads as one system.
export const MODULES = {
  twin: {
    id: 'twin', label: 'Digital Twin', short: 'Twin', icon: 'ti-cube',
    accent: '#0E9E97', accentSoft: 'rgba(14,158,151,.12)',
    role: 'Live, physics-grounded model of the asset',
    blurb: 'The live twin, its telemetry, health, findings and predictions. Everything else asks the twin what is true.',
    base: true,
    features: ['Twins library', 'Live telemetry & health', 'Findings & incidents', 'Build a twin from an image', 'Prediction / RUL'],
  },
  scenario: {
    id: 'scenario', label: 'Scenario Engine', short: 'Scenario', icon: 'ti-adjustments-bolt',
    accent: '#D07C1E', accentSoft: 'rgba(208,124,30,.12)',
    role: 'Author, run & score what-ifs and training',
    blurb: 'Drive the twin through what-if scenarios and injected faults, score the outcome against KPIs, and drill operators with interactive training. Its simulation engine expands a single fault into the full cause→consequence cascade it triggers — and names the consequences that were preventable.',
    features: ['Scenario library & authoring', 'Fault injection', 'Cascade simulation (cause → consequence)', 'Preventable-consequence analysis', 'What-if: re-run at higher readiness', 'Train-with-AI simulator'],
  },
  agentic: {
    id: 'agentic', label: 'Agentic AI', short: 'Agents', icon: 'ti-robot',
    accent: '#7A5CF0', accentSoft: 'rgba(122,92,240,.12)',
    role: 'The reasoning layer that takes over the platform',
    blurb: 'No tabs of its own — it layers on top. An always-on co-pilot, one-tap agent actions (diagnose, work order, cascade) and a cinematic Repair-with-AI takeover.',
    layer: true, // contributes an overlay, not sidebar tabs
    features: ['Always-on co-pilot', 'Diagnosis & analysis agents', 'Work-order generation', 'Cascade analysis', 'Repair-with-AI takeover'],
  },
  hivemind: {
    id: 'hivemind', label: 'HiveMind', short: 'Hive', icon: 'ti-hexagon',
    accent: '#7A5CF0', accentSoft: 'rgba(122,92,240,.12)',
    role: '7 specialist agents that swarm on one brief with real tools',
    blurb: 'Give the hive one brief and 7 specialist agents coordinate in real-time — Finance, Content, Demand Gen, CEO Assistant, Sales Outbound, Sales Qual, Personal Assistant — each with real tools: web search, email, spreadsheets, OCR, MEDDPICC scoring, CRM.',
    features: ['7 tool-wielding agent personas', 'Real tools: web search, email, spreadsheets, OCR', 'SSE-streamed tool narrations + artifacts', 'Agent Builder: create custom agents', 'Follow-up chat with full context'],
  },
  agentbuilder: {
    id: 'agentbuilder', label: 'Agent Builder', short: 'Builder', icon: '⚙',
    accent: '#00D4FF', accentSoft: 'rgba(0,212,255,.12)',
    role: 'Create, configure, test and deploy custom AI agents',
    blurb: 'Six-stage guided builder. From idea to deployed agent in under 30 minutes.',
    features: ['Agent designer', 'Tool marketplace', 'Knowledge upload', 'Guardrails & eval', 'Multi-channel deploy'],
  },
}
export const MODULES_EXT = {
  frontline: {
    id: 'frontline', label: 'Frontline Ops', short: 'Frontline', icon: 'ti-clipboard-check',
    accent: '#7c3aed', accentSoft: 'rgba(124,58,237,.12)',
    role: 'Guided shift flow for operators',
    blurb: 'Assigned-to-me landing, 8-step certified flow, operational readiness score, AR procedure overlay and one-tap expert.',
    features: ['Assigned to me today', '8-step frontline flow', 'Readiness score', 'AR overlay', 'One-tap expert'],
  },
  supervisor: {
    id: 'supervisor', label: 'Supervisor', short: 'Supervisor', icon: 'ti-users',
    accent: '#0891b2', accentSoft: 'rgba(8,145,178,.12)',
    role: 'Team readiness and shift oversight',
    blurb: 'Readiness heatmap by team, agentic recommendations, one-tap reassign/approve, shift close-out summary.',
    features: ['Readiness heatmap', 'Agentic recommendations', 'One-tap actions', 'Shift close-out'],
  },
}
// merge extended modules into main
Object.assign(MODULES, MODULES_EXT)
export const MODULE_ORDER = ['twin', 'scenario', 'agentic', 'hivemind', 'frontline', 'supervisor']

// ── Sidebar navigation, tagged by the owning module ──────────────────
// module: 'core'  → always present (the hub's own cross-cutting surface)
//         'twin' | 'scenario' → shown only when that module is entitled
// Agentic contributes NO nav items — it is a layer, surfaced in the topbar + dock.
export const NAV = [
  { id: 'overview', label: 'Overview', icon: 'ti-layout-dashboard', module: 'core' },
  { id: 'twins', label: 'Twins', icon: 'ti-stack-2', module: 'twin' },
  { id: 'dashboard', label: 'Live Dashboard', icon: 'ti-activity-heartbeat', module: 'twin' },
  { id: 'build', label: 'Build a Twin', icon: 'ti-sparkles', module: 'twin' },
  // Prediction is a view OF a twin (reached from the Live Dashboard), not a
  // sidebar entry. The per-domain surfaces (network map, bed board, heatmaps…)
  // are NOT hub pages at all — the twin's own dashboard renders them from the
  // domain the backend reports, exactly like the Digital Twin platform.
  { id: 'predict', label: 'Prediction', icon: 'ti-chart-histogram', module: 'twin', hidden: true },
  { id: 'scenario', label: 'Scenario & Faults', icon: 'ti-urgent', module: 'scenario' },
  { id: 'train', label: 'Train with AI', icon: 'ti-school', module: 'scenario' },
  { id: 'studio', label: 'Content Studio', icon: 'ti-wand', module: 'scenario' },
  // HiveMind — federated from HiveMind (HiveMindRemoteHost). The Hive (team brief),
  // Agent Builder, Agents dashboard, and all agentic pages are federated; the AI
  // overlay layer (co-pilot, drawer, one-tap actions) stays hub-native.
  { id: 'hivemind', label: 'The Hive', icon: 'ti-hexagon', module: 'hivemind' },
  { id: 'hive-builder', label: 'Agent Builder', icon: 'ti-wand', module: 'hivemind' },
  { id: 'agents', label: 'Agents', icon: 'ti-robot', module: 'hivemind' },
  { id: 'templates', label: 'Templates', icon: 'ti-layout-grid', module: 'hivemind' },
  { id: 'agentic', label: 'Agentic', icon: 'ti-sparkles', module: 'hivemind' },
  { id: 'integrations', label: 'Integrations', icon: 'ti-plug', module: 'hivemind' },
  { id: 'analytics', label: 'Analytics', icon: 'ti-chart-bar', module: 'hivemind' },
  { id: 'reports', label: 'Reports', icon: 'ti-file-analytics', module: 'hivemind' },
  { id: 'assigned', label: 'My Shift', icon: 'ti-clipboard-check', module: 'frontline' },
  { id: 'supervisor', label: 'Team Readiness', icon: 'ti-users', module: 'supervisor' },
  { id: 'compliance', label: 'Compliance', icon: 'ti-shield-check', module: 'core' },
  { id: 'casestudy', label: 'Case Study', icon: 'ti-presentation-analytics', module: 'core' },
  { id: 'ops', label: 'Ops Readiness', icon: 'ti-gauge', module: 'core' },
  { id: 'admin', label: 'Admin Console', icon: 'ti-settings', module: 'core' },
  { id: 'users', label: 'User Management', icon: 'ti-users-group', module: 'core' },
  { id: 'superadmin', label: 'Platform Owner', icon: 'ti-crown', module: 'core' },
  { id: 'loop', label: 'The Loop', icon: 'ti-refresh', module: 'core' },
  { id: 'audit', label: 'Audit Trail', icon: 'ti-history', module: 'core' },
]

// nav items visible for a given entitlement set
export function navFor(enabled) {
  return NAV.filter(it => it.module === 'core' || enabled.includes(it.module))
}

// ── Entitlement context (auth-driven: what the user's ORG adopted) ────
// Entitlements are a tenant property set by the platform owner, not chosen in the
// browser. This provider is a read model over the authenticated user's org; the
// SuperAdmin console edits them per-org through the backend.
const EntCtx = createContext(null)

export function EntitlementProvider({ children }) {
  const { org } = useAuth()
  const enabled = useMemo(() => {
    const list = org?.entitlements && org.entitlements.length ? org.entitlements : MODULE_ORDER
    return MODULE_ORDER.filter(m => list.includes(m))
  }, [org])

  const api = useMemo(() => ({
    enabled,
    has: (id) => enabled.includes(id),
    modules: MODULES, order: MODULE_ORDER,
  }), [enabled])

  return <EntCtx.Provider value={api}>{children}</EntCtx.Provider>
}

export function useEntitlements() {
  const ctx = useContext(EntCtx)
  if (!ctx) throw new Error('useEntitlements must be used within EntitlementProvider')
  return ctx
}

// A short human name for the composed plan, e.g. "Twin + Agents" or "Full Suite".
export function planName(enabled) {
  if (enabled.length === 0) return 'No modules'
  if (enabled.length >= 4) return 'Full Suite'
  return enabled.map(m => MODULES[m].short).join(' + ')
}
