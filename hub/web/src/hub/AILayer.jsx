// AILayer.jsx — the Agentic AI layer. It has no tabs; it lays *on top* of the twin:
//   • CoPilotDock   — an always-on floating co-pilot (auto-narration + chat)
//   • AIDrawer      — one-tap agent actions (diagnose, work order, cascade…)
//   • RepairTakeover— a cinematic autonomous-repair mode that takes over the screen
// All three appear only when the Agentic AI module is entitled.
// Live mode: tries orchestrator endpoints first, falls back to stubs when unreachable.
import React, { useEffect, useRef, useState } from 'react'
import { Icon, pct, hColor } from '../lib.jsx'
import { useTwin, useTwinFrame } from './twinState.jsx'
import { useAudit } from './audit.jsx'
import { stubNarration, stubChatReply, stubProcedure } from '../aiStubs.js'
import { AGENT_ACTIONS, runAgent } from '../modules/agentic/actions.js'
import MiniMarkdown from './MiniMarkdown.jsx'
import API, { authHeaders } from '../api.js'

const ACCENT = '#7A5CF0'

// try the orchestrator narration endpoint; fall back to local stub
async function fetchNarration(ctx) {
  if (!ctx.tenant) return { text: stubNarration(ctx), live: false }   // sim twin — no live reasoning
  try {
    const r = await fetch('/api/agents/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ capability: 'narrate', tenant: ctx.tenant, context: ctx }),
      signal: AbortSignal.timeout(8000),
    })
    if (!r.ok) throw new Error(`narrate: ${r.status}`)
    const d = await r.json()
    const t = d?.result?.text || d?.result || d.text || d.narration
    return { text: typeof t === 'string' ? t : stubNarration(ctx), live: true }
  } catch {
    return { text: stubNarration(ctx), live: false }
  }
}

// try the orchestrator chat endpoint; fall back to local stub
async function fetchChat(message, ctx) {
  if (!ctx.tenant) return { text: stubChatReply(message, ctx), live: false }
  try {
    const r = await fetch('/api/agents/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ capability: 'dashboard-chat', message, tenant: ctx.tenant, context: ctx }),
      signal: AbortSignal.timeout(15000),
    })
    if (!r.ok) throw new Error(`chat: ${r.status}`)
    const d = await r.json()
    const t = d?.result?.text || d?.reply || d.text
    return { text: typeof t === 'string' ? t : stubChatReply(message, ctx), live: true }
  } catch {
    return { text: stubChatReply(message, ctx), live: false }
  }
}

