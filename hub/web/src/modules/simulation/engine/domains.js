// domains.js — the Simulation module's domain registry.
//
// This is the ONLY file that needs to change to plug in a new vertical. Everything
// downstream (mapGraph, impacts, every component) reads the run graph the engine
// returns and is completely domain-agnostic — a node is a node whether it is a signal
// block or a hydraulic pump.
//
// To add Aerospace later:
//   1. register its scenarios in services/simulation-engine (already plugin-based), and
//   2. add one entry below.
// That is the whole job. No component changes.

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
}

export const SIM_DOMAIN_ORDER = ['railway']

export const DEFAULT_DOMAIN = 'railway'

export function domainMeta(id) {
  return SIM_DOMAINS[id] || SIM_DOMAINS[DEFAULT_DOMAIN]
}

// Effective readiness actually sent to the engine, after condition penalties.
export function effectiveReadiness(domainId, readiness, conditionIds = []) {
  const meta = domainMeta(domainId)
  const penalty = meta.conditions
    .filter(c => conditionIds.includes(c.id))
    .reduce((a, c) => a + c.penalty, 0)
  return Math.max(0, Math.min(100, readiness - penalty))
}
