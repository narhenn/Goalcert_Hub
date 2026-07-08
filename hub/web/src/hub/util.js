// util.js — small shared helpers for the hub shell.
import { FAULT_FX } from '../lib.jsx'

export const humanize = (id = '') => id.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

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
