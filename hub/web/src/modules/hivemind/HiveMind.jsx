// HiveMind.jsx — the full VeeHive-style agent coordination view for AUTOMIND/GoalCert.
// 4-step flow: Onboard → Brief → Build → Approve
// The hive view shows agents as hex avatars that pulse and connect visually while working.
// Each agent produces a deliverable card, not a chat bubble.
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '../../lib.jsx'
import { useVertical } from '../../hub/verticalState.jsx'
import { useTwin, useTwinFrame } from '../../hub/twinState.jsx'
import {
  PERSONAS, PERSONA_MAP, LEAD_AGENT_ID,
  FULL_BRIEF_AGENTS, STRATEGY_AGENTS, SALES_AGENTS, FINANCE_AGENTS, MARKETING_AGENTS,
} from './personas.js'
import { runHiveBrief, BRIEF_PRESETS } from './engine.js'
import DeliverableCard from './DeliverableCard.jsx'
import HexAvatar from './HexAvatar.jsx'
import { exportAllDeliverables } from './export.js'
import { saveToHistory, loadHistory } from './history.js'

// ── Step constants ────────────────────────────────────────────────────
const STEPS = ['onboard', 'brief', 'build', 'approve']

// ── Hive layout ───────────────────────────────────────────────────────
// 7-hex layout: top row [0,1,2], mid row [0,1,2], bottom row [1,2]
// Each persona has a gridPos [col, row]. We compute pixel positions.
// Container is 380px wide × 340px tall.
const HEX_W = 80   // outer hex width
const HEX_GAP_X = 88
const HEX_GAP_Y = 86
const ORIGIN_X = 22
const ORIGIN_Y = 16
const ROW_OFFSETS = [0, 44, 0]  // middle row is staggered right

function hexPosition(gridPos) {
  const [col, row] = gridPos
  const x = ORIGIN_X + col * HEX_GAP_X + (ROW_OFFSETS[row] || 0)
  const y = ORIGIN_Y + row * HEX_GAP_Y
  return { x, y }
}

// Connection lines between triggering agents
const CONNECTIONS = [
  ['riya', 'alex'],
  ['riya', 'priya'],
  ['riya', 'mikhail'],
  ['alex', 'fatima'],
]

// ── State types ───────────────────────────────────────────────────────
// agentState: idle | queued | working | done | error

