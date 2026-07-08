// aiStubs.js — local, zero-token stand-ins for the Claude agents.
// When "Stub" mode is active these run instantly in the browser (no API calls,
// no token spend), so the co-pilot can monitor forever, scenarios/diagnosis/
// analysis load immediately, and the interactive trainer works for EVERY twin
// domain (the backend procedure agent was EDM-centric). Switch to "Agent" mode
// for full Claude reasoning.
import { SIG, sevClass, fmt, domainMeta, tilesFor, simTrajectory, signalsAtRisk } from './lib.jsx'

const hp = (h) => (h != null ? Math.round(h * 100) + '%' : '—')

// worst out-of-band signal in the current frame
function worstSignal(domain, latest = {}) {
  let worst = null
  for (const s of tilesFor(domain)) {
    const v = latest[s]; if (v == null) continue
    const sev = sevClass(s, v)
    const rank = sev === 'crit' ? 2 : sev === 'warn' ? 1 : 0
    if (rank === 0) continue
    if (!worst || rank > worst.rank) worst = { key: s, v, sev, rank, m: SIG[s] || { label: s, unit: '' } }
  }
  return worst
}
const lim = (m) => m.crit != null ? `limit ${m.crit}${m.unit ? ' ' + m.unit : ''}`
  : m.critLow != null ? `min ${m.critLow}${m.unit ? ' ' + m.unit : ''}`
  : m.warn != null ? `warn ${m.warn}${m.unit ? ' ' + m.unit : ''}` : 'nominal band'

// ── co-pilot: auto-observation ────────────────────────────────────────
export function stubNarration({ domain, machineName, latest = {}, findings = [], health }) {
  const w = worstSignal(domain, latest)
  if (!w && findings.length === 0)
    return `${machineName} is nominal — all monitored signals are within limits and physics health is ${hp(health)}.`
  if (w)
    return `${w.sev === 'crit' ? '⚠ ' : ''}${w.m.label} is ${w.sev === 'crit' ? 'out of limits' : 'drifting out of band'} at ${fmt(w.v)}${w.m.unit ? ' ' + w.m.unit : ''} (${lim(w.m)}). Health ${hp(health)}.${w.sev === 'crit' ? ' Recommend the AI repair session.' : ' Monitoring closely.'}`
  return `${machineName}: ${findings.length} active finding(s), physics health ${hp(health)}.`
}

// ── co-pilot: chat reply ──────────────────────────────────────────────
export function stubChatReply(msg, { domain, machineName, latest = {}, findings = [], health }) {
  const w = worstSignal(domain, latest)
  const low = (msg || '').toLowerCase()
  if (/concern|worst|risk|problem|wrong/.test(low))
    return w ? `The signal to watch is **${w.m.label}** at ${fmt(w.v)}${w.m.unit ? ' ' + w.m.unit : ''} — ${w.sev === 'crit' ? 'past its limit' : 'approaching its limit'} (${lim(w.m)}). I'd prioritise that subsystem.`
             : `Nothing is out of band right now — ${machineName} looks healthy at ${hp(health)}.`
  if (/check|next|do|action|fix|repair|maintain/.test(low))
    return w ? `Start with **${w.m.label}**: confirm the reading, inspect the related component, and if it holds, launch the AI repair session for a guided fix.`
             : `No action needed — hold current settings and keep monitoring. Health is ${hp(health)}.`
  if (/how|doing|status|health|overall/.test(low))
    return `${machineName} is at ${hp(health)} physics health with ${findings.length} active finding(s). ${w ? `Watch ${w.m.label}.` : 'All signals nominal.'}`
  return `${machineName}: health ${hp(health)}, ${findings.length} finding(s).${w ? ` ${w.m.label} is the one to watch.` : ' All nominal.'} — local stub; switch to Agent for a full Claude answer.`
}

// ── Intelligence: diagnosis (shape matches diagnoseSnapshot consumer) ──
export function stubDiagnostics(domain, twin) {
  const meta = domainMeta(domain)
  const latest = twin?.latest || {}
  const components = (meta.assets || []).map(([id, st]) => ({
    name: id, type: 'asset', status: st, health: st === 'crit' ? 0.3 : st === 'warn' ? 0.62 : 0.92,
  }))
  const sensors = (meta.all || []).map(k => ({ name: SIG[k]?.label || k, value: latest[k], status: sevClass(k, latest[k]) || 'ok' }))
  return { overall_health: twin?.health, components, sensors }
}

