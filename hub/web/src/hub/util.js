// util.js — small shared helpers for the hub shell.
import { FAULT_FX } from '../lib.jsx'

// Acronyms get upper-cased, so `crac_failure` reads "CRAC Failure" rather than
// "Crac Failure" and `ups_depletion` reads "UPS Depletion". Title-casing every word
// blindly makes a product look like it doesn't know its own domain.
const ACRONYMS = new Set([
  'crac', 'ups', 'hvac', 'cctv', 'gps', 'plc', 'scada', 'rul', 'egt', 'ai', 'ar',
  'or', 'icu', 'pue', 'mri', 'edm',
])
export const humanize = (id = '') => id
  .replace(/[_-]+/g, ' ')
  .split(' ')
  .map(w => (ACRONYMS.has(w.toLowerCase()) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)))
  .join(' ')

// A fault catalogue per domain, derived from the simulator's fault-effects map.
export function faultsFor(domain) {
  const fx = FAULT_FX[domain] || {}
  return Object.keys(fx).map(id => ({ id, label: humanize(id) }))
}

export function timeAgo(ts) {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000))
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.round(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  return `${h}h ago`
}

// name from an email local-part, e.g. "tejeshachutaa19" → "Tejesh"
export function nameFromEmail(email = '') {
  const local = (email.split('@')[0] || 'user').replace(/[0-9._-]+/g, ' ').trim()
  const first = local.split(' ')[0] || 'User'
  return first.charAt(0).toUpperCase() + first.slice(1)
}