export default function HiveMind() {
  const { active } = useTwin()
  const twin = useTwinFrame()
  const { vertical } = useVertical()

  // 4-step flow state
  const [step, setStep] = useState('onboard')

  // Onboard: asset/facility config
  const [facilityName, setFacilityName] = useState(active?.name || '')
  const [domain, setDomain] = useState(active?.domain || '')

  // Brief: what the user wants
  const [briefText, setBriefText] = useState('')
  const [selectedPreset, setSelectedPreset] = useState(null)
  const [selectedAgents, setSelectedAgents] = useState(FULL_BRIEF_AGENTS)
  const [provider, setProvider] = useState('claude')  // 'claude' | 'gemini'

  // Build: agent run state
  const [agentStates, setAgentStates] = useState({})   // id → { status, startedAt, finishedAt, narration }
  const [deliverables, setDeliverables] = useState({}) // id → { result, raw }
  const [streamingContent, setStreamingContent] = useState({}) // id → partial content
  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState('')

  // Approve: which deliverables the user has actioned
  const [approved, setApproved] = useState(new Set())
  const [exported, setExported] = useState(new Set())

  // Agent follow-up chat (visible in Approve step)
  const [chatMessages, setChatMessages] = useState([])

  // Keep twin context in sync with active asset
  useEffect(() => {
    if (active) {
      setFacilityName(active.name || '')
      setDomain(active.domain || '')
    }
  }, [active])

  // ── Build step: run the hive ────────────────────────────────────────
  const runBrief = useCallback(async () => {
    if (!briefText.trim() && !selectedPreset) return
    setRunning(true)
    setRunError('')
    setDeliverables({})
    setApproved(new Set())
    setExported(new Set())

    // initialise all selected agents to queued
    const init = {}
    selectedAgents.forEach(id => { init[id] = { status: 'queued', startedAt: null, finishedAt: null } })
    setAgentStates(init)
    setStep('build')

    const context = {
      machine: facilityName || 'Industrial Asset',
      facility: facilityName || 'GoalCert',
      domain: domain || 'enterprise technology',
      vertical: vertical || 'aerospace',
      provider: provider || 'claude',
      description: briefText || selectedPreset?.description || '',
      diagnostics: twin || {},
      snapshot: twin || {},
      state: twin || {},
      findings: twin?.findings || [],
      prompt: briefText || selectedPreset?.description || '',
      sensors: twin?.signals ? Object.keys(twin.signals) : [],
    }

    try {
      await runHiveBrief({
        brief: briefText || selectedPreset?.description || '',
        agentIds: selectedAgents,
        context,
        onAgentStart: (id) => {
          setAgentStates(prev => ({ ...prev, [id]: { status: 'working', startedAt: Date.now(), finishedAt: null, narration: '' } }))
        },
        onAgentDone: (id, result) => {
          setAgentStates(prev => ({ ...prev, [id]: { ...prev[id], status: 'done', finishedAt: Date.now() } }))
          setDeliverables(prev => ({ ...prev, [id]: result }))
          setStreamingContent(prev => { const n = { ...prev }; delete n[id]; return n })
        },
        onAgentError: (id, err) => {
          setAgentStates(prev => ({ ...prev, [id]: { ...prev[id], status: 'error', error: err } }))
        },
        onAgentNarration: (id, text) => {
          setAgentStates(prev => ({ ...prev, [id]: { ...prev[id], narration: text } }))
        },
        onAgentDelta: (id, content) => {
          setStreamingContent(prev => ({ ...prev, [id]: content }))
        },
      })
      setStep('approve')
      // save to history (use setTimeout to let final setDeliverables flush)
      setTimeout(() => {
        saveToHistory({
          brief: briefText || selectedPreset?.description || '',
          facility: facilityName, domain, provider,
          agentsUsed: selectedAgents,
          deliverables,
        })
      }, 500)
    } catch (e) {
      setRunError(e?.message || 'Hive run failed.')
    } finally {
      setRunning(false)
    }
  }, [briefText, selectedPreset, selectedAgents, facilityName, domain, twin])

  // ── Approve actions ─────────────────────────────────────────────────
  const approveDeliverable = (agentId) => setApproved(prev => new Set([...prev, agentId]))
  const exportDeliverable = (agentId) => {
    setExported(prev => new Set([...prev, agentId]))
    // in production this would POST to /api/agents/export or similar
    const d = deliverables[agentId]
    if (!d) return
    const blob = new Blob([JSON.stringify(d.raw || d.result, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${agentId}_deliverable.json`; a.click()
    URL.revokeObjectURL(url)
  }

  const allDone = selectedAgents.every(id => {
    const s = agentStates[id]?.status
    return s === 'done' || s === 'error'
  })
  const doneCount = selectedAgents.filter(id => agentStates[id]?.status === 'done').length

  return (
    <div className="hm-root">
      <HiveHeader step={step} setStep={setStep} running={running} />

      <div className="hm-body">
        {step === 'onboard' && (
          <>
            <OnboardStep
              facilityName={facilityName} setFacilityName={setFacilityName}
              domain={domain} setDomain={setDomain}
              active={active}
              onNext={() => setStep('brief')}
            />
            <RecentBriefs />
          </>
        )}

        {step === 'brief' && (
          <BriefStep
            briefText={briefText} setBriefText={setBriefText}
            selectedPreset={selectedPreset} setSelectedPreset={setSelectedPreset}
            selectedAgents={selectedAgents} setSelectedAgents={setSelectedAgents}
            provider={provider} setProvider={setProvider}
            onBack={() => setStep('onboard')}
            onRun={runBrief}
            twin={twin}
          />
        )}

        {(step === 'build' || step === 'approve') && (
          <BuildApproveStep
            step={step}
            personas={PERSONAS.filter(p => selectedAgents.includes(p.id))}
            selectedAgents={selectedAgents}
            agentStates={agentStates}
            deliverables={deliverables}
            streamingContent={streamingContent}
            approved={approved}
            exported={exported}
            running={running}
            runError={runError}
            doneCount={doneCount}
            totalCount={selectedAgents.length}
            onApprove={approveDeliverable}
            onExport={exportDeliverable}
            onNewBrief={() => { setStep('brief'); setAgentStates({}); setDeliverables({}); setStreamingContent({}); setChatMessages([]) }}
            chatMessages={chatMessages}
            setChatMessages={setChatMessages}
            facilityName={facilityName}
            domain={domain}
            provider={provider}
          />
        )}
      </div>
    </div>
  )
}

// ── Header with step tracker ──────────────────────────────────────────
function HiveHeader({ step, setStep, running }) {
  const STEP_META = [
    { id: 'onboard', label: 'Onboard', icon: 'ti-building-factory-2', desc: 'Configure your asset' },
    { id: 'brief', label: 'Brief', icon: 'ti-notes', desc: 'Describe the operation' },
    { id: 'build', label: 'Build', icon: 'ti-robot', desc: 'Agents coordinate' },
    { id: 'approve', label: 'Approve', icon: 'ti-circle-check', desc: 'Review & export' },
  ]
  const currentIdx = STEPS.indexOf(step)

  return (
    <div className="hm-header">
      <div className="hm-brand">
        <HexIcon size={40} color="#7A5CF0" glow="rgba(122,92,240,.4)">
          <Icon n="ti-hexagon" />
        </HexIcon>
        <div>
          <div className="hm-brand-name">AUTOMIND Hive</div>
          <div className="hm-brand-tag">7 specialists · one brief</div>
        </div>
      </div>

      <div className="hm-steps">
        {STEP_META.map((s, i) => {
          const done = i < currentIdx
          const active = s.id === step
          return (
            <React.Fragment key={s.id}>
              {i > 0 && <div className={`hm-step-line ${done ? 'done' : ''}`} />}
              <button
                className={`hm-step ${active ? 'active' : ''} ${done ? 'done' : ''}`}
                onClick={() => !running && i <= currentIdx && setStep(s.id)}
                disabled={running}
              >
                <div className="hm-step-num">
                  {done ? <Icon n="ti-check" /> : i + 1}
                </div>
                <div className="hm-step-text">
                  <div className="hm-step-label">{s.label}</div>
                  <div className="hm-step-desc">{s.desc}</div>
                </div>
              </button>
            </React.Fragment>
          )
        })}
      </div>
    </div>
  )
}

// ── Step 1: Onboard ───────────────────────────────────────────────────
const DOMAIN_OPTIONS = [
  { value: 'mro', label: 'Aerospace', icon: 'ti-propeller' },
  { value: 'railway', label: 'Railway / Rail', icon: 'ti-train' },
  { value: 'ev', label: 'EV / Battery', icon: 'ti-bolt' },
  { value: 'hospital', label: 'Hospital / Medical', icon: 'ti-heart-rate-monitor' },
  { value: 'defence', label: 'Defence / Military', icon: 'ti-shield' },
  { value: 'edm-machine', label: 'Manufacturing (EDM)', icon: 'ti-settings-cog' },
  { value: 'turbine', label: 'Gas Turbine', icon: 'ti-wind' },
]

function OnboardStep({ facilityName, setFacilityName, domain, setDomain, active, onNext }) {
  const [description, setDescription] = useState('')
  const [tone, setTone] = useState('professional')
  const [brandSaved, setBrandSaved] = useState(false)

  // try to load saved brand memory
  useEffect(() => {
    if (!facilityName) return
    fetch(`/api/hive/brand/${encodeURIComponent(facilityName)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.found) {
          setDescription(d.description || '')
          setTone(d.tone || 'professional')
          if (d.industry) setDomain(d.industry)
          setBrandSaved(true)
        }
      })
      .catch(() => {})
  }, [facilityName])

  const saveBrand = () => {
    fetch('/api/hive/brand', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ facility: facilityName, industry: domain, description, tone }),
    }).then(() => setBrandSaved(true)).catch(() => {})
  }

  return (
    <div className="hm-step-panel hm-onboard">
      <div className="hm-step-title">
        <Icon n="ti-building-factory-2" />
        Configure your company
      </div>
      <div className="hm-step-sub">
        Tell the hive about your business. Agents remember this across sessions — your brand voice, industry, and context feed into every deliverable.
      </div>

      {active && (
        <div className="hm-notice hm-notice-ok">
          <Icon n="ti-hexagon-filled" />
          Active twin detected: <b>{active.name}</b> ({active.domain}) — fields pre-filled.
        </div>
      )}

      {brandSaved && (
        <div className="hm-notice hm-notice-ok" style={{ background: 'rgba(22,163,74,.08)', borderColor: 'rgba(22,163,74,.2)' }}>
          <Icon n="ti-brain" />
          Brand memory loaded — agents remember your company from last session.
        </div>
      )}

      <div className="hm-form-grid">
        <div className="hm-field">
          <label className="hm-label">Company / Facility Name</label>
          <input
            className="hm-input"
            value={facilityName}
            onChange={e => { setFacilityName(e.target.value); setBrandSaved(false) }}
            placeholder="e.g. GoalCert, SMRT, SingHealth"
          />
        </div>

        <div className="hm-field">
          <label className="hm-label">Industry</label>
          <div className="hm-domain-grid">
            {DOMAIN_OPTIONS.map(d => (
              <button
                key={d.value}
                className={`hm-domain-btn ${domain === d.value ? 'on' : ''}`}
                onClick={() => setDomain(d.value)}
              >
                <Icon n={d.icon} />{d.label}
              </button>
            ))}
          </div>
        </div>

        <div className="hm-field" style={{ gridColumn: '1 / -1' }}>
          <label className="hm-label">Company Description <span style={{ color: 'var(--hint)', fontWeight: 400 }}>(agents use this as context)</span></label>
          <textarea
            className="hm-textarea"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="e.g. GoalCert is a multi-vertical digital twin platform combining physics-based twins, agentic AI, simulation training, and drone operations. We serve aerospace, railway, EV, hospital, and defence sectors."
            rows={3}
            style={{ fontSize: 12 }}
          />
        </div>

        <div className="hm-field">
          <label className="hm-label">Communication Tone</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {['professional', 'concise', 'technical', 'executive', 'friendly'].map(t => (
              <button key={t} className={`hm-domain-btn ${tone === t ? 'on' : ''}`}
                style={{ fontSize: 11, padding: '6px 10px' }}
                onClick={() => setTone(t)}>
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="hm-cta-row" style={{ gap: 10 }}>
        {facilityName.trim() && !brandSaved && (
          <button className="hm-back" onClick={saveBrand} style={{ color: '#16a34a' }}>
            <Icon n="ti-brain" /> Save brand memory
          </button>
        )}
        <button className="hm-cta" onClick={() => { if (!brandSaved && facilityName.trim()) saveBrand(); onNext() }}
          disabled={!facilityName.trim()}>
          Continue to Brief <Icon n="ti-arrow-right" />
        </button>
      </div>
    </div>
  )
}

// ── Step 2: Brief ─────────────────────────────────────────────────────
const AGENT_PRESETS = [
  { id: 'full', label: 'Full Business Review', icon: 'ti-crown', agents: FULL_BRIEF_AGENTS, description: 'All 8 agents: market research, strategy, financials, risk, campaigns, pipeline, proposals — CEO synthesis.' },
  { id: 'strategy', label: 'Strategy Brief', icon: 'ti-chart-arrows', agents: STRATEGY_AGENTS, description: 'Market landscape, competitive positioning, financial viability, strategic recommendation.' },
  { id: 'sales', label: 'Sales Package', icon: 'ti-chart-bar', agents: SALES_AGENTS, description: 'Market context, pipeline health, client proposal draft, executive summary.' },
  { id: 'finance', label: 'Finance Review', icon: 'ti-calculator', agents: FINANCE_AGENTS, description: 'P&L projection, risk register, audit readiness, CFO-ready summary.' },
  { id: 'marketing', label: 'Campaign Launch', icon: 'ti-speakerphone', agents: MARKETING_AGENTS, description: 'Market trends, audience insights, campaign plan with 4-week content calendar.' },
]

function BriefStep({ briefText, setBriefText, selectedPreset, setSelectedPreset, selectedAgents, setSelectedAgents, provider, setProvider, onBack, onRun, twin }) {
  const canRun = briefText.trim().length > 0 || selectedPreset !== null

  const handlePreset = (preset) => {
    setSelectedPreset(preset)
    setSelectedAgents(preset.agents)
    if (!briefText.trim()) setBriefText(preset.description)
  }

  const toggleAgent = (id) => {
    setSelectedAgents(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  return (
    <div className="hm-step-panel hm-brief">
      <div className="hm-step-title">
        <Icon n="ti-notes" />
        Brief the hive
      </div>
      <div className="hm-step-sub">
        Describe the operational situation in one sentence. The agents will coordinate to produce every relevant deliverable.
      </div>

      {twin && Object.keys(twin).length > 0 && (
        <div className="hm-notice hm-notice-ok" style={{ background: 'rgba(122,92,240,.08)', borderColor: 'rgba(122,92,240,.2)', marginBottom: 10 }}>
          <Icon n="ti-hexagon-filled" />
          <b>Twin data attached</b> — agents will receive live sensor readings, health ({twin.health != null ? Math.round(twin.health * 100) + '%' : 'n/a'}) and {(twin.findings || []).length} active fault{(twin.findings || []).length !== 1 ? 's' : ''}.
        </div>
      )}

      <div className="hm-brief-textarea-wrap">
        <textarea
          className="hm-textarea"
          value={briefText}
          onChange={e => { setBriefText(e.target.value); setSelectedPreset(null) }}
          placeholder="e.g. 'Exhaust gas temperature is 40°C above limit on Engine TR-04. Diagnose, raise a work order, identify parts and file an incident report.'"
          rows={4}
        />
      </div>

      <div className="hm-section-label">Quick-start presets</div>
      <div className="hm-preset-row">
        {BRIEF_PRESETS.map(p => (
          <button
            key={p.id}
            className={`hm-preset ${selectedPreset?.id === p.id ? 'on' : ''}`}
            onClick={() => handlePreset(p)}
          >
            <Icon n={p.icon} />
            <span className="hm-preset-label">{p.label}</span>
            <span className="hm-preset-hint">{p.hint}</span>
          </button>
        ))}
      </div>

      <div className="hm-section-label">Agent selection — {selectedAgents.length} active</div>
      <div className="hm-agent-selector">
        {PERSONAS.map(p => (
          <button
            key={p.id}
            className={`hm-agent-chip ${selectedAgents.includes(p.id) ? 'on' : ''}`}
            style={{ '--chip-color': p.color, '--chip-glow': p.glow }}
            onClick={() => toggleAgent(p.id)}
          >
            <span className="hm-chip-avatar" style={{ background: p.color }}>{p.initials}</span>
            <span className="hm-chip-name">{p.name.split(' ')[0]}</span>
            <span className="hm-chip-role">{p.deliverable.label}</span>
          </button>
        ))}
      </div>

      <div className="hm-section-label">AI Provider</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[
          { id: 'claude', label: 'Claude (Anthropic)', icon: 'ti-brain', color: '#D97706' },
          { id: 'gemini', label: 'Gemini (Google)', icon: 'ti-sparkles', color: '#4285F4' },
        ].map(p => (
          <button key={p.id}
            className={`hm-agent-chip ${provider === p.id ? 'on' : ''}`}
            style={{ '--chip-color': p.color, '--chip-glow': `${p.color}40`, flex: 1 }}
            onClick={() => setProvider(p.id)}>
            <Icon n={p.icon} />
            <span className="hm-chip-name">{p.label}</span>
          </button>
        ))}
      </div>

      <div className="hm-cta-row hm-brief-actions">
        <button className="hm-back" onClick={onBack}><Icon n="ti-arrow-left" /> Back</button>
        <button className="hm-cta" onClick={onRun} disabled={!canRun || selectedAgents.length === 0}>
          <Icon n="ti-robot" /> Activate hive ({selectedAgents.length} agents via {provider})
        </button>
      </div>
    </div>
  )
}

// ── Steps 3+4: Build → Approve ────────────────────────────────────────
function BuildApproveStep({
  step, personas, selectedAgents, agentStates, deliverables, streamingContent, approved, exported,
  running, runError, doneCount, totalCount,
  onApprove, onExport, onNewBrief,
  chatMessages, setChatMessages, facilityName, domain, provider,
}) {
  return (
    <div className="hm-build-layout">
      {/* Left: hive coordination view */}
      <div className="hm-hive-panel">
        <HiveCoordView
          personas={personas}
          agentStates={agentStates}
          running={running}
          doneCount={doneCount}
          totalCount={totalCount}
        />
        {step === 'approve' && (() => {
          const totalTokens = Object.values(deliverables).reduce((a, d) => a + (d?.tokens || 0), 0)
          const liveCount = Object.values(deliverables).filter(d => d?.live).length
          const estimatedCost = (totalTokens / 1000000 * 3).toFixed(3) // ~$3/MTok for Sonnet
          return (
            <div className="hm-hive-done">
              <div className="hm-hive-done-count">{doneCount}/{totalCount}</div>
              <div className="hm-hive-done-label">deliverables ready</div>
              {totalTokens > 0 && (
                <div style={{ fontSize: 10, color: 'var(--hint)', marginTop: 6, fontFamily: 'var(--mono)' }}>
                  {liveCount > 0 && <span style={{ color: '#16a34a' }}>● {liveCount} live</span>}
                  {' '}{totalTokens.toLocaleString()} tokens · ~${estimatedCost}
                </div>
              )}
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button className="hm-new-brief-btn" onClick={() => exportAllDeliverables(deliverables, selectedAgents, 'pdf')} title="Export all as PDF">
                  <Icon n="ti-file-text" /> Export All
                </button>
                <button className="hm-new-brief-btn" onClick={onNewBrief}>
                  <Icon n="ti-refresh" /> New brief
                </button>
              </div>
            </div>
          )
        })()}
      </div>

      {/* Right: deliverable cards + follow-up chat */}
      <div className="hm-deliverables-panel">
        {runError && (
          <div className="hm-error-banner">
            <Icon n="ti-alert-triangle" /> {runError}
          </div>
        )}
        {personas.map(p => (
          <DeliverableCard
            key={p.id}
            persona={p}
            state={agentStates[p.id]}
            deliverable={deliverables[p.id]}
            streamingContent={streamingContent?.[p.id]}
            isApproved={approved.has(p.id)}
            isExported={exported.has(p.id)}
            onApprove={() => onApprove(p.id)}
            onExport={() => onExport(p.id)}
          />
        ))}
        {step === 'approve' && doneCount > 0 && (
          <AgentChat
            personas={personas}
            deliverables={deliverables}
            chatMessages={chatMessages}
            setChatMessages={setChatMessages}
            facilityName={facilityName}
            domain={domain}
            provider={provider}
          />
        )}
      </div>
    </div>
  )
}

// ── Agent follow-up chat ──────────────────────────────────────────────
function AgentChat({ personas, deliverables, chatMessages, setChatMessages, facilityName, domain, provider }) {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const endRef = useRef(null)

  useEffect(() => {
    if (endRef.current) endRef.current.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  const send = async () => {
    const msg = input.trim()
    if (!msg || loading) return
    setInput('')

    // parse agent name from message — match against persona names or first names
    let targetPersona = personas.find(p => {
      const lower = msg.toLowerCase()
      return lower.includes(p.name.toLowerCase()) || lower.includes(p.name.split(' ')[0].toLowerCase())
    }) || personas.find(p => p.role === 'ceo') || personas[0]

    setChatMessages(prev => [...prev, { from: 'user', text: msg, ts: new Date() }])
    setLoading(true)

    // build upstream context from all deliverables
    const upstreamParts = Object.entries(deliverables)
      .map(([aid, d]) => `[${personas.find(p => p.id === aid)?.name || aid}]\n${(d?.content || '').slice(0, 600)}`)
    const upstreamContext = upstreamParts.join('\n\n')

    try {
      const resp = await fetch('/api/hive/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: targetPersona.role,
          brief: msg,
          upstream_context: upstreamContext || null,
          facility: facilityName || null,
          domain: domain || null,
          provider: provider || 'claude',
        }),
        signal: AbortSignal.timeout(30000),
      })
      if (resp.ok) {
        const data = await resp.json()
        setChatMessages(prev => [...prev, { from: targetPersona.id, agentName: targetPersona.name, text: data.content || '', ts: new Date() }])
      } else {
        throw new Error(`HTTP ${resp.status}`)
      }
    } catch (e) {
      setChatMessages(prev => [...prev, { from: targetPersona.id, agentName: targetPersona.name, text: `Sorry, I couldn't connect right now. (${e.message})`, ts: new Date() }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface2)', overflow: 'hidden', marginTop: 8 }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700 }}>
        <Icon n="ti-message-circle" style={{ color: '#7A5CF0' }} />
        Ask an agent a follow-up
        <span className="hint" style={{ fontWeight: 400, fontSize: 11 }}>— mention their name or ask Elena by default</span>
      </div>

      {chatMessages.length > 0 && (
        <div style={{ maxHeight: 320, overflowY: 'auto', padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {chatMessages.map((m, i) => {
            const isUser = m.from === 'user'
            const agentColor = personas.find(p => p.id === m.from)?.color || '#7A5CF0'
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: isUser ? 'flex-end' : 'flex-start', gap: 3 }}>
                {!isUser && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: agentColor, textTransform: 'uppercase', letterSpacing: '.06em' }}>
                    {m.agentName}
                  </span>
                )}
                <div style={{
                  maxWidth: '88%', padding: '8px 12px', borderRadius: isUser ? '12px 12px 2px 12px' : '2px 12px 12px 12px',
                  background: isUser ? '#7A5CF0' : 'var(--surface)',
                  color: isUser ? '#fff' : 'var(--text)',
                  fontSize: 12.5, lineHeight: 1.55,
                  border: isUser ? 'none' : '1px solid var(--border)',
                  whiteSpace: 'pre-wrap',
                }}>
                  {m.text}
                </div>
                <span style={{ fontSize: 9, color: 'var(--hint)' }}>{m.ts.toLocaleTimeString()}</span>
              </div>
            )
          })}
          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--hint)' }}>
              <span className="spinner" style={{ width: 12, height: 12 }} /> thinking…
            </div>
          )}
          <div ref={endRef} />
        </div>
      )}

      <div style={{ padding: '10px 14px', display: 'flex', gap: 8, borderTop: chatMessages.length > 0 ? '1px solid var(--border)' : 'none' }}>
        <input
          style={{
            flex: 1, background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '8px 12px', fontSize: 12.5, color: 'var(--text)',
            outline: 'none',
          }}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
          placeholder='e.g. "Elena, what is the biggest risk?" or "Daniel, refine the strategy"'
          disabled={loading}
        />
        <button
          className="hm-cta"
          style={{ padding: '8px 14px', fontSize: 12 }}
          onClick={send}
          disabled={!input.trim() || loading}
        >
          <Icon n="ti-send" />
        </button>
      </div>
    </div>
  )
}