export function stubDiagnosis({ domain, machineName, twin }) {
  const dg = stubDiagnostics(domain, twin)
  const w = worstSignal(domain, twin?.latest || {})
  const crit = dg.sensors.filter(s => s.status === 'crit')
  const warn = dg.sensors.filter(s => s.status === 'warn')
  const lines = []
  lines.push(`**Diagnosis — ${machineName}**  \nOverall physics health **${hp(twin?.health)}**.`)
  if (w) lines.push(`\nPrimary driver: **${w.m.label}** at ${fmt(w.v)}${w.m.unit ? ' ' + w.m.unit : ''} (${lim(w.m)}) — ${w.sev === 'crit' ? 'breached its threshold' : 'approaching its limit'}.`)
  if (crit.length) lines.push(`\n**Out of limits (${crit.length}):** ${crit.map(s => s.name).join(', ')}.`)
  if (warn.length) lines.push(`\n**In warning band (${warn.length}):** ${warn.map(s => s.name).join(', ')}.`)
  if (!crit.length && !warn.length) lines.push(`\nAll sensors are within limits — no intervention required.`)
  lines.push(`\n_Local stub diagnosis — switch to Agent mode for a full Claude root-cause report._`)
  return { report: lines.join('\n'), diagnostics: dg }
}

// ── Intelligence: forward analysis (6h) ───────────────────────────────
export function stubAnalysis({ domain, machineName, twin }) {
  const traj = simTrajectory(domain, 360, 40, null, 1)
  const last = traj[traj.length - 1] || {}
  const atRisk = signalsAtRisk(domain, last) || []
  const now = worstSignal(domain, twin?.latest || {})
  const lines = []
  lines.push(`**6-hour outlook — ${machineName}**  \nProjected health at horizon: **${hp(last.health)}** (now ${hp(twin?.health)}).`)
  if (atRisk.length) lines.push(`\nSignals trending out of band: ${atRisk.slice(0, 4).map(r => `**${r.meta?.label || r.key}**`).join(', ')}.`)
  else lines.push(`\nNo signals are projected to leave their limits within the next 6 hours at current load.`)
  if (now) lines.push(`\nWatch **${now.m.label}** — already ${now.sev === 'crit' ? 'critical' : 'in warning'}; it drives the near-term risk.`)
  lines.push(`\n_Local stub projection — switch to Agent mode for a full Claude analysis._`)
  return { report: lines.join('\n') }
}

// ── Scenario: author a runnable spec from a description (no Claude) ────
export function stubScenarioSpec({ kind, description, faults = [], horizonMin }) {
  const isFault = kind === 'fault'
  // best-effort keyword match to a known fault
  const d = (description || '').toLowerCase()
  const hit = faults.find(f => d && (d.includes(f.label.toLowerCase().split(' ')[0]) || d.includes(f.id.split('_')[0])))
  const chosen = hit || faults[0]
  return {
    title: description ? description.slice(0, 60).replace(/\s+\S*$/, '') : (chosen ? chosen.label : 'Operating condition'),
    fault: isFault ? (chosen ? chosen.id : 'none') : 'none',
    severity: isFault ? 0.8 : 0.5,
    control: 0.85,
    horizon_min: horizonMin || 120,
    rationale: isFault
      ? `Local stub spec: models "${chosen ? chosen.label : 'a component fault'}" progressing on ${machineWord(kind)}.`
      : `Local stub spec: models the described operating condition and its stress on the machine.`,
    expected_outcome: isFault ? 'Coupled signals drift toward their limits as the fault develops.' : 'Signals shift under the changed conditions but may stay within limits.',
  }
}
function machineWord() { return 'the twin' }

