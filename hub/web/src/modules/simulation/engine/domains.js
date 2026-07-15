// domains.js — the Simulation module's domain registry.
//
// This is the ONLY file that needs to change to plug in a new vertical. Everything
// downstream (mapGraph, impacts, every component) reads the run graph the engine
// returns and is completely domain-agnostic — a node is a node whether it is a signal
// block or a hydraulic pump.
//
// The keys here are the SIMULATION ENGINE's domain keys (what /scenarios?domain=
// expects): railway, aerospace, hospital, defence. The Digital Twin uses its own,
// richer domain keys (lib.jsx DOMAINS) — TWIN_DOMAIN_TO_SIM below bridges the two so
// the Simulation workspace follows whichever twin is active.

export const SIM_DOMAINS = {
  railway: {
    id: 'railway',
    label: 'Railway Operations',
    icon: 'ti-train',
    blurb: 'Signalling, rolling stock, platforms and line-wide service levels.',
    defaultReadiness: 62,

    // Operating conditions the operator can stack onto a run.
    //
    // The engine models *operator readiness*, not weather — there is no condition field
    // on RunConfig. So a condition is applied the way it is actually meaningful: as a
    // readiness penalty. That is not cosmetic. Push effective readiness low enough and
    // the root fault's containment_rate falls to 0, which fires the engine's
    // "containment_rate < 1" trigger and spawns the *preventable* Service Suspension
    // branch. Same scenario, bigger cascade — decided by the engine, not by us.
    conditions: [
      { id: 'peak', label: 'Peak Hour', penalty: 14, icon: 'ti-users' },
      { id: 'reduced_staff', label: 'Reduced Staff', penalty: 12, icon: 'ti-user-minus' },
      { id: 'flood', label: 'Flooding', penalty: 12, icon: 'ti-droplet' },
      { id: 'rain', label: 'Heavy Rain', penalty: 10, icon: 'ti-cloud-rain' },
      { id: 'heat', label: 'Heatwave', penalty: 8, icon: 'ti-temperature' },
    ],
  },
  aerospace: {
    id: 'aerospace',
    label: 'Aerospace MRO',
    icon: 'ti-plane',
    blurb: 'Aircraft hydraulics, dispatch, gate turnaround and downstream flight delay.',
    defaultReadiness: 60,
    conditions: [
      { id: 'peak', label: 'Peak Turnaround', penalty: 14, icon: 'ti-users' },
      { id: 'reduced_staff', label: 'Reduced Crew', penalty: 12, icon: 'ti-user-minus' },
      { id: 'weather', label: 'Adverse Weather', penalty: 12, icon: 'ti-cloud-storm' },
      { id: 'heat', label: 'High OAT', penalty: 8, icon: 'ti-temperature' },
    ],
  },
  hospital: {
    id: 'hospital',
    label: 'Hospital Operations',
    icon: 'ti-building-hospital',
    blurb: 'Theatres, HVAC and pressure, medical gas, power and patient flow.',
    defaultReadiness: 58,
    conditions: [
      { id: 'surge', label: 'Patient Surge', penalty: 14, icon: 'ti-users' },
      { id: 'reduced_staff', label: 'Reduced Staff', penalty: 12, icon: 'ti-user-minus' },
      { id: 'heat', label: 'Heatwave', penalty: 8, icon: 'ti-temperature' },
    ],
  },
  defence: {
    id: 'defence',
    label: 'Defence Operations',
    icon: 'ti-shield',
    blurb: 'Comms, coordination and force readiness under an escalating threat.',
    defaultReadiness: 64,
    conditions: [
      { id: 'threat', label: 'Elevated Threat', penalty: 14, icon: 'ti-alert-triangle' },
      { id: 'reduced_staff', label: 'Reduced Manning', penalty: 12, icon: 'ti-user-minus' },
      { id: 'weather', label: 'Low Visibility', penalty: 8, icon: 'ti-cloud-storm' },
    ],
  },
}

export const SIM_DOMAIN_ORDER = ['railway', 'aerospace', 'hospital', 'defence']

export const DEFAULT_DOMAIN = 'railway'

// Bridge a Digital-Twin domain (lib.jsx DOMAINS key) to a Simulation Engine domain.
// Twins whose domain isn't here have no engine scenarios — the workspace then shows
// "no fault scenarios" honestly rather than the wrong domain's cascade.
export const TWIN_DOMAIN_TO_SIM = {
  'mrt-line': 'railway',
  'tram-network': 'railway',
  'turbine-engine': 'aerospace',
  'hospital': 'hospital',
  'defence-base': 'defence',
}

// The Simulation domain for the active twin, or null if that twin has no engine domain.
export function simDomainForTwin(twinDomain) {
  if (!twinDomain) return null
  return TWIN_DOMAIN_TO_SIM[twinDomain] || null
}

function prettyLabel(id) {
  return String(id).replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

export function domainMeta(id) {
  if (SIM_DOMAINS[id]) return SIM_DOMAINS[id]
  // An active twin with no engine domain: keep an honest label (not railway's) and no
  // conditions, so the Builder reads "No fault scenarios registered for <that twin>".
  if (id) return { id, label: prettyLabel(id), icon: 'ti-cube', blurb: '', defaultReadiness: 60, conditions: [] }
  return SIM_DOMAINS[DEFAULT_DOMAIN]
}

// Effective readiness actually sent to the engine, after condition penalties.
export function effectiveReadiness(domainId, readiness, conditionIds = []) {
  const meta = domainMeta(domainId)
  const penalty = meta.conditions
    .filter(c => conditionIds.includes(c.id))
    .reduce((a, c) => a + c.penalty, 0)
  return Math.max(0, Math.min(100, readiness - penalty))
}