// ── Hive coordination visualisation ──────────────────────────────────
function HiveCoordView({ personas, agentStates, running, doneCount, totalCount }) {
  // map persona id → pixel center for drawing connections
  const posMap = {}
  personas.forEach(p => {
    const { x, y } = hexPosition(p.gridPos)
    posMap[p.id] = { x: x + HEX_W / 2, y: y + HEX_W / 2 }
  })

  const activeIds = new Set(personas.map(p => p.id))
  const relevantConns = CONNECTIONS.filter(([a, b]) => activeIds.has(a) && activeIds.has(b))

  return (
    <div className="hm-hive-view">
      <div className="hm-hive-title">
        {running
          ? <><span className="hm-hive-pulse" /> Hive coordinating…</>
          : doneCount === totalCount && totalCount > 0
            ? <><Icon n="ti-check" /> All agents complete</>
            : 'Agent coordination'
        }
      </div>

      <div className="hm-hex-stage">
        {/* SVG layer for connection lines */}
        <svg className="hm-connections-svg" viewBox={`0 0 380 300`} preserveAspectRatio="xMidYMid meet">
          <defs>
            <linearGradient id="conn-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#7A5CF0" stopOpacity="0.5" />
              <stop offset="100%" stopColor="#0E9E97" stopOpacity="0.5" />
            </linearGradient>
          </defs>
          {relevantConns.map(([a, b]) => {
            const pa = posMap[a], pb = posMap[b]
            if (!pa || !pb) return null
            const stateA = agentStates[a]?.status
            const stateB = agentStates[b]?.status
            const active = stateA === 'working' || stateB === 'working' || stateA === 'done'
            return (
              <line
                key={`${a}-${b}`}
                x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
                stroke={active ? 'url(#conn-grad)' : 'rgba(122,92,240,.12)'}
                strokeWidth={active ? 2 : 1}
                strokeDasharray={active ? 'none' : '4 4'}
                className={active ? 'hm-conn-active' : ''}
              />
            )
          })}
        </svg>

        {/* Hex agent nodes */}
        {personas.map(p => {
          const { x, y } = hexPosition(p.gridPos)
          const s = agentStates[p.id]?.status || 'idle'
          return (
            <div
              key={p.id}
              className={`hm-hex-node hm-hex-${s}`}
              style={{ left: x, top: y, '--agent-color': p.color, '--agent-glow': p.glow }}
            >
              <HexAvatar
                initials={p.initials}
                color={p.color}
                glow={p.glow}
                status={s}
                size={HEX_W}
              />
              <div className="hm-hex-label">
                <div className="hm-hex-name">{p.name.split(' ')[0]}</div>
                <div className="hm-hex-role">{p.deliverable.label}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Tiny utility: hex-shaped icon wrapper ─────────────────────────────
function HexIcon({ size = 40, color, glow, children }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '30%',
      background: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: `0 0 18px ${glow}`, color: '#fff', fontSize: size * 0.42, flexShrink: 0,
    }}>
      {children}
    </div>
  )
}

// ── Recent Briefs (history panel on Onboard step) ─────────────────
function RecentBriefs() {
  const history = loadHistory()
  if (!history.length) return null

  return (
    <div style={{ maxWidth: 560, margin: '20px auto 0', padding: '0 16px' }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--hint)', textTransform: 'uppercase',
        letterSpacing: '.08em', marginBottom: 8 }}>
        <Icon n="ti-history" /> Recent Briefs
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {history.slice(0, 5).map(h => (
          <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
            background: 'var(--surface2)', borderRadius: 8, fontSize: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap',
                overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {h.brief.slice(0, 80) || 'Untitled brief'}
              </div>
              <div style={{ fontSize: 10, color: 'var(--hint)', marginTop: 2 }}>
                {h.facility} · {h.agentsUsed?.length || 0} agents · {h.totalTokens?.toLocaleString() || 0} tokens · {new Date(h.timestamp).toLocaleDateString()}
              </div>
            </div>
            {h.liveCount > 0 && (
              <span style={{ fontSize: 9, color: '#16a34a', fontWeight: 600 }}>● live</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
