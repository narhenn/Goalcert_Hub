// AgentBuilder.jsx — Six-stage agent builder + dashboard for GoalCert Hub.
// Two views: dashboard (agent grid) and builder (6-stage wizard).
// Follows HiveMind.jsx patterns for state, API, and rendering.
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Icon } from '../../lib.jsx'
import API from '../../api.js'

// ── Constants ────────────────────────────────────────────────────────
const ACCENT = '#7C3AED'
const ACCENT_GLOW = 'rgba(124,58,237,.18)'
const STAGE_META = [
  { label: 'Start',      icon: 'ti-rocket',       desc: 'Choose how to begin' },
  { label: 'Define',     icon: 'ti-pencil',       desc: 'Name, persona & prompt' },
  { label: 'Knowledge',  icon: 'ti-book',         desc: 'Upload documents' },
  { label: 'Tools',      icon: 'ti-tool',         desc: 'Select capabilities' },
  { label: 'Guardrails', icon: 'ti-shield-check', desc: 'Rules & test' },
  { label: 'Deploy',     icon: 'ti-send',         desc: 'Go live' },
]

const BUILTIN_AGENTS = [
  { id: 'finance',            name: 'Finance Manager',        initials: 'FM', color: '#16A34A', tagline: 'Financial planning & analysis',    tools: 5, builtin: true },
  { id: 'content',            name: 'Marketing Content',      initials: 'MC', color: '#D97706', tagline: 'Content strategy & creation',      tools: 4, builtin: true },
  { id: 'demandgen',          name: 'Marketing Demand Gen',   initials: 'DG', color: '#7C3AED', tagline: 'Pipeline & lead generation',       tools: 6, builtin: true },
  { id: 'ceo_assistant',      name: 'CEO Assistant',          initials: 'CA', color: '#6D28D9', tagline: 'Executive briefings & synthesis',   tools: 4, builtin: true },
  { id: 'sales_outbound',     name: 'Sales Outbound',         initials: 'SO', color: '#2563EB', tagline: 'Outbound prospecting & outreach',   tools: 5, builtin: true },
  { id: 'sales_qual',         name: 'Sales Qualification',    initials: 'SQ', color: '#E11D48', tagline: 'Lead scoring & qualification',      tools: 5, builtin: true },
  { id: 'personal_assistant', name: 'Personal Assistant',     initials: 'PA', color: '#0D9488', tagline: 'Scheduling & task management',      tools: 3, builtin: true },
]

const PERSONA_OPTIONS = ['Consultative', 'Formal', 'Friendly', 'Technical', 'Direct', 'Warm']

const GUARDRAIL_TYPES = [
  { value: 'content', label: 'Content Filter' },
  { value: 'topic',   label: 'Topic Restriction' },
  { value: 'tone',    label: 'Tone Enforcement' },
  { value: 'safety',  label: 'Safety Rule' },
  { value: 'custom',  label: 'Custom Rule' },
]

const CHANNEL_OPTIONS = [
  { id: 'web',   label: 'Web Widget',  icon: 'ti-browser' },
  { id: 'slack', label: 'Slack',       icon: 'ti-brand-slack' },
  { id: 'email', label: 'Email',       icon: 'ti-mail' },
  { id: 'api',   label: 'REST API',    icon: 'ti-code' },
]

