// TeamChat.jsx — Group chat with the GoalCert AI team.
// The user types one message, a router picks the right agents, and all agents
// stream their work into the same thread via SSE.
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { authHeaders } from '../../api.js'

// ── Agent color palette (for avatars) ────────────────────────────────
const AGENT_COLORS = {
  finance:            '#10B981',
  content:            '#F59E0B',
  demandgen:          '#8B5CF6',
  ceo_assistant:      '#7C3AED',
  sales_outbound:     '#06B6D4',
  sales_qual:         '#EC4899',
  personal_assistant: '#EF4444',
}

const FALLBACK_COLORS = [
  '#10B981', '#F59E0B', '#8B5CF6', '#7C3AED',
  '#06B6D4', '#EC4899', '#EF4444', '#6366F1',
]

function agentColor(agentId) {
  if (AGENT_COLORS[agentId]) return AGENT_COLORS[agentId]
  // deterministic fallback
  let hash = 0
  for (let i = 0; i < (agentId || '').length; i++) hash = (hash * 31 + agentId.charCodeAt(i)) | 0
  return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length]
}

function agentInitials(name) {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

// ── Minimal markdown renderer ────────────────────────────────────────
function renderMarkdown(text) {
  if (!text) return ''
  const lines = text.split('\n')
  const html = []
  let inCode = false
  let codeLines = []
  let inTable = false
  let tableRows = []
  let inList = false
  let listItems = []

  const flushList = () => {
    if (inList && listItems.length) {
      html.push('<ul style="margin:6px 0;padding-left:18px">' + listItems.join('') + '</ul>')
      listItems = []
    }
    inList = false
  }

  const flushTable = () => {
    if (inTable && tableRows.length) {
      const headerCells = tableRows[0]
      let rows = tableRows.slice(1)
      // skip separator row (---|---|---)
      if (rows.length && /^[\s|:-]+$/.test(rows[0].map(c => c.trim()).join('|'))) {
        rows = rows.slice(1)
      }
      let t = '<div style="overflow-x:auto;margin:8px 0"><table style="border-collapse:collapse;width:100%;font-size:12px">'
      t += '<thead><tr>' + headerCells.map(c =>
        `<th style="text-align:left;padding:6px 10px;background:#F3EFFC;border-bottom:2px solid #DDD9EA;font-weight:600;color:#6D28D9;font-size:11px">${inline(c.trim())}</th>`
      ).join('') + '</tr></thead>'
      t += '<tbody>'
      rows.forEach((cells, ri) => {
        t += '<tr>' + cells.map(c =>
          `<td style="padding:6px 10px;border-bottom:1px solid #EBE9F2;font-size:12px">${inline(c.trim())}</td>`
        ).join('') + '</tr>'
      })
      t += '</tbody></table></div>'
      html.push(t)
      tableRows = []
    }
    inTable = false
  }

  const inline = (s) => {
    return s
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/`([^`]+)`/g, '<code style="font-family:var(--mono);font-size:11px;background:#F3EFFC;border:1px solid #DDD9EA;border-radius:4px;padding:1px 5px;color:#6D28D9">$1</code>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // code block fence
    if (line.trimStart().startsWith('```')) {
      if (inCode) {
        html.push(
          '<pre style="margin:8px 0;padding:12px 14px;background:#F4F3F9;border:1px solid #EBE9F2;border-radius:8px;overflow-x:auto;font-family:var(--mono);font-size:11.5px;line-height:1.55;color:#16131F"><code>' +
          codeLines.map(l => l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')).join('\n') +
          '</code></pre>'
        )
        codeLines = []
        inCode = false
      } else {
        flushList()
        flushTable()
        inCode = true
      }
      continue
    }
    if (inCode) { codeLines.push(line); continue }

    // table rows
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      flushList()
      const cells = line.trim().slice(1, -1).split('|')
      if (!inTable) inTable = true
      tableRows.push(cells)
      continue
    } else if (inTable) {
      flushTable()
    }

    // list items
    if (/^\s*[-*]\s+/.test(line)) {
      flushTable()
      if (!inList) inList = true
      const content = line.replace(/^\s*[-*]\s+/, '')
      listItems.push(`<li style="margin:3px 0">${inline(content)}</li>`)
      continue
    } else if (inList) {
      flushList()
    }

    // numbered list
    if (/^\s*\d+\.\s+/.test(line)) {
      flushTable()
      const content = line.replace(/^\s*\d+\.\s+/, '')
      html.push(`<div style="margin:2px 0;padding-left:6px">${inline(content)}</div>`)
      continue
    }

    // headers
    if (line.startsWith('### ')) {
      html.push(`<h3 style="font-size:13px;font-weight:700;margin:12px 0 4px;color:#6D28D9;font-family:var(--display)">${inline(line.slice(4))}</h3>`)
      continue
    }
    if (line.startsWith('## ')) {
      html.push(`<h3 style="font-size:14px;font-weight:700;margin:14px 0 5px;color:#16131F;font-family:var(--display)">${inline(line.slice(3))}</h3>`)
      continue
    }
    if (line.startsWith('# ')) {
      html.push(`<h3 style="font-size:15px;font-weight:700;margin:16px 0 6px;color:#16131F;font-family:var(--display)">${inline(line.slice(2))}</h3>`)
      continue
    }

    // horizontal rule
    if (/^---+$/.test(line.trim())) {
      html.push('<hr style="border:none;border-top:1px solid #EBE9F2;margin:10px 0" />')
      continue
    }

    // empty line
    if (!line.trim()) {
      html.push('<div style="height:6px"></div>')
      continue
    }

    // paragraph
    html.push(`<p style="margin:0 0 6px;line-height:1.6">${inline(line)}</p>`)
  }

  // flush remaining
  if (inCode && codeLines.length) {
    html.push(
      '<pre style="margin:8px 0;padding:12px 14px;background:#F4F3F9;border:1px solid #EBE9F2;border-radius:8px;overflow-x:auto;font-family:var(--mono);font-size:11.5px;line-height:1.55;color:#16131F"><code>' +
      codeLines.map(l => l.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')).join('\n') +
      '</code></pre>'
    )
  }
  flushList()
  flushTable()

  return html.join('')
}