// ── Always-on co-pilot dock ───────────────────────────────────────────
export function CoPilotDock() {
  const { active, serviceMode } = useTwin()
  const twin = useTwinFrame()
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState([])
  const [input, setInput] = useState('')
  const [chatLive, setChatLive] = useState(false)
  const endRef = useRef(null)
  const twinRef = useRef(twin); twinRef.current = twin

  // auto-narration every 20s — tries live endpoint, falls back to stub
  useEffect(() => {
    if (!active) return
    const tick = async () => {
      const tw = twinRef.current; if (!tw?.latest) return
      const ctx = { tenant: active.tenant, domain: active.domain, machineName: active.name, latest: tw.latest, findings: tw.findings || [], health: tw.health }
      const { text } = await fetchNarration(ctx)
      setMsgs(prev => [...prev, { role: 'auto', text, ts: new Date().toLocaleTimeString() }].slice(-16))
    }
    tick()
    const t = setInterval(tick, 20000)
    return () => clearInterval(t)
  }, [active])
  useEffect(() => { const el = endRef.current?.parentElement; if (el) el.scrollTop = el.scrollHeight }, [msgs])

  if (!active) return null

  const SLASH_COMMANDS = {
    '/strategy':  { nav: 'hivemind', label: 'Strategy Brief', msg: 'Launching Strategy Brief... Navigate to The Hive to see your agents at work.' },
    '/sales':     { nav: 'hivemind', label: 'Sales Package', msg: 'Launching Sales Package... Navigate to The Hive to see your agents at work.' },
    '/finance':   { nav: 'hivemind', label: 'Finance Review', msg: 'Launching Finance Review... Navigate to The Hive to see your agents at work.' },
    '/marketing': { nav: 'hivemind', label: 'Campaign Launch', msg: 'Launching Campaign Launch... Navigate to The Hive to see your agents at work.' },
    '/hive':      { nav: 'hivemind', label: 'Full Brief', msg: 'Launching HiveMind full brief... Navigate to The Hive to see all 7 agents at work.' },
    '/help': {
      nav: null,
      msg: 'Available commands:\n/strategy — Strategy Brief (market + competitive + financial)\n/sales — Sales Package (pipeline + proposals)\n/finance — Finance Review (P&L + risk)\n/marketing — Campaign Launch (research + campaigns)\n/hive — Full Business Review (all 8 agents)\n/help — show this help',
    },
  }

  const send = async () => {
    const m = input.trim(); if (!m) return
    setMsgs(prev => [...prev, { role: 'user', text: m, ts: new Date().toLocaleTimeString() }])
    setInput('')

    // slash command detection
    const cmd = SLASH_COMMANDS[m.split(' ')[0].toLowerCase()]
    if (cmd) {
      setMsgs(prev => [...prev, { role: 'assistant', text: cmd.msg, ts: new Date().toLocaleTimeString() }])
      if (cmd.nav) {
        window.dispatchEvent(new CustomEvent('copilot:nav', { detail: { route: cmd.nav } }))
      }
      return
    }

    const ctx = { tenant: active.tenant, domain: active.domain, machineName: active.name, latest: twin?.latest || {}, findings: twin?.findings || [], health: twin?.health }
    const { text, live } = await fetchChat(m, ctx)
    setChatLive(live)
    setMsgs(prev => [...prev, { role: 'assistant', text, ts: new Date().toLocaleTimeString() }])
  }

  const isLive = serviceMode === 'live'

  return (
    <div className={`copilot ${open ? 'open' : ''}`}>
      {!open && (
        <button className="copilot-fab" onClick={() => setOpen(true)}>
          <span className="copilot-fab-ring" /><Icon n="ti-sparkles" />
          <span>AI Co-Pilot</span>
        </button>
      )}
      {open && (
        <div className="copilot-panel">
          <div className="copilot-head">
            <span className="copilot-head-ic"><Icon n="ti-sparkles" /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 12.5 }}>AI Co-Pilot</div>
              <div className="hint" style={{ fontSize: 10 }}>watching {active.name}</div>
            </div>
            <span
              className={`pill ${isLive ? 'pill-green' : 'pill-surface'}`}
              style={{ fontSize: 8 }}
              title={isLive ? 'Connected to live backend' : 'Running in demo mode (stubs)'}
            >
              {isLive ? '● live' : '◌ demo'}
            </span>
            <button className="copilot-x" onClick={() => setOpen(false)}><Icon n="ti-minus" /></button>
          </div>
          <div className="copilot-log">
            {msgs.length === 0 && <div className="empty" style={{ fontSize: 11.5, margin: '12px 0' }}>Observing in real time…</div>}
            {msgs.map((m, i) => (
              <div key={i} className={`copilot-msg ${m.role}`}>
                {m.role !== 'user' && <span className="copilot-msg-tag">{m.role === 'auto' ? 'OBSERVATION' : 'CO-PILOT'} · {m.ts}</span>}
                <MiniMarkdown text={m.text} />
              </div>
            ))}
            <div ref={endRef} />
          </div>
          <div className="copilot-input">
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()}
              placeholder={`Ask about ${active.name}… or /strategy /sales /help`} />
            <button className="btn btn-primary" style={{ padding: '7px 10px' }} onClick={send}><Icon n="ti-send" /></button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── One-tap agent actions drawer ──────────────────────────────────────
export function AIDrawer({ open, onClose, onPickTwin, onRepair }) {
  const { active, serviceMode } = useTwin()
  const twin = useTwinFrame()
  const { log } = useAudit()
  const [busy, setBusy] = useState(null)
  const [result, setResult] = useState(null)   // { label, text }

  const run = async (a) => {
    if (!active) return
    setBusy(a.id); setResult(null)
    const text = await runAgent(a.id, { domain: active.domain, machineName: active.name, twin, tenant: active.tenant })
    setResult({ label: a.label, text })
    log('agentic', a.id, `AI · ${a.label}`, `on ${active.name}`)
    setBusy(null)
  }

  return (
    <>
      <div className={`drawer-scrim ${open ? 'show' : ''}`} onClick={onClose} />
      <aside className={`ai-drawer ${open ? 'open' : ''}`}>
        <div className="ai-drawer-head">
          <span className="ai-drawer-ic"><Icon n="ti-robot" /></span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontFamily: 'var(--display)', fontSize: 15 }}>Agentic AI</div>
            <div className="hint" style={{ fontSize: 11 }}>{active ? active.name : 'no active twin'}</div>
          </div>
          <span
            className={`pill ${serviceMode === 'live' ? 'pill-green' : 'pill-surface'}`}
            style={{ fontSize: 8 }}
            title={serviceMode === 'live' ? 'Live backend connected' : 'Demo mode — stubs active'}
          >
            {serviceMode === 'live' ? '● live' : '◌ demo'}
          </span>
          <button className="copilot-x" onClick={onClose}><Icon n="ti-x" /></button>
        </div>

        {!active ? (
          <div className="ai-drawer-body">
            <div className="empty" style={{ padding: '24px 8px' }}>Open a twin for the AI to reason over.</div>
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => { onClose(); onPickTwin && onPickTwin() }}>
              <Icon n="ti-stack-2" /> Pick an asset</button>
          </div>
        ) : (
          <div className="ai-drawer-body">
            <div className="ai-drawer-status">
              <span>Health <b style={{ color: hColor(twin?.health) }}>{pct(twin?.health)}</b></span>
              <span>Findings <b>{(twin?.findings || []).length}</b></span>
            </div>
            <div className="card-label" style={{ margin: '4px 0 8px' }}>Actions</div>
            <div className="ai-actions">
              {AGENT_ACTIONS.map(a => (
                <button key={a.id} className="ai-action" onClick={() => run(a)} disabled={busy}>
                  <span className="ai-action-ic">{busy === a.id ? <span className="spinner" /> : <Icon n={a.icon} />}</span>
                  <span style={{ flex: 1, textAlign: 'left' }}>
                    <span className="ai-action-label">{a.label}</span>
                    <span className="ai-action-hint">{a.hint}</span>
                  </span>
                </button>
              ))}
            </div>
            <button className="btn btn-primary repair-cta" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
              onClick={() => { onClose(); onRepair && onRepair() }}>
              <Icon n="ti-robot" /> Repair with AI (takeover)</button>

            {result && (
              <div className="ai-result">
                <div className="card-title" style={{ fontSize: 13 }}><Icon n="ti-message-report" /> {result.label}</div>
                <MiniMarkdown text={result.text} />
              </div>
            )}
          </div>
        )}
      </aside>
    </>
  )
}

