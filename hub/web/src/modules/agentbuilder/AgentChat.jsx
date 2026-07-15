// AgentChat.jsx — 1:1 chat with a single agent (built-in or custom).
// Reached from the Agent Builder dashboard by clicking an agent card.
// Streams the same SSE vocabulary as Team Chat, but from the per-agent
// endpoint POST /api/agentbuilder/agents/{id}/chat — the agent runs its
// real tool loop on the agentic platform (memory-threaded per session).
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { authHeaders } from '../../api.js'
import { renderMarkdown, agentColor, agentInitials } from './TeamChat.jsx'

export default function AgentChat({ agent, onBack }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [sessionId] = useState(() => 'agent_' + Date.now().toString(36))

  const messagesEndRef = useRef(null)
  const textareaRef = useRef(null)
  const abortRef = useRef(null)

  // no agent selected (e.g. deep link) → back to the builder dashboard
  useEffect(() => { if (!agent) onBack && onBack() }, [agent]) // eslint-disable-line
  useEffect(() => {
    if (messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  if (!agent) return null
  const color = agent.color || agentColor(agent.id)
  const initials = agent.initials || agentInitials(agent.name)

  const handleInputChange = (e) => {
    setInput(e.target.value)
    const ta = textareaRef.current
    if (ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 160) + 'px' }
  }

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
    setMessages(prev => [...prev, { type: 'user', content: text }])
    setStreaming(true)
    let agentContent = ''

    try {
      const controller = new AbortController()
      abortRef.current = controller
      const resp = await fetch(`/api/agentbuilder/agents/${encodeURIComponent(agent.id)}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          message: text, session_id: sessionId,
          name: agent.name || '', purpose: agent.tagline || agent.purpose || '',
          persona: agent.persona || '',
        }),
        signal: controller.signal,
      })
      if (!resp.ok) {
        let detail = `HTTP ${resp.status}`
        try { const j = await resp.json(); if (j?.detail) detail = j.detail } catch { /* */ }
        throw new Error(detail)
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
            case 'agent_start':
              agentContent = ''
              setMessages(prev => [...prev, { type: 'agent', content: '' }])
              break
            case 'text':
              agentContent += event.text || ''
              setMessages(prev => {
                const updated = [...prev]
                for (let i = updated.length - 1; i >= 0; i--) {
                  if (updated[i].type === 'agent') { updated[i] = { ...updated[i], content: agentContent }; break }
                }
                return updated
              })
              break
            case 'narration':
              setMessages(prev => [...prev, { type: 'narration', content: event.text || `Using tool: ${event.tool || 'unknown'}` }])
              break
            case 'tool_result':
              setMessages(prev => [...prev, { type: 'narration', content: event.summary || `Tool ${event.tool} completed` }])
              break
            case 'artifact':
              setMessages(prev => [...prev, {
                type: 'artifact', content: event.title || 'Download',
                artifact: { type: event.artifact_type, title: event.title, url: event.url },
              }])
              break
            case 'agent_done': {
              const tokens = event.tokens || 0
              setMessages(prev => [...prev, {
                type: 'system',
                content: `Done${tokens ? ` (${tokens.toLocaleString()} tokens${event.model ? `, ${event.model}` : ''})` : ''}`,
              }])
              break
            }
            case 'agent_error':
            case 'error':
              setMessages(prev => [...prev, { type: 'system', content: event.message || event.text || 'Stream error', isError: true }])
              break
            default:
              break
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setMessages(prev => [...prev, { type: 'system', content: `Connection error: ${err.message}`, isError: true }])
      }
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }, [input, streaming, sessionId, agent])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }
  const stopStreaming = () => { if (abortRef.current) { abortRef.current.abort(); abortRef.current = null } }

  const suggestions = [
    `What can you help me with?`,
    agent.tagline ? `Help me with: ${agent.tagline.toLowerCase()}` : 'Give me a quick example of your work',
    'Summarise your capabilities in 3 bullets',
  ]

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      background: 'var(--bg, #F7F7FB)', borderRadius: 16, overflow: 'hidden',
      border: '1px solid var(--border, #EBE9F2)',
    }}>
      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '14px 20px',
        background: 'var(--surface, #fff)', borderBottom: '1px solid var(--border, #EBE9F2)', flexShrink: 0,
      }}>
        <button onClick={onBack} title="Back to Agent Builder"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 32, height: 32, borderRadius: 8,
            background: 'var(--surface2, #F4F3F9)', border: '1px solid var(--border, #EBE9F2)',
            color: 'var(--muted, #6B7280)', cursor: 'pointer', fontSize: 16, flexShrink: 0,
          }}>
          <i className="ti ti-arrow-left" />
        </button>
        <div style={{
          width: 36, height: 36, borderRadius: '50%', background: color,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 12, fontWeight: 700, fontFamily: 'var(--mono)',
          boxShadow: `0 0 0 3px ${color}22`, flexShrink: 0,
        }}>
          {initials}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 600, fontSize: 15, color: 'var(--text, #16131F)' }}>
            {agent.name}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted, #6B7280)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              width: 7, height: 7, borderRadius: '50%', background: '#10B981',
              boxShadow: '0 0 8px rgba(16,185,129,.4)', display: 'inline-block',
            }} />
            {agent.tagline || agent.purpose || (agent.builtin ? 'Built-in agent' : 'Custom agent')}
          </div>
        </div>
        {streaming && (
          <button onClick={stopStreaming} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8,
            background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.3)',
            color: '#EF4444', cursor: 'pointer', fontSize: 11, fontWeight: 600,
          }}>
            <i className="ti ti-player-stop-filled" style={{ fontSize: 12 }} /> Stop
          </button>
        )}
        <span className="pill pill-surface" style={{ fontSize: 10, fontFamily: 'var(--mono)' }}>
          {agent.builtin ? 'built-in' : 'custom'}
        </span>
      </div>

      {/* ── Messages ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 10px', display: 'flex', flexDirection: 'column', gap: 6, minHeight: 0 }}>
        {messages.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 16, padding: '60px 20px' }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%', background: color,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 20, fontWeight: 700, fontFamily: 'var(--mono)',
              boxShadow: `0 0 0 6px ${color}18`,
            }}>
              {initials}
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 600, color: 'var(--text, #16131F)', marginBottom: 6 }}>
                Chat with {agent.name}
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--muted, #6B7280)', lineHeight: 1.6, maxWidth: 400 }}>
                {agent.tagline || agent.purpose || 'Ask anything — this agent streams its work (including tool use) in real time.'}
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 8, maxWidth: 520 }}>
              {suggestions.map(s => (
                <button key={s} onClick={() => { setInput(s); textareaRef.current?.focus() }}
                  style={{
                    padding: '7px 14px', borderRadius: 999, background: 'var(--surface2, #F3EFFC)',
                    border: '1px solid var(--border, #EBE9F2)', color: 'var(--muted, #6B7280)',
                    fontSize: 11.5, cursor: 'pointer',
                  }}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, idx) => {
          if (msg.type === 'system') {
            return (
              <div key={idx} style={{ display: 'flex', justifyContent: 'center', padding: '4px 0' }}>
                <div style={{
                  fontSize: 11, color: msg.isError ? '#EF4444' : 'var(--hint, #9AA1AD)', fontFamily: 'var(--mono)',
                  background: msg.isError ? 'rgba(239,68,68,.06)' : 'var(--surface2, #F4F3F9)',
                  border: `1px solid ${msg.isError ? 'rgba(239,68,68,.15)' : 'var(--border, #EBE9F2)'}`,
                  borderRadius: 999, padding: '5px 14px', display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <i className={`ti ${msg.isError ? 'ti-alert-triangle' : 'ti-check'}`} style={{ fontSize: 12 }} />
                  {msg.content}
                </div>
              </div>
            )
          }
          if (msg.type === 'user') {
            return (
              <div key={idx} style={{ display: 'flex', justifyContent: 'flex-end', padding: '6px 0' }}>
                <div style={{
                  maxWidth: '72%', padding: '10px 16px',
                  background: 'linear-gradient(135deg, #7C3AED 0%, #2563EB 100%)',
                  borderRadius: '14px 14px 4px 14px', fontSize: 13, lineHeight: 1.6, color: '#fff',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                }}>
                  {msg.content}
                </div>
              </div>
            )
          }
          if (msg.type === 'narration') {
            return (
              <div key={idx} style={{ padding: '2px 0 2px 52px' }}>
                <div style={{
                  fontSize: 11, color: 'var(--muted, #6B7280)', fontFamily: 'var(--mono)', fontStyle: 'italic',
                  display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 4,
                }}>
                  <i className="ti ti-terminal-2" style={{ fontSize: 11, opacity: 0.6 }} />
                  {msg.content}
                </div>
              </div>
            )
          }
          if (msg.type === 'artifact') {
            const art = msg.artifact || {}
            return (
              <div key={idx} style={{ padding: '4px 0 4px 52px' }}>
                <a href={art.url || '#'} target="_blank" rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderRadius: 10,
                    background: 'var(--surface, #fff)', border: '1px solid var(--border, #EBE9F2)',
                    color: 'var(--brand, #6D28D9)', textDecoration: 'none',
                  }}>
                  <i className="ti ti-file-download" style={{ fontSize: 18 }} />
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 600 }}>{art.title || 'Artifact'}</div>
                    <div style={{ fontSize: 10, color: 'var(--muted, #6B7280)', marginTop: 1 }}>{art.type || 'file'} — click to download</div>
                  </div>
                </a>
              </div>
            )
          }
          if (msg.type === 'agent') {
            const isLast = idx === messages.map((m, i) => (m.type === 'agent' ? i : -1)).filter(i => i >= 0).pop()
            const isStreaming = streaming && isLast
            return (
              <div key={idx} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '8px 0', maxWidth: '88%' }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%', flexShrink: 0, background: color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: 700, color: '#fff', fontFamily: 'var(--mono)',
                  boxShadow: `0 0 14px ${color}33`, marginTop: 2,
                }}>
                  {initials}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 10.5, fontWeight: 700, color, textTransform: 'uppercase',
                    letterSpacing: '.06em', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    {agent.name}
                    {isStreaming && <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: color, animation: 'pulse 1s ease-in-out infinite' }} />}
                  </div>
                  <div style={{
                    padding: '10px 14px', background: 'var(--surface, #fff)',
                    border: '1px solid var(--border, #EBE9F2)', borderRadius: '4px 14px 14px 14px',
                    fontSize: 12.5, lineHeight: 1.65, color: 'var(--text, #16131F)', wordBreak: 'break-word',
                  }}>
                    {msg.content
                      ? <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                      : isStreaming && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted, #6B7280)', fontSize: 12 }}>
                          <span className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} /> Thinking...
                        </div>
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

      {/* ── Input ── */}
      <div style={{ padding: '12px 20px 16px', background: 'var(--surface, #fff)', borderTop: '1px solid var(--border, #EBE9F2)', flexShrink: 0 }}>
        <div style={{
          display: 'flex', gap: 10, alignItems: 'flex-end', background: 'var(--surface, #fff)',
          border: `1px solid ${streaming ? color : 'var(--border, #EBE9F2)'}`,
          borderRadius: 14, padding: '10px 14px', transition: 'border-color .2s',
        }}>
          <textarea ref={textareaRef} value={input} onChange={handleInputChange} onKeyDown={handleKeyDown}
            placeholder={`Message ${agent.name}... (Enter to send)`} disabled={streaming} rows={1}
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--text, #16131F)', fontSize: 13, lineHeight: 1.55, resize: 'none',
              minHeight: 22, maxHeight: 160, fontFamily: 'var(--font)',
            }} />
          <button onClick={sendMessage} disabled={!input.trim() || streaming}
            style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: input.trim() && !streaming ? color : 'var(--surface2, #F4F3F9)',
              border: 'none', color: input.trim() && !streaming ? '#fff' : 'var(--hint, #9AA1AD)',
              cursor: input.trim() && !streaming ? 'pointer' : 'not-allowed',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
            }}>
            <i className="ti ti-send" />
          </button>
        </div>
        <div style={{ fontSize: 10, color: 'var(--hint, #9AA1AD)', fontFamily: 'var(--mono)', marginTop: 8, padding: '0 4px' }}>
          Session: {sessionId} · memory-threaded
        </div>
      </div>
    </div>
  )
}
