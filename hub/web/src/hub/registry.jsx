// registry.jsx — the composition backbone.
//
// Three composable platforms live behind the hub. A tenant's *entitlements* are
// the set of modules they've adopted; the hub renders exactly the intersection of
// (what a module offers) ∩ (what's enabled). This one file is the single source of
// truth the shell, the sidebar, the overview and the AI layer all read from.
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'

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
    blurb: 'Drive the twin through what-if scenarios and injected faults, score the outcome against KPIs, and drill operators with interactive training.',
    features: ['Scenario library & authoring', 'Fault injection', 'What-if run + KPIs', 'Train-with-AI simulator'],
  },
  agentic: {
    id: 'agentic', label: 'Agentic AI', short: 'Agents', icon: 'ti-robot',
    accent: '#7A5CF0', accentSoft: 'rgba(122,92,240,.12)',
    role: 'The reasoning layer that takes over the platform',
    blurb: 'No tabs of its own — it layers on top. An always-on co-pilot, one-tap agent actions (diagnose, work order, cascade) and a cinematic Repair-with-AI takeover.',
    layer: true, // contributes an overlay, not sidebar tabs
    features: ['Always-on co-pilot', 'Diagnosis & analysis agents', 'Work-order generation', 'Cascade analysis', 'Repair-with-AI takeover'],
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
export const MODULE_ORDER = ['twin', 'scenario', 'agentic', 'frontline', 'supervisor']

// ── Sidebar navigation, tagged by the owning module ──────────────────
// module: 'core'  → always present (the hub's own cross-cutting surface)
//         'twin' | 'scenario' → shown only when that module is entitled
// Agentic contributes NO nav items — it is a layer, surfaced in the topbar + dock.
export const NAV = [
  { id: 'overview', label: 'Overview', icon: 'ti-layout-dashboard', module: 'core' },
  { id: 'twins', label: 'Twins', icon: 'ti-stack-2', module: 'twin' },
  { id: 'dashboard', label: 'Live Dashboard', icon: 'ti-activity-heartbeat', module: 'twin' },
  { id: 'build', label: 'Build a Twin', icon: 'ti-sparkles', module: 'twin' },
  { id: 'predict', label: 'Prediction', icon: 'ti-chart-histogram', module: 'twin' },
  { id: 'scenario', label: 'Scenario & Faults', icon: 'ti-urgent', module: 'scenario' },
  { id: 'train', label: 'Train with AI', icon: 'ti-school', module: 'scenario' },
  { id: 'assigned', label: 'My Shift', icon: 'ti-clipboard-check', module: 'frontline' },
  { id: 'supervisor', label: 'Team Readiness', icon: 'ti-users', module: 'supervisor' },
  { id: 'compliance', label: 'Compliance', icon: 'ti-shield-check', module: 'core' },
  { id: 'audit', label: 'Audit Trail', icon: 'ti-history', module: 'core' },
]

// nav items visible for a given entitlement set
export function navFor(enabled) {
  return NAV.filter(it => it.module === 'core' || enabled.includes(it.module))
}

// ── Entitlement context (persisted, live-switchable) ─────────────────
const KEY = 'gc_hub_entitlements'
const ONBOARDED = 'gc_hub_onboarded'
const EntCtx = createContext(null)

export function EntitlementProvider({ children }) {
  const [enabled, setEnabled] = useState(() => {
    try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (Array.isArray(v)) return v } catch {}
    return []
  })
  const [onboarded, setOnboarded] = useState(() => localStorage.getItem(ONBOARDED) === '1')

  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(enabled)) } catch {} }, [enabled])

  const api = useMemo(() => ({
    enabled,
    has: (id) => enabled.includes(id),
    // ordered, deduped setter
    set: (list) => setEnabled(MODULE_ORDER.filter(m => list.includes(m))),
    toggle: (id) => setEnabled(prev => prev.includes(id)
      ? prev.filter(m => m !== id)
      : MODULE_ORDER.filter(m => [...prev, id].includes(m))),
    onboarded,
    completeOnboarding: (list) => {
      setEnabled(MODULE_ORDER.filter(m => list.includes(m)))
      setOnboarded(true); try { localStorage.setItem(ONBOARDED, '1') } catch {}
    },
    resetOnboarding: () => { setOnboarded(false); try { localStorage.removeItem(ONBOARDED) } catch {} },
    modules: MODULES, order: MODULE_ORDER,
  }), [enabled, onboarded])

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
