// actions.js — the Agentic AI's one-tap actions. Each returns a markdown report from
// the current twin snapshot. Tries real API endpoints first; falls back to zero-token
// stub reasoners when the backend is unreachable (demo / standalone mode).
import { SIG, sevClass, fmt, pct, tilesFor, domainMeta } from '../../lib.jsx'
import { stubDiagnosis, stubAnalysis } from '../../aiStubs.js'
import { humanize } from '../../hub/util.js'
import API, { authHeaders } from '../../api.js'

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

// co-pilot action id → HiveMind facade capability (GET /api/agents/capabilities).
const CAPABILITY = { diagnose: 'diagnose', analysis: 'analyze', cascade: 'cascade', workorder: 'work-order' }

// runAgent is async — callers must await it (AIDrawer handles this).
// The HiveMind agentic layer is the reasoning engine: POST /api/agents/run
// { capability, tenant, context } → it reads the live twin (by tenant) and returns
// { result: { text } }. Needs a live tenant + the user's JWT. Without a live tenant
// (sim twins) or when HiveMind is unreachable, we fall back to zero-token local stubs.
export async function runAgent(id, { domain, machineName, twin, tenant }) {
  const capability = CAPABILITY[id]
  if (!capability) return 'Unknown action.'

  if (tenant) {
    try {
      const r = await fetch('/api/agents/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ capability, tenant, context: { domain, machine_name: machineName } }),
        signal: AbortSignal.timeout(20000),
      })
      if (r.ok) {
        const text = pickText(await r.json())
        if (text) return text
      }
    } catch { /* unreachable — fall back to the local stub below */ }
  }

  if (id === 'diagnose') return stubDiagnosis({ domain, machineName, twin }).report
  if (id === 'analysis') return stubAnalysis({ domain, machineName, twin }).report
  if (id === 'cascade') return cascadeStub({ domain, machineName, twin })
  return workOrderStub({ domain, machineName, twin })
}

// HiveMind facade returns { result: { text } } for narrative capabilities, or a
// structured object for others (e.g. work-order → { wo_number, priority, ... }).
// Render text when present, else fold a structured deliverable into readable markdown.
function pickText(d) {
  const res = d?.result
  if (typeof res === 'string') return res
  if (res?.text) return res.text
  if (res?.report) return res.report
  if (res && typeof res === 'object' && Object.keys(res).length) {
    return Object.entries(res)
      .map(([k, v]) => `**${k.replace(/_/g, ' ')}:** ${v && typeof v === 'object' ? JSON.stringify(v) : v}`)
      .join('\n')
  }
  return d?.report || d?.text || null
}

function workOrderStub({ domain, machineName, twin }) {
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

function cascadeStub({ domain, machineName, twin }) {
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
