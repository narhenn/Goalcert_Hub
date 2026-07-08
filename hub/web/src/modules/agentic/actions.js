// actions.js — the Agentic AI's one-tap actions. Each returns a markdown report from
// the current twin snapshot, using the zero-token stub reasoners (swap for the real
// agent endpoints when the Agentic AI service lands).
import { SIG, sevClass, fmt, pct, tilesFor, domainMeta } from '../../lib.jsx'
import { stubDiagnosis, stubAnalysis } from '../../aiStubs.js'
import { humanize } from '../../hub/util.js'

const worst = (domain, latest = {}) => {
  let w = null
  for (const s of tilesFor(domain)) {
    const v = latest[s]; if (v == null) continue
    const sev = sevClass(s, v); const rank = sev === 'crit' ? 2 : sev === 'warn' ? 1 : 0
    if (rank && (!w || rank > w.rank)) w = { key: s, v, sev, rank, m: SIG[s] || { label: s, unit: '' } }
  }
  return w
}

export const AGENT_ACTIONS = [
  { id: 'diagnose', label: 'Diagnose', icon: 'ti-stethoscope', hint: 'Root cause from findings + telemetry' },
  { id: 'analysis', label: '6-hour outlook', icon: 'ti-chart-dots', hint: 'Forward analysis in narrative' },
  { id: 'workorder', label: 'Work order', icon: 'ti-file-certificate', hint: 'Structured repair steps' },
  { id: 'cascade', label: 'Cascade analysis', icon: 'ti-affiliate', hint: 'How one fault propagates' },
]

export function runAgent(id, { domain, machineName, twin }) {
  if (id === 'diagnose') return stubDiagnosis({ domain, machineName, twin }).report
  if (id === 'analysis') return stubAnalysis({ domain, machineName, twin }).report
  if (id === 'workorder') return workOrder({ domain, machineName, twin })
  if (id === 'cascade') return cascade({ domain, machineName, twin })
  return 'Unknown action.'
}

function workOrder({ domain, machineName, twin }) {
  const w = worst(domain, twin?.latest || {})
  const meta = domainMeta(domain)
  const comp = (meta.assets && meta.assets[0] && meta.assets[0][0]) || meta.label
  const wo = 'WO-' + Math.random().toString(36).slice(2, 7).toUpperCase()
  const lines = []
  lines.push(`**Work order ${wo} — ${machineName}**`)
  lines.push(`\n**Priority:** ${w?.sev === 'crit' ? 'Critical' : w ? 'Elevated' : 'Routine'} · **Physics health:** ${pct(twin?.health)}`)
  lines.push(`\n**Fault:** ${w ? `${w.m.label} ${w.sev === 'crit' ? 'out of limits' : 'drifting'} at ${fmt(w.v)}${w.m.unit ? ' ' + w.m.unit : ''}` : 'No active fault — preventive check'}.`)
  lines.push(`\n**Root cause (probable):** ${w ? `degradation localised to the ${comp} subsystem` : 'nominal wear'}.`)
  lines.push(`\n**Steps:**\n- Isolate & make safe (LOTO); verify zero energy\n- Inspect ${comp}; confirm failure mode\n- Repair / replace to serviceable condition\n- Recalibrate to set-point\n- Functional test under load; confirm signals nominal\n- Verify health restored; sign off`)
  lines.push(`\n_Stub work order — switch to the Agentic AI service for a certified, standards-referenced WO._`)
  return lines.join('\n')
}

function cascade({ domain, machineName, twin }) {
  const w = worst(domain, twin?.latest || {})
  const meta = domainMeta(domain)
  const subs = (meta.assets || []).slice(0, 3).map(a => a[0])
  const lines = []
  lines.push(`**Cascade analysis — ${machineName}**`)
  if (!w) { lines.push(`\nNo active fault to propagate — all monitored signals are within limits.`); return lines.join('\n') }
  lines.push(`\nStarting point: **${w.m.label}** (${fmt(w.v)}${w.m.unit ? ' ' + w.m.unit : ''}).`)
  lines.push(`\n**Propagation chain:**\n- ${w.m.label} breach stresses the primary subsystem${subs[0] ? ` (${subs[0]})` : ''}\n- Coupled load shifts to ${subs[1] || 'adjacent components'}, raising their duty\n- If unaddressed within the horizon, ${subs[2] || 'downstream systems'} trend toward their own limits`)
  lines.push(`\n**Mitigation:** intervene on ${w.m.label} before the projected breach to arrest the chain.`)
  lines.push(`\n_Stub cascade — switch to the Agentic AI service for a full failure-chain graph._`)
  return lines.join('\n')
}