// ── Cinematic Repair-with-AI takeover ─────────────────────────────────
export function RepairTakeover({ open, onClose }) {
  const { active } = useTwin()
  const twin = useTwinFrame()
  const { log } = useAudit()
  const [proc, setProc] = useState(null)
  const [step, setStep] = useState(0)
  const timer = useRef(null)

  useEffect(() => {
    if (!open || !active) return
    const worstFinding = (twin?.findings || [])[0]
    const faultLabel = worstFinding?.displayName?.split(' ').slice(0, 3).join(' ') || 'degradation'
    const p = stubProcedure({ domain: active.domain, machineName: active.name, fault: faultLabel, title: faultLabel })
    setProc(p); setStep(0)
    log('agentic', 'repair', `AI repair session — ${active.name}`, faultLabel)
    let i = 0
    timer.current = setInterval(() => {
      i += 1
      if (i >= p.steps.length) { clearInterval(timer.current); setStep(p.steps.length) }
      else setStep(i)
    }, 1700)
    return () => timer.current && clearInterval(timer.current)
  }, [open, active])

  if (!open || !active || !proc) return null
  const total = proc.steps.length
  const done = step >= total
  const health = Math.min(0.97, 0.34 + (step / total) * 0.63)
  const cur = proc.steps[Math.min(step, total - 1)]

  return (
    <div className="takeover">
      <div className="takeover-bg" />
      <button className="takeover-exit" onClick={onClose}><Icon n="ti-x" /> Exit AI mode</button>

      <div className="takeover-inner">
        <div className="takeover-left">
          <div className="ai-core"><span className="ai-core-glow" /><span className="ai-core-glow d2" /><Icon n="ti-sparkles" /></div>
          <div className="takeover-title">AI Maintenance Director</div>
          <div className="takeover-sub">has taken control of <b>{active.name}</b></div>
          <div className="takeover-narr">
            {done
              ? 'Repair complete. All signals returned to their nominal band — health restored and the work order is closed.'
              : cur?.action}
          </div>
          <div className="takeover-health">
            <div className="hint" style={{ fontSize: 10, letterSpacing: '.06em' }}>MACHINE HEALTH</div>
            <div className="tr-gauge" style={{ marginTop: 6 }}>
              <i style={{ width: `${Math.round(health * 100)}%`, background: health > 0.6 ? '#35C07E' : '#E7A544' }} />
            </div>
            <div style={{ marginTop: 6, fontFamily: 'var(--display)', fontSize: 22, fontWeight: 700, color: '#fff' }}>{Math.round(health * 100)}%</div>
          </div>
        </div>

        <div className="takeover-right">
          <div className="takeover-steps-label">Autonomous repair · {done ? 'complete' : `step ${step + 1} of ${total}`}</div>
          {proc.steps.map((s, i) => {
            const st = i < step || done ? 'done' : i === step ? 'active' : 'todo'
            return (
              <div key={s.id} className={`tk-step ${st}`}>
                <span className="tk-step-num">{st === 'done' ? <Icon n="ti-check" /> : i + 1}</span>
                <div style={{ flex: 1 }}>
                  <div className="tk-step-title">{s.title}{s.safety && <span className="pill pill-red" style={{ fontSize: 8, marginLeft: 6 }}>SAFETY</span>}</div>
                  {st === 'active' && <div className="tk-step-action">{s.action}</div>}
                </div>
                {st === 'active' && <span className="spinner" />}
              </div>
            )
          })}
          {done && (
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 14 }} onClick={onClose}>
              <Icon n="ti-circle-check" /> Return to dashboard</button>
          )}
        </div>
      </div>
    </div>
  )
}