// ── Main component ───────────────────────────────────────────────────
export default function TeamChat({ onBack }) {
  const [messages, setMessages] = useState([])   // {type, agentId?, agentName?, content, color?, artifact?}
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [sessionId] = useState(() => 'team_' + Date.now().toString(36))

  const messagesEndRef = useRef(null)
  const chatAreaRef = useRef(null)
  const textareaRef = useRef(null)
  const abortRef = useRef(null)

  // auto-scroll on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  // auto-resize textarea
  const handleInputChange = (e) => {
    setInput(e.target.value)
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = 'auto'
      ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'
    }
  }

  // ── SSE streaming ──────────────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || streaming) return

    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    // add user message
    setMessages(prev => [...prev, { type: 'user', content: text }])
    setStreaming(true)

    // track active agent messages by agentId for streaming appends
    const agentContentMap = {}

    try {
      const controller = new AbortController()
      abortRef.current = controller

      const resp = await fetch('/api/agentbuilder/team/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
        body: JSON.stringify({ message: text, session_id: sessionId }),
        signal: controller.signal,
      })

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${resp.statusText}`)
      }

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (!raw || raw === '[DONE]') continue

          let event
          try { event = JSON.parse(raw) } catch { continue }

          const evType = event.type || event.event

          switch (evType) {
            case 'routing': {
              setMessages(prev => [...prev, {
                type: 'system',
                content: 'Figuring out who should handle this...',
              }])
              break
            }

            case 'routed': {
              const names = (event.agent_names || event.agents || []).join(', ')
              setMessages(prev => [...prev, {
                type: 'system',
                content: event.text || `Routing to: ${names}`,
              }])
              break
            }

            case 'agent_start': {
              const aid = event.agent_id
              const aname = event.agent_name || aid
              const color = agentColor(aid)
              agentContentMap[aid] = ''
              setMessages(prev => [...prev, {
                type: 'agent',
                agentId: aid,
                agentName: aname,
                color: color,
                content: '',
              }])
              break
            }

            case 'text': {
              const aid = event.agent_id
              agentContentMap[aid] = (agentContentMap[aid] || '') + (event.text || '')
              const updatedContent = agentContentMap[aid]
              setMessages(prev => {
                const updated = [...prev]
                // find the last agent message for this agent
                for (let i = updated.length - 1; i >= 0; i--) {
                  if (updated[i].type === 'agent' && updated[i].agentId === aid) {
                    updated[i] = { ...updated[i], content: updatedContent }
                    break
                  }
                }
                return updated
              })
              break
            }

            case 'narration': {
              const aid = event.agent_id
              setMessages(prev => [...prev, {
                type: 'narration',
                agentId: aid,
                content: event.text || `Using tool: ${event.tool || 'unknown'}`,
              }])
              break
            }

            case 'tool_result': {
              const aid = event.agent_id
              setMessages(prev => [...prev, {
                type: 'narration',
                agentId: aid,
                content: event.summary || `Tool ${event.tool} completed`,
              }])
              break
            }

            case 'artifact': {
              setMessages(prev => [...prev, {
                type: 'artifact',
                agentId: event.agent_id,
                content: event.title || 'Download',
                artifact: {
                  type: event.artifact_type,
                  title: event.title,
                  url: event.url,
                },
              }])
              break
            }

            case 'agent_done': {
              const aid = event.agent_id
              const tokens = event.tokens || 0
              const model = event.model || ''
              setMessages(prev => [...prev, {
                type: 'narration',
                agentId: aid,
                content: `Done${tokens ? ` (${tokens.toLocaleString()} tokens` : ''}${model ? `, ${model}` : ''}${tokens ? ')' : ''}`,
              }])
              break
            }

            case 'team_done': {
              const agents = event.agents_used || 0
              const tokens = event.total_tokens || 0
              const cost = event.cost || 0
              setMessages(prev => [...prev, {
                type: 'system',
                content: `All done. ${agents} agent${agents !== 1 ? 's' : ''} used` +
                  (tokens ? ` | ${tokens.toLocaleString()} tokens` : '') +
                  (cost ? ` | $${cost.toFixed(4)}` : ''),
              }])
              break
            }

            case 'agent_error': {
              setMessages(prev => [...prev, {
                type: 'system',
                content: `Error from ${event.agent_id}: ${event.message || 'Unknown error'}`,
                isError: true,
              }])
              break
            }

            case 'error': {
              setMessages(prev => [...prev, {
                type: 'system',
                content: event.message || event.text || 'Stream error',
                isError: true,
              }])
              break
            }

            default:
              break
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setMessages(prev => [...prev, {
          type: 'system',
          content: `Connection error: ${err.message}`,
          isError: true,
        }])
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }, [input, streaming, sessionId])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const stopStreaming = () => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
  }

  // ── Render ─────────────────────────────────────────────────────────
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--bg, #F7F7FB)', borderRadius: 16, overflow: 'hidden',
      border: '1px solid var(--border, #EBE9F2)',
    }}>

      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '14px 20px',
        background: '#fff',
        borderBottom: '1px solid var(--border, #EBE9F2)',
        flexShrink: 0,
      }}>
        {onBack && (
          <button
            onClick={onBack}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 32, borderRadius: 8,
              background: 'var(--surface2, #F4F3F9)', border: '1px solid var(--border, #EBE9F2)',
              color: 'var(--muted, #6B7280)', cursor: 'pointer', fontSize: 16, flexShrink: 0,
              transition: 'all .15s',
            }}
            onMouseEnter={e => { e.target.style.background = '#F3EFFC'; e.target.style.color = '#7C3AED' }}
            onMouseLeave={e => { e.target.style.background = 'var(--surface2, #F4F3F9)'; e.target.style.color = 'var(--muted, #6B7280)' }}
            title="Back"
          >
            <i className="ti ti-arrow-left" />
          </button>
        )}

        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: 'linear-gradient(135deg, #7C3AED 0%, #2563EB 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(124,58,237,.18)',
          flexShrink: 0,
        }}>
          <i className="ti ti-message-chatbot" style={{ fontSize: 18, color: '#fff' }} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--display)', fontWeight: 600, fontSize: 15,
            color: 'var(--text, #16131F)', letterSpacing: '-.01em',
          }}>
            GoalCert Team Chat
          </div>
          <div style={{
            fontSize: 11, color: 'var(--brand, #6D28D9)', fontFamily: 'var(--mono)',
            display: 'flex', alignItems: 'center', gap: 6, marginTop: 2,
          }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%', background: '#10B981',
              boxShadow: '0 0 8px rgba(16,185,129,.4)',
              animation: 'pulse 1.8s ease-in-out infinite',
              display: 'inline-block',
            }} />
            7 agents online
          </div>
        </div>

        {streaming && (
          <button
            onClick={stopStreaming}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 8,
              background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.3)',
              color: '#EF4444', cursor: 'pointer', fontSize: 11, fontWeight: 600,
              fontFamily: 'var(--font)',
            }}
          >
            <i className="ti ti-player-stop-filled" style={{ fontSize: 12 }} />
            Stop
          </button>
        )}

        <div style={{
          fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted, #6B7280)',
          background: 'var(--surface2, #F4F3F9)', border: '1px solid var(--border, #EBE9F2)',
          borderRadius: 6, padding: '4px 8px', flexShrink: 0,
        }}>
          {messages.filter(m => m.type === 'user').length} messages
        </div>
      </div>

      {/* ── Messages area ── */}
      <div
        ref={chatAreaRef}
        style={{
          flex: 1, overflowY: 'auto', padding: '20px 20px 10px',
          display: 'flex', flexDirection: 'column', gap: 6,
          minHeight: 0,
        }}
      >
        {messages.length === 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', flex: 1, gap: 16, padding: '60px 20px',
          }}>
            <div style={{
              width: 64, height: 64, borderRadius: 16,
              background: '#F3EFFC',
              border: '1px solid var(--border, #EBE9F2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <i className="ti ti-messages" style={{ fontSize: 28, color: 'var(--brand, #6D28D9)' }} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                fontFamily: 'var(--display)', fontSize: 16, fontWeight: 600,
                color: 'var(--text, #16131F)', marginBottom: 6,
              }}>
                Talk to the team
              </div>
              <div style={{
                fontSize: 12.5, color: 'var(--muted, #6B7280)', lineHeight: 1.6, maxWidth: 400,
              }}>
                Ask anything. The router will figure out which agents should respond and
                they will stream their work into this thread in real time.
              </div>
            </div>

            {/* Suggestion chips */}
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center',
              marginTop: 8, maxWidth: 520,
            }}>
              {[
                'Draft a sales outreach for a defence client',
                'Analyse our Q3 financials and flag risks',
                'Create a demand gen campaign plan',
                'Summarise this week across all verticals',
              ].map(s => (
                <button
                  key={s}
                  onClick={() => { setInput(s); textareaRef.current?.focus() }}
                  style={{
                    padding: '7px 14px', borderRadius: 999,
                    background: '#F3EFFC', border: '1px solid var(--border, #EBE9F2)',
                    color: 'var(--muted, #6B7280)', fontSize: 11.5, cursor: 'pointer',
                    fontFamily: 'var(--font)', transition: 'all .15s',
                  }}
                  onMouseEnter={e => { e.target.style.background = '#E9E0FB'; e.target.style.color = '#6D28D9'; e.target.style.borderColor = '#DDD9EA' }}
                  onMouseLeave={e => { e.target.style.background = '#F3EFFC'; e.target.style.color = 'var(--muted, #6B7280)'; e.target.style.borderColor = 'var(--border, #EBE9F2)' }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, idx) => {
          // ── System message ──
          if (msg.type === 'system') {
            return (
              <div key={idx} style={{
                display: 'flex', justifyContent: 'center',
                padding: '4px 0', animation: 'fadeIn .2s ease',
              }}>
                <div style={{
                  fontSize: 11, color: msg.isError ? '#EF4444' : 'var(--hint, #9AA1AD)',
                  fontFamily: 'var(--mono)',
                  background: msg.isError ? 'rgba(239,68,68,.06)' : 'var(--surface2, #F4F3F9)',
                  border: `1px solid ${msg.isError ? 'rgba(239,68,68,.15)' : 'var(--border, #EBE9F2)'}`,
                  borderRadius: 999, padding: '5px 14px',
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  {msg.isError
                    ? <i className="ti ti-alert-triangle" style={{ fontSize: 12 }} />
                    : <i className="ti ti-route" style={{ fontSize: 12 }} />
                  }
                  {msg.content}
                </div>
              </div>
            )
          }

          // ── User message ──
          if (msg.type === 'user') {
            return (
              <div key={idx} style={{
                display: 'flex', justifyContent: 'flex-end',
                padding: '6px 0', animation: 'fadeIn .2s ease',
              }}>
                <div style={{
                  maxWidth: '72%', padding: '10px 16px',
                  background: 'linear-gradient(135deg, #7C3AED 0%, #2563EB 100%)',
                  border: 'none',
                  borderRadius: '14px 14px 4px 14px',
                  fontSize: 13, lineHeight: 1.6, color: '#fff',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {msg.content}
                </div>
              </div>
            )
          }

          // ── Narration (tool calls) ──
          if (msg.type === 'narration') {
            return (
              <div key={idx} style={{
                padding: '2px 0 2px 52px',
                animation: 'fadeIn .15s ease',
              }}>
                <div style={{
                  fontSize: 11, color: 'var(--muted, #6B7280)',
                  fontFamily: 'var(--mono)', fontStyle: 'italic',
                  display: 'flex', alignItems: 'center', gap: 6,
                  paddingLeft: 4,
                }}>
                  <i className="ti ti-terminal-2" style={{ fontSize: 11, opacity: 0.6 }} />
                  {msg.content}
                </div>
              </div>
            )
          }

          // ── Artifact (download card) ──
          if (msg.type === 'artifact') {
            const art = msg.artifact || {}
            return (
              <div key={idx} style={{
                padding: '4px 0 4px 52px',
                animation: 'fadeIn .2s ease',
              }}>
                <a
                  href={art.url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 10,
                    padding: '10px 16px', borderRadius: 10,
                    background: 'var(--surface, #fff)',
                    border: '1px solid var(--border, #EBE9F2)',
                    color: 'var(--brand, #6D28D9)', textDecoration: 'none',
                    transition: 'all .15s', cursor: 'pointer',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#F3EFFC'; e.currentTarget.style.borderColor = '#DDD9EA' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface, #fff)'; e.currentTarget.style.borderColor = 'var(--border, #EBE9F2)' }}
                >
                  <i className="ti ti-file-download" style={{ fontSize: 18 }} />
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>
                      {art.title || 'Artifact'}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--muted, #6B7280)', marginTop: 1 }}>
                      {art.type || 'file'} — click to download
                    </div>
                  </div>
                  <i className="ti ti-external-link" style={{ fontSize: 14, marginLeft: 6, opacity: 0.6 }} />
                </a>
              </div>
            )
          }

          // ── Agent message ──
          if (msg.type === 'agent') {
            const color = msg.color || agentColor(msg.agentId)
            const initials = agentInitials(msg.agentName)
            const isStreaming = streaming && idx === findLastAgentIdx(messages, msg.agentId)
            return (
              <div key={idx} style={{
                display: 'flex', gap: 10, alignItems: 'flex-start',
                padding: '8px 0', animation: 'fadeIn .2s ease',
                maxWidth: '88%',
              }}>
                {/* Avatar */}
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, color: '#fff', fontFamily: 'var(--mono)',
                  boxShadow: `0 0 14px ${color}33`,
                  marginTop: 2,
                }}>
                  {initials}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Agent name label */}
                  <div style={{
                    fontSize: 10.5, fontWeight: 700, color: color,
                    textTransform: 'uppercase', letterSpacing: '.06em',
                    marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    {msg.agentName || msg.agentId}
                    {isStreaming && (
                      <span style={{
                        display: 'inline-block', width: 6, height: 6,
                        borderRadius: '50%', background: color,
                        animation: 'pulse 1s ease-in-out infinite',
                      }} />
                    )}
                  </div>

                  {/* Message body */}
                  <div style={{
                    padding: '10px 14px',
                    background: 'var(--surface, #fff)',
                    border: '1px solid var(--border, #EBE9F2)',
                    borderRadius: '4px 14px 14px 14px',
                    fontSize: 12.5, lineHeight: 1.65, color: 'var(--text, #16131F)',
                    wordBreak: 'break-word',
                    position: 'relative',
                  }}>
                    {msg.content ? (
                      <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                    ) : (
                      isStreaming && (
                        <div style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          color: 'var(--muted, #6B7280)', fontSize: 12,
                        }}>
                          <span className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} />
                          Thinking...
                        </div>
                      )
                    )}
                    {isStreaming && msg.content && (
                      <span style={{
                        display: 'inline-block', width: 2, height: 14,
                        background: color, marginLeft: 2,
                        animation: 'pulse 0.8s ease-in-out infinite',
                        verticalAlign: 'text-bottom',
                      }} />
                    )}
                  </div>
                </div>
              </div>
            )
          }

          return null
        })}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Input area ── */}
      <div style={{
        padding: '12px 20px 16px',
        background: '#fff',
        borderTop: '1px solid var(--border, #EBE9F2)',
        flexShrink: 0,
      }}>
        <div style={{
          display: 'flex', gap: 10, alignItems: 'flex-end',
          background: '#fff',
          border: `1px solid ${streaming ? 'var(--brand, #6D28D9)' : 'var(--border, #EBE9F2)'}`,
          borderRadius: 14, padding: '10px 14px',
          transition: 'border-color .2s',
        }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Message the team... (Enter to send, Shift+Enter for new line)"
            disabled={streaming}
            rows={1}
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--text, #16131F)', fontSize: 13, lineHeight: 1.55,
              fontFamily: 'var(--font)', resize: 'none',
              minHeight: 22, maxHeight: 160,
            }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || streaming}
            style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: input.trim() && !streaming
                ? 'linear-gradient(135deg, #7C3AED 0%, #2563EB 100%)'
                : 'var(--surface2, #F4F3F9)',
              border: 'none', color: input.trim() && !streaming ? '#fff' : 'var(--hint, #9AA1AD)',
              cursor: input.trim() && !streaming ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, transition: 'all .2s',
              boxShadow: input.trim() && !streaming ? '0 2px 8px rgba(124,58,237,.2)' : 'none',
            }}
          >
            <i className="ti ti-send" />
          </button>
        </div>

        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          marginTop: 8, padding: '0 4px',
        }}>
          <div style={{ fontSize: 10, color: 'var(--hint, #9AA1AD)', fontFamily: 'var(--mono)' }}>
            Session: {sessionId}
          </div>
          <div style={{
            display: 'flex', gap: 4, alignItems: 'center',
          }}>
            {Object.entries(AGENT_COLORS).map(([id, color]) => (
              <div
                key={id}
                title={id.replace(/_/g, ' ')}
                style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: color, opacity: 0.5,
                  transition: 'opacity .15s',
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────

function findLastAgentIdx(messages, agentId) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].type === 'agent' && messages[i].agentId === agentId) return i
  }
  return -1
}