// ── Main component ───────────────────────────────────────────────────
export default function AgentBuilder({ onNav }) {
  const [view, setView] = useState('dashboard')
  const [agents, setAgents] = useState([])
  const [stage, setStage] = useState(0)
  const [agentId, setAgentId] = useState(null)
  const [agent, setAgent] = useState({
    name: '', purpose: '', persona: '', systemPrompt: '',
  })
  const [method, setMethod] = useState('template')
  const [templates, setTemplates] = useState([])
  const [tools, setTools] = useState({})
  const [selectedTools, setSelectedTools] = useState(new Set())
  const [guardrails, setGuardrails] = useState([])
  const [testMessages, setTestMessages] = useState([])
  const [channels, setChannels] = useState(new Set(['web']))
  const [loading, setLoading] = useState(false)
  const [files, setFiles] = useState([])
  const [deploying, setDeploying] = useState(false)
  const [deployed, setDeployed] = useState(false)

  // ── Load agents on mount ─────────────────────────────────────────
  useEffect(() => {
    loadAgents()
  }, [])

  const loadAgents = useCallback(async () => {
    try {
      const res = await fetch('/api/agentbuilder/agents', {
        headers: { 'Content-Type': 'application/json' },
      })
      if (res.ok) {
        const data = await res.json()
        setAgents(data.agents || data || [])
      }
    } catch {
      // API may not exist yet, use empty list
    }
  }, [])

  // ── Stats ────────────────────────────────────────────────────────
  const customAgents = agents.filter(a => !a.builtin)
  const liveAgents = agents.filter(a => a.status === 'live')
  const allAgents = [...BUILTIN_AGENTS, ...customAgents]
  const stats = {
    total: allAgents.length,
    builtin: BUILTIN_AGENTS.length,
    custom: customAgents.length,
    live: liveAgents.length,
  }

  // ── Builder: start new agent ─────────────────────────────────────
  const startBuilder = () => {
    setView('builder')
    setStage(0)
    setAgentId(null)
    setAgent({ name: '', purpose: '', persona: '', systemPrompt: '' })
    setMethod('template')
    setSelectedTools(new Set())
    setGuardrails([])
    setTestMessages([])
    setChannels(new Set(['web']))
    setFiles([])
    setDeployed(false)
    loadTemplates()
    loadTools()
  }

  const loadTemplates = async () => {
    try {
      const res = await fetch('/api/agentbuilder/templates', {
        headers: { 'Content-Type': 'application/json' },
      })
      if (res.ok) {
        const data = await res.json()
        setTemplates(data.templates || data || [])
      }
    } catch {
      // fallback templates
      setTemplates([
        { id: 'support', name: 'Customer Support', description: 'Handles customer inquiries and tickets', persona: 'Friendly', tools: ['knowledge_search', 'ticket_create'] },
        { id: 'analyst', name: 'Data Analyst', description: 'Analyzes data and generates reports', persona: 'Technical', tools: ['data_query', 'chart_gen'] },
        { id: 'onboarding', name: 'Onboarding Guide', description: 'Walks new users through setup', persona: 'Warm', tools: ['knowledge_search', 'checklist'] },
        { id: 'compliance', name: 'Compliance Checker', description: 'Validates processes against policy', persona: 'Formal', tools: ['policy_search', 'audit_log'] },
        { id: 'sales', name: 'Sales Assistant', description: 'Qualifies leads and drafts proposals', persona: 'Consultative', tools: ['crm_search', 'proposal_gen'] },
      ])
    }
  }

  const loadTools = async () => {
    try {
      const res = await fetch('/api/agentbuilder/tools', {
        headers: { 'Content-Type': 'application/json' },
      })
      if (res.ok) {
        const data = await res.json()
        setTools(data.tools || data || {})
      }
    } catch {
      // fallback tool clusters
      setTools({
        'Knowledge': [
          { id: 'knowledge_search', name: 'Knowledge Search', description: 'Search uploaded documents' },
          { id: 'web_search', name: 'Web Search', description: 'Search the internet for information' },
          { id: 'faq_lookup', name: 'FAQ Lookup', description: 'Look up frequently asked questions' },
        ],
        'Communication': [
          { id: 'email_send', name: 'Send Email', description: 'Send emails to users' },
          { id: 'slack_notify', name: 'Slack Notify', description: 'Send Slack notifications' },
          { id: 'ticket_create', name: 'Create Ticket', description: 'Create support tickets' },
        ],
        'Data': [
          { id: 'data_query', name: 'Data Query', description: 'Query structured data' },
          { id: 'chart_gen', name: 'Chart Generator', description: 'Generate charts and visualizations' },
          { id: 'report_gen', name: 'Report Generator', description: 'Generate formatted reports' },
        ],
        'Automation': [
          { id: 'checklist', name: 'Checklist', description: 'Manage step-by-step checklists' },
          { id: 'workflow_trigger', name: 'Workflow Trigger', description: 'Trigger automated workflows' },
          { id: 'scheduler', name: 'Scheduler', description: 'Schedule tasks and reminders' },
        ],
        'Policy': [
          { id: 'policy_search', name: 'Policy Search', description: 'Search compliance policies' },
          { id: 'audit_log', name: 'Audit Logger', description: 'Log audit trail entries' },
          { id: 'approval_gate', name: 'Approval Gate', description: 'Require approval before actions' },
        ],
        'Creative': [
          { id: 'proposal_gen', name: 'Proposal Generator', description: 'Draft proposals and pitches' },
          { id: 'content_writer', name: 'Content Writer', description: 'Generate content drafts' },
          { id: 'crm_search', name: 'CRM Search', description: 'Search CRM records' },
        ],
      })
    }
  }

  // ── Stage navigation ─────────────────────────────────────────────
  const saveStage = async () => {
    if (!agentId) return
    try {
      await fetch(`/api/agentbuilder/agents/${agentId}/stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stage,
          agent,
          tools: [...selectedTools],
          guardrails,
          channels: [...channels],
          files: files.map(f => f.name),
        }),
      })
    } catch {
      // silent — the local state is authoritative
    }
  }

  const nextStage = async () => {
    // On stage 0, create the agent if not yet created
    if (stage === 0 && !agentId) {
      try {
        const res = await fetch('/api/agentbuilder/agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ method, ...agent }),
        })
        if (res.ok) {
          const data = await res.json()
          setAgentId(data.id || data.agent_id || null)
        }
      } catch {
        // proceed with null id, local state is fine
      }
    } else {
      await saveStage()
    }
    setStage(s => Math.min(s + 1, 5))
  }

  const prevStage = () => setStage(s => Math.max(s - 1, 0))

  const exitBuilder = () => {
    setView('dashboard')
    loadAgents()
  }

  // ── Deploy ───────────────────────────────────────────────────────
  const deployAgent = async () => {
    setDeploying(true)
    try {
      await fetch(`/api/agentbuilder/agents/${agentId || 'new'}/deploy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent,
          tools: [...selectedTools],
          guardrails,
          channels: [...channels],
          files: files.map(f => f.name),
        }),
      })
      setDeployed(true)
      // add to local agents list
      setAgents(prev => [...prev, {
        ...agent,
        id: agentId || `custom_${Date.now()}`,
        status: 'live',
        builtin: false,
        tools: selectedTools.size,
        initials: (agent.name || 'CA').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase(),
        color: '#7C3AED',
        tagline: agent.purpose?.slice(0, 40) || 'Custom Agent',
      }])
    } catch {
      // still mark as deployed for demo
      setDeployed(true)
    } finally {
      setDeploying(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="panel">
      {view === 'dashboard' ? (
        <Dashboard
          stats={stats}
          customAgents={customAgents}
          onCreateAgent={startBuilder}
          onNav={onNav}
        />
      ) : (
        <Builder
          stage={stage}
          agent={agent}
          setAgent={setAgent}
          method={method}
          setMethod={setMethod}
          templates={templates}
          tools={tools}
          selectedTools={selectedTools}
          setSelectedTools={setSelectedTools}
          guardrails={guardrails}
          setGuardrails={setGuardrails}
          testMessages={testMessages}
          setTestMessages={setTestMessages}
          channels={channels}
          setChannels={setChannels}
          files={files}
          setFiles={setFiles}
          loading={loading}
          setLoading={setLoading}
          deploying={deploying}
          deployed={deployed}
          agentId={agentId}
          onNext={nextStage}
          onBack={prevStage}
          onExit={exitBuilder}
          onDeploy={deployAgent}
          onNav={onNav}
        />
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// VIEW 1: AGENT DASHBOARD
// ══════════════════════════════════════════════════════════════════════
function Dashboard({ stats, customAgents, onCreateAgent, onNav }) {
  return (
    <>
      {/* Header */}
      <div className="panel-header">
        <div>
          <div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon n="ti-robot" />
            Agent Builder
          </div>
          <div className="panel-subtitle">Create, configure and deploy custom AI agents</div>
        </div>
        <div className="panel-actions">
          <button className="btn btn-primary" onClick={onCreateAgent}>
            <Icon n="ti-plus" /> Create Agent
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid-4 section-gap">
        <StatCard label="Total Agents" value={stats.total} icon="ti-users" color="var(--brand-2)" />
        <StatCard label="Built-in" value={stats.builtin} icon="ti-shield-check" color="var(--brand)" />
        <StatCard label="Custom" value={stats.custom} icon="ti-puzzle" color="var(--accent-blue)" />
        <StatCard label="Live" value={stats.live} icon="ti-broadcast" color="var(--accent-green)" live />
      </div>

      {/* GoalCert Team */}
      <SectionLabel label="GoalCert Team" count={BUILTIN_AGENTS.length} icon="ti-crown" />
      <div className="grid-3 section-gap">
        {BUILTIN_AGENTS.map(a => (
          <AgentCard key={a.id} agent={a} onClick={() => onNav && onNav('chat', { agentId: a.id })} />
        ))}
      </div>

      {/* Your Agents */}
      <SectionLabel label="Your Agents" count={customAgents.length} icon="ti-user-plus" />
      {customAgents.length > 0 ? (
        <div className="grid-3">
          {customAgents.map(a => (
            <AgentCard key={a.id} agent={a} onClick={() => onNav && onNav('chat', { agentId: a.id })} />
          ))}
        </div>
      ) : (
        <div className="empty">
          <Icon n="ti-robot" />
          <div style={{ marginTop: 8, fontWeight: 600 }}>No custom agents yet</div>
          <div style={{ marginTop: 4, fontSize: 11, color: 'var(--hint)' }}>
            Click "Create Agent" to build your first one
          </div>
        </div>
      )}
    </>
  )
}

function StatCard({ label, value, icon, color, live }) {
  return (
    <div className="card kpi">
      <div className="card-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Icon n={icon} />
        {label}
      </div>
      <div className="card-value" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {value}
        {live && value > 0 && (
          <span className="status-dot green live" style={{ width: 8, height: 8 }} />
        )}
      </div>
    </div>
  )
}

function SectionLabel({ label, count, icon }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, marginTop: 8,
      fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase',
      letterSpacing: '.08em',
    }}>
      <Icon n={icon} />
      {label}
      <span className="pill pill-surface" style={{ marginLeft: 4 }}>{count}</span>
    </div>
  )
}

function AgentCard({ agent, onClick }) {
  const initials = agent.initials || (agent.name || 'AG').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const color = agent.color || ACCENT

  return (
    <div className="card" onClick={onClick} style={{ cursor: 'pointer', transition: 'transform .14s, box-shadow .14s' }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(124,58,237,.12)' }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        {/* Avatar circle */}
        <div style={{
          width: 40, height: 40, borderRadius: '50%', background: color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 13, fontWeight: 700, fontFamily: 'var(--mono)',
          flexShrink: 0, boxShadow: `0 0 0 3px ${color}22`,
        }}>
          {initials}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {agent.name}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {agent.tagline}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
        <span className="pill pill-surface">
          <Icon n="ti-tool" /> {agent.tools || 0} tools
        </span>
        {agent.status === 'live' ? (
          <span className="pill pill-green" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span className="status-dot green" style={{ width: 6, height: 6, boxShadow: 'none' }} /> Live
          </span>
        ) : (
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
        )}
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════
// VIEW 2: SIX-STAGE BUILDER
// ══════════════════════════════════════════════════════════════════════
function Builder({
  stage, agent, setAgent, method, setMethod,
  templates, tools, selectedTools, setSelectedTools,
  guardrails, setGuardrails, testMessages, setTestMessages,
  channels, setChannels, files, setFiles,
  loading, setLoading, deploying, deployed, agentId,
  onNext, onBack, onExit, onDeploy, onNav,
}) {
  return (
    <>
      {/* Header with exit */}
      <div className="panel-header">
        <div>
          <div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon n="ti-robot" />
            Create Agent
          </div>
          <div className="panel-subtitle">
            Stage {stage + 1} of 6 — {STAGE_META[stage].desc}
          </div>
        </div>
        <div className="panel-actions">
          <button className="btn" onClick={onExit}>
            <Icon n="ti-x" /> Cancel
          </button>
        </div>
      </div>

      {/* Stage stepper */}
      <Stepper stage={stage} />

      {/* Stage content */}
      <div style={{ marginTop: 20, animation: 'fadeIn .2s ease' }}>
        {stage === 0 && (
          <StageStart
            method={method} setMethod={setMethod}
            templates={templates}
            agent={agent} setAgent={setAgent}
            setSelectedTools={setSelectedTools}
          />
        )}
        {stage === 1 && (
          <StageDefine agent={agent} setAgent={setAgent} setLoading={setLoading} />
        )}
        {stage === 2 && (
          <StageKnowledge files={files} setFiles={setFiles} agentId={agentId} />
        )}
        {stage === 3 && (
          <StageTools tools={tools} selectedTools={selectedTools} setSelectedTools={setSelectedTools} />
        )}
        {stage === 4 && (
          <StageGuardrails
            guardrails={guardrails} setGuardrails={setGuardrails}
            testMessages={testMessages} setTestMessages={setTestMessages}
            agent={agent} agentId={agentId}
          />
        )}
        {stage === 5 && (
          <StageDeploy
            channels={channels} setChannels={setChannels}
            deploying={deploying} deployed={deployed}
            agent={agent}
            onDeploy={onDeploy}
            onNav={onNav}
            onExit={onExit}
          />
        )}
      </div>

      {/* Back / Next navigation */}
      {!deployed && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <button className="btn" onClick={stage === 0 ? onExit : onBack} style={{ gap: 6 }}>
            <Icon n="ti-arrow-left" />
            {stage === 0 ? 'Cancel' : 'Back'}
          </button>
          {stage < 5 && (
            <button className="btn btn-primary" onClick={onNext} style={{ gap: 6 }}>
              Next <Icon n="ti-arrow-right" />
            </button>
          )}
        </div>
      )}
    </>
  )
}

// ── Stepper ──────────────────────────────────────────────────────────
function Stepper({ stage }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 0,
      padding: '16px 0',
      overflowX: 'auto',
    }}>
      {STAGE_META.map((s, i) => {
        const completed = i < stage
        const active = i === stage
        const upcoming = i > stage

        return (
          <React.Fragment key={i}>
            {i > 0 && (
              <div style={{
                flex: 1, height: 2, minWidth: 20, maxWidth: 60,
                background: completed ? 'var(--accent-green)' : 'var(--border)',
                transition: 'background .3s',
              }} />
            )}
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              minWidth: 70, flexShrink: 0,
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 13, fontWeight: 700, fontFamily: 'var(--mono)',
                transition: 'all .3s',
                background: completed ? 'var(--accent-green)'
                  : active ? 'var(--brand)'
                  : 'var(--surface2)',
                color: completed || active ? '#fff' : 'var(--hint)',
                border: active ? '2px solid var(--brand)' : completed ? '2px solid var(--accent-green)' : '2px solid var(--border)',
                boxShadow: active ? '0 0 0 4px var(--brand-ring)' : 'none',
              }}>
                {completed ? <Icon n="ti-check" /> : i + 1}
              </div>
              <div style={{
                fontSize: 10, fontWeight: 600, textAlign: 'center',
                color: active ? 'var(--brand)' : completed ? 'var(--accent-green)' : 'var(--hint)',
                textTransform: 'uppercase', letterSpacing: '.05em',
              }}>
                {s.label}
              </div>
            </div>
          </React.Fragment>
        )
      })}
    </div>
  )
}