// ── Scenario: narrative for a projected outcome (no Claude) ────────────
export function stubScenarioNarrative({ domain, machineName, last, spec }) {
  const atRisk = signalsAtRisk(domain, last) || []
  const sev = last.health < 0.4 ? 'critical' : last.health < 0.7 ? 'warning' : 'nominal'
  const lines = []
  lines.push(`**${spec.title}** — projected outcome for ${machineName}.`)
  lines.push(`\nAt the end of the ${Math.round(spec.horizon_min)} min horizon, physics health lands at **${hp(last.health)}** (**${sev}**).`)
  if (atRisk.length) lines.push(`\nOut-of-band signals: ${atRisk.slice(0, 5).map(r => `${r.meta?.label || r.key} (${fmt(r.value)}${r.meta?.unit ? ' ' + r.meta.unit : ''})`).join(', ')}.`)
  else lines.push(`\nAll signals remain within limits across this horizon.`)
  lines.push(`\n**Precautions:** stage the likely spare parts, schedule the intervention before the projected breach, and re-run this scenario after any control change.`)
  lines.push(`\n_Local stub analysis — switch to Agent mode for a full Claude write-up._`)
  return lines.join('\n')
}

// ── Trainer: full interactive repair procedure for ANY domain/fault ───
// Matches the shape Trainer.jsx expects: {title, summary, steps[], success_criteria, common_mistakes[]}
export function stubProcedure({ domain, machineName, fault, title }) {
  const meta = domainMeta(domain)
  const label = title || (fault ? fault.replace(/_/g, ' ') : 'fault')
  const comp = (meta.assets && meta.assets[0] && meta.assets[0][0]) || meta.label || 'the affected component'
  const steps = [
    { id: 'S1', title: 'Diagnose the fault', action: `Read the affected telemetry on ${machineName} and localise the cause of the ${label}.`,
      criteria: 'Fault localised to a subsystem', requires: [], safety: false,
      skip_consequence: 'You work blind — the wrong part gets touched and the fault persists.',
      wrong_order_consequence: 'Without a diagnosis first you cannot target the repair.' },
    { id: 'S2', title: 'Isolate & make safe (LOTO)', action: 'Apply lockout/tagout and confirm zero energy before opening anything.',
      criteria: 'Machine isolated, zero-energy verified', requires: ['S1'], safety: true,
      skip_consequence: 'Live energy present — risk of injury and secondary damage.',
      wrong_order_consequence: 'Isolation must come before any physical work.' },
    { id: 'S3', title: 'Inspect the component', action: `Open the housing and confirm the failure mode on ${comp}.`,
      criteria: 'Failure mode confirmed visually', requires: ['S2'], safety: false,
      skip_consequence: 'You may replace a healthy part and miss the real cause.',
      wrong_order_consequence: 'Inspect only after the machine is isolated.' },
    { id: 'S4', title: 'Repair / replace', action: 'Restore or swap the failed part to serviceable condition per spec.',
      criteria: 'Part restored to serviceable condition', requires: ['S3'], safety: false,
      skip_consequence: 'The fault is never actually fixed.',
      wrong_order_consequence: 'Repair only after inspection confirms the fault.' },
    { id: 'S5', title: 'Recalibrate / set to spec', action: 'Bring the subsystem back to its set-point and re-reference as needed.',
      criteria: 'Subsystem within tolerance', requires: ['S4'], safety: false,
      skip_consequence: 'The machine runs off-nominal and drifts back out of band.',
      wrong_order_consequence: 'Calibrate only after the repair is complete.' },
    { id: 'S6', title: 'Functional test', action: 'Restore power, run the asset and confirm the signals return to nominal.',
      criteria: 'Signals nominal under load', requires: ['S5'], safety: false,
      skip_consequence: 'An unverified repair can fail again in service.',
      wrong_order_consequence: 'Test only after calibration.' },
    { id: 'S7', title: 'Verify & sign off', action: 'Confirm health is restored and close the work order.',
      criteria: 'Health restored, work order closed', requires: ['S6'], safety: false,
      skip_consequence: 'No audit trail — the maintenance is not recorded.',
      wrong_order_consequence: 'Sign off only once the test passes.' },
  ]
  return {
    title: `Guided repair — ${label}`,
    summary: `Interactive procedure to resolve **${label}** on ${machineName}. Perform the steps in order — safety isolation before any physical work — and watch machine health recover. Skipping or re-ordering steps carries realistic consequences.`,
    steps,
    success_criteria: 'All signals return to their nominal band and physics health is restored above target.',
    common_mistakes: [
      'Skipping the LOTO isolation step before opening the machine.',
      'Replacing a part before confirming the failure mode by inspection.',
      'Returning to service without a functional test.',
    ],
  }
}
