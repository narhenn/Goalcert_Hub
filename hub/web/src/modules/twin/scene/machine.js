// machine.js — hub-side knowledge of the Digital Twin's machine domains, ported
// from the NextXR frontend's lib/machine.js so the hub can render the SAME live
// machine dashboard for machine-domain twins (turbine / EDM / rail / hospital /
// EV / defence) instead of the facility/BIM dollhouse. Everything here is display
// metadata + deterministic helpers; the actual physics/telemetry comes from the
// twin service through the gateway.

// The twin service's machine-domain keys (GET /api/twin/twins/domains).
export const MACHINE_DOMAINS = ['turbine-engine', 'edm-machine',
  'railway-metro', 'railway-trainset', 'hospital-campus', 'ev-charging-network', 'ev-battery-pack',
  'defence-base', 'defence-warship']

export const isMachineDomain = (domain) => MACHINE_DOMAINS.includes(domain)

// Domains that expose a live network/spatial payload via GET /twins/{tenant}/network.
export const NETWORK_DOMAINS = ['railway-metro', 'hospital-campus',
  'ev-charging-network', 'ev-battery-pack', 'defence-base', 'defence-warship']

export const isNetworkDomain = (domain) => NETWORK_DOMAINS.includes(domain)

// The hub's own domain ids → the twin service's domain/template keys. Mirrors
// TWIN_TEMPLATE_FOR in api.js; identity for ids that already match.
export const SERVICE_DOMAIN = {
  'edm-machine': 'edm-machine',
  'turbine-engine': 'turbine-engine',
  'defence-base': 'defence-base',
  datacenter: 'generic-facility',
  manufacturing: 'generic-facility',
  hospital: 'hospital-campus',
  'mrt-line': 'railway-metro',
  'ev-network': 'ev-charging-network',
}
export const serviceDomain = (hubDomain) => SERVICE_DOMAIN[hubDomain] || hubDomain

export const statusColor = (status) => ({
  ok: 'var(--accent-green)', healthy: 'var(--accent-green)',
  warning: 'var(--accent-amber)', warn: 'var(--accent-amber)',
  critical: 'var(--accent-red)', crit: 'var(--accent-red)',
  unknown: 'var(--muted)',
}[status] || 'var(--muted)')

export const healthBand = (h) => {
  if (h == null) return { label: '—', color: 'var(--muted)' }
  if (h >= 0.72) return { label: 'Healthy', color: 'var(--accent-green)' }
  if (h >= 0.4) return { label: 'Degraded', color: 'var(--accent-amber)' }
  return { label: 'Critical', color: 'var(--accent-red)' }
}

export const hColor = (h) =>
  h == null ? '#9aa1ad' : h > 0.7 ? '#16a34a' : h > 0.4 ? '#d97706' : '#e11d48'

export const riskFromHealth = (h) => {
  if (h == null) return { score: null, label: '—', color: 'var(--muted)' }
  const score = Math.round((1 - h) * 100)
  if (score >= 60) return { score, label: 'HIGH', color: 'var(--accent-red)' }
  if (score >= 30) return { score, label: 'ELEVATED', color: 'var(--accent-amber)' }
  return { score, label: 'LOW', color: 'var(--accent-green)' }
}

// Display metadata per machine domain (icon, accent, tag, control label).
export const DOMAIN_META = {
  'turbine-engine': { label: 'Gas Turbine', tag: 'Aerospace · Power', icon: 'ti-engine', accent: '#e11d48', control: 'Throttle', machine: true },
  'edm-machine': { label: 'Wire EDM', tag: 'Precision Machining', icon: 'ti-square-rotated-forbid-2', accent: '#2563eb', control: 'Intensity', machine: true },
  'railway-metro': { label: 'Metro Rail Network', tag: 'Rail · Transit', icon: 'ti-train', accent: '#0ea5e9', control: 'Service level', machine: true, network: true },
  'railway-trainset': { label: 'Rolling Stock', tag: 'Rail · Vehicle', icon: 'ti-container', accent: '#6366f1', control: 'Throttle', machine: true },
  'hospital-campus': { label: 'Hospital Campus', tag: 'Healthcare · Estates', icon: 'ti-building-hospital', accent: '#0891b2', control: 'Patient load', machine: true, network: true },
  'ev-charging-network': { label: 'EV Charging Network', tag: 'E-Mobility · Grid', icon: 'ti-charging-pile', accent: '#16a34a', control: 'Demand level', machine: true, network: true },
  'ev-battery-pack': { label: 'EV Battery Pack', tag: 'E-Mobility · Battery', icon: 'ti-battery-charging', accent: '#65a30d', control: 'Charge rate', machine: true, network: true },
  'defence-base': { label: 'Military Base (C4ISR)', tag: 'Defence · C4ISR', icon: 'ti-building-fortress', accent: '#475569', control: 'Readiness', machine: true, network: true },
  'defence-warship': { label: 'Warship', tag: 'Defence · Naval', icon: 'ti-ship', accent: '#334155', control: 'Speed demand', machine: true, network: true },
}

export const domainMeta = (key) => ({
  label: key, tag: 'Domain', icon: 'ti-cube', accent: '#7c3aed',
  ...(DOMAIN_META[key] || {}),
})

// Local name of a signal key ('turbine:egt' → 'egt').
export const localName = (s) => (s || '').split('#').pop().split(':').pop()

// Zero-token co-pilot: deterministic auto-observation from a /state snapshot.
export function stubNarration(st) {
  if (!st || !st.latest) return null
  const h = st.health
  const findings = st.findings || []
  const name = st.name || 'the machine'
  if (findings.length) {
    const crit = findings.find((f) => f.severity === 'critical') || findings[0]
    return `Watching ${name}: ${findings.length} active finding${findings.length > 1 ? 's' : ''}. Most pressing — ${crit.message}`
  }
  if (h != null && h < 0.7) return `${name} health is ${Math.round(h * 100)}% and trending down — worth a look before it breaches a limit.`
  return `${name} is running within limits (health ${h == null ? '—' : Math.round(h * 100) + '%'}). No active findings.`
}

// Zero-token co-pilot reply grounded in the snapshot.
export function stubReply(msg, st) {
  const q = (msg || '').toLowerCase()
  const h = st?.health
  const findings = st?.findings || []
  const name = st?.name || 'the machine'
  const latest = st?.latest || {}
  const worst = findings.find((f) => f.severity === 'critical') || findings[0]
  if (/health|how.*(doing|is it)|status|overall/.test(q)) {
    return `${name} is at ${h == null ? '—' : Math.round(h * 100) + '%'} health` +
      (findings.length ? `, with ${findings.length} active finding${findings.length > 1 ? 's' : ''}. ${worst ? 'Top issue: ' + worst.message : ''}`
        : ' and no active findings — within limits.')
  }
  if (/concern|worst|worry|problem|issue|wrong/.test(q)) {
    return worst ? `The most concerning right now is: ${worst.message}` : `Nothing concerning — ${name} is within limits on every signal.`
  }
  if (/check|next|do|action|recommend|fix|maintain/.test(q)) {
    return worst ? `I'd inspect the subsystem behind "${worst.message.split('—')[0].trim()}". Open the maintenance work order below for the guided procedure.`
      : `No action needed. Keep monitoring; I'll flag anything that drifts toward a limit.`
  }
  const hit = Object.keys(latest).find((s) => q.includes(localName(s).toLowerCase()))
  if (hit) return `${localName(hit)} is currently ${latest[hit]}.`
  return `I'm observing ${name} live. Ask about its health, the most concerning signal, or what to check next.`
}