// ── Stage 1: Start ───────────────────────────────────────────────────
function StageStart({ method, setMethod, templates, agent, setAgent, setSelectedTools }) {
  const methods = [
    { id: 'template', label: 'From Template', desc: 'Start with a pre-built agent and customize', icon: 'ti-layout-grid', recommended: true },
    { id: 'describe', label: 'Describe It', desc: 'Tell us what you need and AI generates it', icon: 'ti-sparkles', recommended: false },
    { id: 'blank',    label: 'Blank Canvas', desc: 'Build from scratch with full control', icon: 'ti-file-plus', recommended: false },
  ]

  const applyTemplate = (t) => {
    setAgent(prev => ({
      ...prev,
      name: t.name || prev.name,
      purpose: t.description || prev.purpose,
      persona: t.persona || prev.persona,
      systemPrompt: t.systemPrompt || '',
      templateId: t.id,
    }))
    if (t.tools) {
      setSelectedTools(new Set(t.tools))
    }
    setMethod('template')
  }

  return (
    <>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
        Choose how you want to start building your agent.
      </div>

      <div className="grid-3 section-gap">
        {methods.map(m => (
          <div
            key={m.id}
            className="card"
            onClick={() => setMethod(m.id)}
            style={{
              cursor: 'pointer',
              borderColor: method === m.id ? 'var(--brand)' : 'var(--border)',
              boxShadow: method === m.id ? '0 0 0 3px var(--brand-ring)' : 'var(--shadow-sm)',
              transition: 'border-color .15s, box-shadow .15s',
              position: 'relative',
            }}
          >
            {m.recommended && (
              <span className="pill" style={{
                position: 'absolute', top: 10, right: 10,
                background: 'var(--brand-soft)', color: 'var(--brand)',
                fontSize: 9, fontWeight: 700,
              }}>
                Recommended
              </span>
            )}
            <div style={{
              width: 44, height: 44, borderRadius: 12, marginBottom: 12,
              background: method === m.id ? 'var(--brand-soft)' : 'var(--surface2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 20, color: method === m.id ? 'var(--brand)' : 'var(--muted)',
              transition: 'all .15s',
            }}>
              <Icon n={m.icon} />
            </div>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{m.label}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>{m.desc}</div>
          </div>
        ))}
      </div>

      {/* Describe input */}
      {method === 'describe' && (
        <div style={{ marginTop: 16 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6, display: 'block' }}>
            Describe your agent
          </label>
          <textarea
            className="input"
            value={agent.purpose || ''}
            onChange={e => setAgent(prev => ({ ...prev, purpose: e.target.value }))}
            placeholder="e.g. I need an agent that helps new employees navigate company policies, answers HR questions, and guides them through their first-week checklist..."
            rows={4}
            style={{ resize: 'vertical' }}
          />
        </div>
      )}

      {/* Template chips */}
      {(method === 'template' && templates.length > 0) && (
        <div style={{ marginTop: 16 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase',
            letterSpacing: '.08em', marginBottom: 10,
          }}>
            <Icon n="ti-template" /> Templates
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {templates.map(t => (
              <button
                key={t.id}
                className="btn"
                onClick={() => applyTemplate(t)}
                style={{
                  borderColor: agent.templateId === t.id ? 'var(--brand)' : 'var(--border2)',
                  background: agent.templateId === t.id ? 'var(--brand-soft)' : 'var(--surface)',
                  color: agent.templateId === t.id ? 'var(--brand)' : 'var(--text)',
                }}
              >
                {t.name}
              </button>
            ))}
          </div>
          {agent.templateId && (
            <div style={{
              marginTop: 12, padding: '10px 14px', borderRadius: 10,
              background: 'var(--surface2)', border: '1px solid var(--border)',
              fontSize: 12, color: 'var(--muted)', lineHeight: 1.5,
            }}>
              <b style={{ color: 'var(--text)' }}>{agent.name}</b> — {agent.purpose}
            </div>
          )}
        </div>
      )}
    </>
  )
}

