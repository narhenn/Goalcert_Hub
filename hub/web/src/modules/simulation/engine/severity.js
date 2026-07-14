// severity.js — translate the engine's vocabulary into Goalcert's visual language.
//
// The engine speaks impact_level (low|medium|high|critical), category (equipment |
// operational | human | safety | cyber | ...) and SimEvent.severity (info|low|medium|
// high|critical). The Hub speaks its own accent tokens. This file is the dictionary,
// and it is the reason the module reads as native Goalcert rather than as an import:
// every colour below is a Hub token, not a colour from the standalone app.

// severity 1..5 → Hub accent ramp (green → teal → amber → red → deep red)
export const SEV_COLOR = ['', '#16a34a', '#0d9488', '#d97706', '#e11d48', '#9f1239']
export const SEV_NAME = ['', 'Minor', 'Moderate', 'Elevated', 'Severe', 'Critical']

// Scenario.impact_level → severity
export const IMPACT_SEV = { low: 2, medium: 3, high: 4, critical: 5 }
// SimEvent.severity → severity
export const EVENT_SEV = { info: 1, low: 2, medium: 3, high: 4, critical: 5 }

// The engine's category vocabulary is open-ended (domain plugins may add to it), so map
// what we know and fall back to 'operational' rather than dropping an unknown category.
export const CATEGORY = {
  equipment: {
    label: 'Equipment', color: 'var(--accent-blue)', icon: 'ti-settings',
    assets: 'Signals, rolling stock, power and track assets',
    intervention: 'Add redundancy or condition-monitoring on the failing asset',
  },
  human: {
    label: 'Human', color: 'var(--brand-2)', icon: 'ti-users',
    assets: 'Operators, crew and passengers',
    intervention: 'Add staffing and decision support at this step',
  },
  safety: {
    label: 'Safety', color: 'var(--accent-red)', icon: 'ti-shield-exclamation',
    assets: 'Passengers, crew and the public',
    intervention: 'Strengthen the safety barrier protecting this step',
  },
  operational: {
    label: 'Operational', color: 'var(--accent-teal)', icon: 'ti-timeline',
    assets: 'Timetable, service level and revenue',
    intervention: 'Mitigate the upstream causes — this outcome cannot be fixed in place',
  },
  environment: {
    label: 'Environmental', color: 'var(--accent-amber)', icon: 'ti-cloud-storm',
    assets: 'Right-of-way, structures and weather exposure',
    intervention: 'Apply protective limits and monitoring',
  },
  cyber: {
    label: 'Cyber', color: 'var(--accent-red)', icon: 'ti-lock',
    assets: 'Control systems and comms',
    intervention: 'Harden the control-system access path',
  },
}

export function categoryMeta(cat) {
  return CATEGORY[cat] || CATEGORY.operational
}

export const sevColor = (s) => SEV_COLOR[Math.max(1, Math.min(5, s || 1))]
export const sevName = (s) => SEV_NAME[Math.max(1, Math.min(5, s || 1))]

// Hub .pill variant for a severity — reuses the existing pill classes.
export function sevPill(s) {
  if (s >= 5) return 'pill-red'
  if (s >= 4) return 'pill-red'
  if (s >= 3) return 'pill-amber'
  return 'pill-green'
}

export const minutes = (seconds) => Math.round((seconds || 0) / 60)