// ── Stage 2: Define ──────────────────────────────────────────────────
function StageDefine({ agent, setAgent, setLoading }) {
  const [regenerating, setRegenerating] = useState(false)

  const regeneratePrompt = async () => {
    if (!agent.name && !agent.purpose) return
    setRegenerating(true)
    try {
      const res = await fetch('/api/agentbuilder/generate-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: agent.name,
          purpose: agent.purpose,
          persona: agent.persona,
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setAgent(prev => ({ ...prev, systemPrompt: data.prompt || data.system_prompt || prev.systemPrompt }))
      }
    } catch {
      // generate a local fallback prompt
      const fallback = `You are ${agent.name || 'an AI assistant'}.\n\nPurpose: ${agent.purpose || 'Help users with their tasks.'}\n\nPersona: ${agent.persona || 'Professional'}\n\nGuidelines:\n- Always be helpful and accurate\n- Stay within your defined scope\n- Ask clarifying questions when needed\n- Cite sources when possible`
      setAgent(prev => ({ ...prev, systemPrompt: fallback }))
    } finally {
      setRegenerating(false)
    }
  }

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Name */}
        <div>
          <label style={fieldLabelStyle}>Agent Name</label>
          <input
            className="input"
            value={agent.name || ''}
            onChange={e => setAgent(prev => ({ ...prev, name: e.target.value }))}
            placeholder="e.g. PolicyBot, Sales Coach, Onboarding Guide"
          />
        </div>

        {/* Purpose */}
        <div>
          <label style={fieldLabelStyle}>Purpose</label>
          <textarea
            className="input"
            value={agent.purpose || ''}
            onChange={e => setAgent(prev => ({ ...prev, purpose: e.target.value }))}
            placeholder="What does this agent do? What problems does it solve?"
            rows={3}
            style={{ resize: 'vertical' }}
          />
        </div>

        {/* Persona pills */}
        <div>
          <label style={fieldLabelStyle}>Persona</label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {PERSONA_OPTIONS.map(p => (
              <button
                key={p}
                className="btn"
                onClick={() => setAgent(prev => ({ ...prev, persona: p }))}
                style={{
                  borderColor: agent.persona === p ? 'transparent' : 'var(--border)',
                  background: agent.persona === p ? 'var(--gradient)' : 'var(--surface)',
                  color: agent.persona === p ? '#fff' : 'var(--muted)',
                  fontWeight: agent.persona === p ? 700 : 500,
                  borderRadius: 999,
                }}
              >
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* System prompt */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <label style={{ ...fieldLabelStyle, marginBottom: 0 }}>System Prompt</label>
            <button
              className="btn"
              onClick={regeneratePrompt}
              disabled={regenerating}
              style={{ fontSize: 11, padding: '5px 10px' }}
            >
              {regenerating ? (
                <><span className="spinner" style={{ width: 12, height: 12 }} /> Generating...</>
              ) : (
                <><Icon n="ti-refresh" /> Regenerate</>
              )}
            </button>
          </div>
          <textarea
            className="input"
            value={agent.systemPrompt || ''}
            onChange={e => setAgent(prev => ({ ...prev, systemPrompt: e.target.value }))}
            placeholder="The system prompt defines how your agent behaves. Click Regenerate to auto-generate one from the name and purpose above."
            rows={8}
            style={{ resize: 'vertical', fontFamily: 'var(--mono)', fontSize: 12 }}
          />
          <div style={{ fontSize: 10, color: 'var(--hint)', marginTop: 4 }}>
            {(agent.systemPrompt || '').length} characters
          </div>
        </div>
      </div>
    </>
  )
}

// ── Stage 3: Knowledge ───────────────────────────────────────────────
function StageKnowledge({ files, setFiles, agentId }) {
  const fileInputRef = useRef(null)
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)

  const handleFiles = async (fileList) => {
    if (!fileList || fileList.length === 0) return
    setUploading(true)

    const newFiles = []
    for (const file of fileList) {
      // Try to upload to API
      try {
        const formData = new FormData()
        formData.append('file', file)
        if (agentId) formData.append('agent_id', agentId)

        await fetch('/api/agentbuilder/knowledge/upload', {
          method: 'POST',
          body: formData,
        })
      } catch {
        // silent, file is tracked locally regardless
      }

      newFiles.push({
        name: file.name,
        size: file.size,
        type: file.type,
        uploadedAt: new Date().toISOString(),
      })
    }

    setFiles(prev => [...prev, ...newFiles])
    setUploading(false)
  }

  const removeFile = (idx) => {
    setFiles(prev => prev.filter((_, i) => i !== idx))
  }

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
        Upload documents that your agent can reference. PDFs, text files, and CSVs are supported.
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
        onClick={() => fileInputRef.current?.click()}
        style={{
          padding: '40px 20px',
          border: `2px dashed ${dragOver ? 'var(--brand)' : 'var(--border2)'}`,
          borderRadius: 14,
          background: dragOver ? 'var(--brand-softer)' : 'var(--surface2)',
          textAlign: 'center',
          cursor: 'pointer',
          transition: 'border-color .15s, background .15s',
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          onChange={e => handleFiles(e.target.files)}
          style={{ display: 'none' }}
          accept=".pdf,.txt,.csv,.json,.md,.doc,.docx"
        />
        {uploading ? (
          <>
            <span className="spinner" style={{ width: 24, height: 24, marginBottom: 10, display: 'block', margin: '0 auto 10px' }} />
            <div style={{ fontSize: 13, fontWeight: 600 }}>Uploading...</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 28, color: dragOver ? 'var(--brand)' : 'var(--hint)', marginBottom: 8 }}>
              <Icon n="ti-cloud-upload" />
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: dragOver ? 'var(--brand)' : 'var(--text)' }}>
              Drop files here or click to browse
            </div>
            <div style={{ fontSize: 11, color: 'var(--hint)', marginTop: 4 }}>
              PDF, TXT, CSV, JSON, Markdown, Word
            </div>
          </>
        )}
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase',
            letterSpacing: '.08em',
          }}>
            Uploaded files ({files.length})
          </div>
          {files.map((f, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', borderRadius: 10,
              background: 'var(--surface)', border: '1px solid var(--border)',
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: 8, background: 'var(--surface2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 15, color: 'var(--muted)', flexShrink: 0,
              }}>
                <Icon n="ti-file-text" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {f.name}
                </div>
                <div style={{ fontSize: 10, color: 'var(--hint)', marginTop: 1 }}>
                  {formatSize(f.size)}
                </div>
              </div>
              <button
                className="btn btn-ghost"
                onClick={(e) => { e.stopPropagation(); removeFile(i) }}
                style={{ padding: '4px 8px', fontSize: 13, color: 'var(--accent-red)' }}
              >
                <Icon n="ti-trash" />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

// ── Stage 4: Tools ───────────────────────────────────────────────────
function StageTools({ tools, selectedTools, setSelectedTools }) {
  const toggleTool = (toolId) => {
    setSelectedTools(prev => {
      const next = new Set(prev)
      if (next.has(toolId)) next.delete(toolId)
      else next.add(toolId)
      return next
    })
  }

  const clusters = Object.entries(tools)

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>
          Select the tools your agent can use.
        </div>
        <span className="pill" style={{ background: 'var(--brand-soft)', color: 'var(--brand)' }}>
          {selectedTools.size} selected
        </span>
      </div>

      {clusters.map(([clusterName, clusterTools]) => (
        <div key={clusterName} style={{ marginBottom: 20 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase',
            letterSpacing: '.08em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Icon n="ti-category" />
            {clusterName}
          </div>
          <div className="grid-3">
            {(clusterTools || []).map(tool => {
              const selected = selectedTools.has(tool.id)
              return (
                <div
                  key={tool.id}
                  className="card"
                  onClick={() => toggleTool(tool.id)}
                  style={{
                    cursor: 'pointer',
                    borderColor: selected ? 'var(--brand)' : 'var(--border)',
                    background: selected ? 'var(--brand-soft)' : 'var(--surface)',
                    transition: 'border-color .15s, background .15s',
                    padding: 14,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 8,
                      background: selected ? 'var(--brand-soft)' : 'var(--surface2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, color: selected ? 'var(--brand)' : 'var(--hint)',
                      transition: 'all .15s',
                    }}>
                      {selected ? <Icon n="ti-check" /> : <Icon n="ti-tool" />}
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 12.5 }}>{tool.name}</div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.45 }}>
                    {tool.description}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </>
  )
}

// ── Stage 5: Guardrails + Test ───────────────────────────────────────
function StageGuardrails({ guardrails, setGuardrails, testMessages, setTestMessages, agent, agentId }) {
  const [ruleType, setRuleType] = useState('content')
  const [ruleText, setRuleText] = useState('')
  const [testInput, setTestInput] = useState('')
  const [testLoading, setTestLoading] = useState(false)
  const chatEndRef = useRef(null)

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
  }, [testMessages])

  const addGuardrail = () => {
    if (!ruleText.trim()) return
    setGuardrails(prev => [
      ...prev,
      { id: Date.now(), type: ruleType, text: ruleText.trim() },
    ])
    setRuleText('')
  }

  const removeGuardrail = (id) => {
    setGuardrails(prev => prev.filter(g => g.id !== id))
  }

  const sendTestMessage = async () => {
    const msg = testInput.trim()
    if (!msg || testLoading) return
    setTestInput('')
    setTestMessages(prev => [...prev, { from: 'user', text: msg, ts: new Date() }])
    setTestLoading(true)

    try {
      const res = await fetch('/api/agentbuilder/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: agentId,
          message: msg,
          system_prompt: agent.systemPrompt || '',
          guardrails,
        }),
      })

      if (res.ok) {
        // Try SSE streaming
        const contentType = res.headers.get('content-type') || ''
        if (contentType.includes('text/event-stream')) {
          const reader = res.body.getReader()
          const decoder = new TextDecoder()
          let accumulated = ''

          setTestMessages(prev => [...prev, { from: 'agent', text: '', ts: new Date(), streaming: true }])

          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            const chunk = decoder.decode(value, { stream: true })
            const lines = chunk.split('\n')
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                try {
                  const parsed = JSON.parse(line.slice(6))
                  accumulated += parsed.content || parsed.delta || ''
                  setTestMessages(prev => {
                    const next = [...prev]
                    next[next.length - 1] = { ...next[next.length - 1], text: accumulated }
                    return next
                  })
                } catch {
                  // non-JSON SSE line
                  accumulated += line.slice(6)
                  setTestMessages(prev => {
                    const next = [...prev]
                    next[next.length - 1] = { ...next[next.length - 1], text: accumulated }
                    return next
                  })
                }
              }
            }
          }
          // Finalize streaming
          setTestMessages(prev => {
            const next = [...prev]
            next[next.length - 1] = { ...next[next.length - 1], streaming: false }
            return next
          })
        } else {
          // Regular JSON response
          const data = await res.json()
          setTestMessages(prev => [...prev, {
            from: 'agent',
            text: data.response || data.content || data.message || 'No response received.',
            ts: new Date(),
          }])
        }
      } else {
        throw new Error(`HTTP ${res.status}`)
      }
    } catch (e) {
      setTestMessages(prev => [...prev, {
        from: 'agent',
        text: `Test mode: "${msg}" received. In production this would be processed by ${agent.name || 'your agent'} with ${guardrails.length} guardrail${guardrails.length !== 1 ? 's' : ''} applied.`,
        ts: new Date(),
      }])
    } finally {
      setTestLoading(false)
    }
  }

  return (
    <div className="grid-2" style={{ alignItems: 'start', gap: 20 }}>
      {/* Left: Guardrail rules */}
      <div>
        <div style={{
          fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase',
          letterSpacing: '.08em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <Icon n="ti-shield-check" />
          Guardrail Rules ({guardrails.length})
        </div>

        {/* Add rule form */}
        <div style={{
          display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap',
        }}>
          <select
            className="select"
            value={ruleType}
            onChange={e => setRuleType(e.target.value)}
            style={{ width: 150, flexShrink: 0 }}
          >
            {GUARDRAIL_TYPES.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <input
            className="input"
            value={ruleText}
            onChange={e => setRuleText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addGuardrail()}
            placeholder="e.g. Never discuss competitor pricing"
            style={{ flex: 1, minWidth: 180 }}
          />
          <button className="btn btn-primary" onClick={addGuardrail} style={{ flexShrink: 0 }}>
            <Icon n="ti-plus" /> Add
          </button>
        </div>

        {/* Rules list */}
        {guardrails.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {guardrails.map(g => (
              <div key={g.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 12px', borderRadius: 10,
                background: 'var(--surface)', border: '1px solid var(--border)',
              }}>
                <span className={`pill pill-${g.type === 'safety' ? 'red' : g.type === 'tone' ? 'amber' : g.type === 'topic' ? 'blue' : 'purple'}`}
                  style={{ flexShrink: 0 }}>
                  {g.type}
                </span>
                <div style={{ flex: 1, fontSize: 12, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {g.text}
                </div>
                <button
                  className="btn btn-ghost"
                  onClick={() => removeGuardrail(g.id)}
                  style={{ padding: '2px 6px', fontSize: 12, color: 'var(--accent-red)' }}
                >
                  <Icon n="ti-x" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty" style={{ padding: '20px 14px' }}>
            No guardrails added yet. Add rules to control your agent's behavior.
          </div>
        )}
      </div>

      {/* Right: Test chat */}
      <div style={{
        border: '1px solid var(--border)', borderRadius: 14,
        background: 'var(--surface)', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        minHeight: 360,
      }}>
        <div style={{
          padding: '10px 14px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase',
          letterSpacing: '.06em',
        }}>
          <Icon n="ti-message-circle" style={{ color: 'var(--brand)' }} />
          Test Chat
          {testMessages.length > 0 && (
            <button
              className="btn btn-ghost"
              onClick={() => setTestMessages([])}
              style={{ marginLeft: 'auto', fontSize: 10, padding: '2px 8px' }}
            >
              Clear
            </button>
          )}
        </div>

        {/* Messages */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '12px 14px',
          display: 'flex', flexDirection: 'column', gap: 10,
          minHeight: 220,
        }}>
          {testMessages.length === 0 && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--hint)', fontSize: 12, textAlign: 'center' }}>
              Send a message to test your agent's responses with guardrails applied.
            </div>
          )}
          {testMessages.map((m, i) => {
            const isUser = m.from === 'user'
            return (
              <div key={i} style={{
                display: 'flex', flexDirection: 'column',
                alignItems: isUser ? 'flex-end' : 'flex-start', gap: 3,
              }}>
                {!isUser && (
                  <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                    {agent.name || 'Agent'}
                  </span>
                )}
                <div style={{
                  maxWidth: '88%', padding: '8px 12px',
                  borderRadius: isUser ? '12px 12px 2px 12px' : '2px 12px 12px 12px',
                  background: isUser ? 'var(--gradient)' : 'var(--surface2)',
                  color: isUser ? '#fff' : 'var(--text)',
                  fontSize: 12.5, lineHeight: 1.55,
                  border: isUser ? 'none' : '1px solid var(--border)',
                  whiteSpace: 'pre-wrap',
                }}>
                  {m.text}
                  {m.streaming && <span className="spinner" style={{ width: 10, height: 10, marginLeft: 6 }} />}
                </div>
                <span style={{ fontSize: 9, color: 'var(--hint)' }}>{m.ts.toLocaleTimeString()}</span>
              </div>
            )
          })}
          {testLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--hint)' }}>
              <span className="spinner" style={{ width: 12, height: 12 }} /> thinking...
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Input */}
        <div style={{
          padding: '10px 14px', borderTop: '1px solid var(--border)',
          display: 'flex', gap: 8,
        }}>
          <input
            className="input"
            value={testInput}
            onChange={e => setTestInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendTestMessage()}
            placeholder="Type a test message..."
            disabled={testLoading}
            style={{ flex: 1 }}
          />
          <button
            className="btn btn-primary"
            onClick={sendTestMessage}
            disabled={!testInput.trim() || testLoading}
            style={{ padding: '8px 14px' }}
          >
            <Icon n="ti-send" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Stage 6: Deploy ──────────────────────────────────────────────────
function StageDeploy({ channels, setChannels, deploying, deployed, agent, onDeploy, onNav, onExit }) {
  const toggleChannel = (id) => {
    setChannels(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (deployed) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', margin: '0 auto 16px',
          background: 'rgba(22,163,74,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 28, color: '#16A34A',
        }}>
          <Icon n="ti-check" />
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--display)', marginBottom: 6 }}>
          Agent Deployed
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
          <b>{agent.name || 'Your agent'}</b> is now live on {channels.size} channel{channels.size !== 1 ? 's' : ''}.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 24 }}>
          <span className="pill pill-green" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
            <span className="status-dot green live" style={{ width: 7, height: 7 }} />
            Live
          </span>
          {[...channels].map(ch => (
            <span key={ch} className="pill pill-surface">{ch}</span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button className="btn btn-primary" onClick={() => onNav && onNav('chat', { agentId: agent.name })} style={{ gap: 6 }}>
            <Icon n="ti-message-circle" /> Open Team Chat
          </button>
          <button className="btn" onClick={onExit} style={{ gap: 6 }}>
            <Icon n="ti-layout-dashboard" /> Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
        Select which channels your agent will be available on, then deploy.
      </div>

      {/* Agent summary */}
      <div className="card" style={{ marginBottom: 20, borderLeft: '3px solid var(--brand)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%', background: 'var(--gradient)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 15, fontWeight: 700, fontFamily: 'var(--mono)',
            flexShrink: 0,
          }}>
            {(agent.name || 'AG').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{agent.name || 'Unnamed Agent'}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{agent.purpose || 'No description'}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              {agent.persona && <span className="pill pill-purple">{agent.persona}</span>}
              <span className="pill pill-surface">{(agent.systemPrompt || '').length} chars prompt</span>
            </div>
          </div>
        </div>
      </div>

      {/* Channel selection */}
      <div style={{
        fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase',
        letterSpacing: '.08em', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <Icon n="ti-broadcast" />
        Channels ({channels.size} selected)
      </div>

      <div className="grid-4 section-gap">
        {CHANNEL_OPTIONS.map(ch => {
          const selected = channels.has(ch.id)
          return (
            <div
              key={ch.id}
              className="card"
              onClick={() => toggleChannel(ch.id)}
              style={{
                cursor: 'pointer', textAlign: 'center', padding: 20,
                borderColor: selected ? 'var(--brand)' : 'var(--border)',
                background: selected ? 'var(--brand-softer)' : 'var(--surface)',
                boxShadow: selected ? '0 0 0 3px var(--brand-ring)' : 'var(--shadow-sm)',
                transition: 'all .15s',
              }}
            >
              <div style={{
                fontSize: 26, marginBottom: 8,
                color: selected ? 'var(--brand)' : 'var(--hint)',
                transition: 'color .15s',
              }}>
                <Icon n={ch.icon} />
              </div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{ch.label}</div>
              {selected && (
                <div style={{ marginTop: 6 }}>
                  <span className="pill" style={{ background: 'var(--brand-soft)', color: 'var(--brand)', fontSize: 9 }}>
                    Enabled
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Deploy button */}
      <div style={{ textAlign: 'center', marginTop: 28 }}>
        <button
          className="btn btn-primary"
          onClick={onDeploy}
          disabled={deploying || channels.size === 0}
          style={{
            padding: '12px 32px', fontSize: 14, fontWeight: 700,
            background: channels.size > 0 ? 'var(--gradient)' : undefined,
          }}
        >
          {deploying ? (
            <><span className="spinner" style={{ width: 14, height: 14 }} /> Deploying...</>
          ) : (
            <><Icon n="ti-rocket" /> Deploy Agent</>
          )}
        </button>
        {channels.size === 0 && (
          <div style={{ fontSize: 11, color: 'var(--accent-red)', marginTop: 8 }}>
            Select at least one channel to deploy
          </div>
        )}
      </div>
    </>
  )
}

// ── Shared style objects ─────────────────────────────────────────────
const fieldLabelStyle = {
  fontSize: 11, fontWeight: 600, color: 'var(--muted)',
  textTransform: 'uppercase', letterSpacing: '.06em',
  marginBottom: 6, display: 'block',
}
