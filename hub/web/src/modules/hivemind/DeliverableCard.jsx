// DeliverableCard.jsx — the output card for each agent's deliverable.
// Not a chat bubble. A structured artifact card with a visual header,
// rendered content, and action buttons (Approve / Export).
import React, { useState } from 'react'
import { Icon } from '../../lib.jsx'
import { exportDeliverable } from './export.js'

const STATUS_META = {
  idle: { label: 'Standby', color: 'var(--hint)', bg: 'rgba(154,161,173,.12)', icon: 'ti-clock' },
  queued: { label: 'Queued', color: '#9aa1ad', bg: 'rgba(154,161,173,.12)', icon: 'ti-dots' },
  working: { label: 'Working…', color: '#7A5CF0', bg: 'rgba(122,92,240,.12)', icon: 'ti-loader-2' },
  done: { label: 'Deliverable ready', color: '#16a34a', bg: 'rgba(22,163,74,.1)', icon: 'ti-circle-check' },
  error: { label: 'Error', color: '#e11d48', bg: 'rgba(225,29,72,.1)', icon: 'ti-alert-circle' },
}

export default function DeliverableCard({ persona, state, deliverable, streamingContent, isApproved, isExported, onApprove, onExport }) {
  const [expanded, setExpanded] = useState(false)
  const status = state?.status || 'idle'
  const meta = STATUS_META[status]
  const hasDeliverable = status === 'done' && deliverable
  const elapsed = (state?.finishedAt && state?.startedAt) ? ((state.finishedAt - state.startedAt) / 1000).toFixed(1) : null

  return (
    <div
      className={`dcard ${status} ${isApproved ? 'dcard-approved' : ''}`}
      style={{
        '--agent-color': persona.color,
        '--agent-glow': persona.glow,
        animationDelay: `${PERSONAS_ORDER.indexOf(persona.id) * 60}ms`,
      }}
    >
      {/* Card header */}
      <div className="dcard-head">
        <div className="dcard-avatar" style={{ background: persona.color }}>
          {persona.initials}
        </div>
        <div className="dcard-head-text">
          <div className="dcard-name">{persona.name}</div>
          <div className="dcard-role">{persona.title}</div>
        </div>
        <div className="dcard-status" style={{ color: meta.color, background: meta.bg }}>
          <i className={`ti ${meta.icon} ${status === 'working' ? 'dcard-spin' : ''}`} />
          {meta.label}
          {elapsed && status === 'done' && <span className="dcard-elapsed">{elapsed}s</span>}
          {deliverable?.live && <span className="dcard-elapsed" style={{ color: '#16a34a' }}>● live</span>}
          {deliverable?.tokens > 0 && <span className="dcard-elapsed">{deliverable.tokens} tok</span>}
        </div>
      </div>

      {/* Deliverable type label */}
      <div className="dcard-type-row">
        <div className="dcard-type-ic" style={{ background: `${persona.color}22`, color: persona.color }}>
          <Icon n={persona.deliverable.icon} />
        </div>
        <span className="dcard-type-label">{persona.deliverable.label}</span>
        {isApproved && (
          <span className="dcard-approved-badge"><Icon n="ti-check" /> Approved</span>
        )}
      </div>

      {/* Content area */}
      {status === 'queued' && (
        <div className="dcard-placeholder">
          <div className="dcard-placeholder-line" style={{ width: '85%' }} />
          <div className="dcard-placeholder-line" style={{ width: '70%' }} />
          <div className="dcard-placeholder-line" style={{ width: '55%' }} />
        </div>
      )}

      {status === 'working' && (
        <div className="dcard-working">
          {streamingContent ? (
            <>
              {state?.narration && (
                <div style={{ fontSize: 10, color: persona.color, fontWeight: 600, marginBottom: 6,
                  display: 'flex', alignItems: 'center', gap: 4 }}>
                  <i className="ti ti-loader-2 dcard-spin" style={{ fontSize: 12 }} />
                  {state.narration}
                </div>
              )}
              <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.6, maxHeight: 200,
                overflow: 'auto', whiteSpace: 'pre-wrap', fontFamily: 'var(--font)' }}>
                {streamingContent}
                <span className="dcard-cursor" />
              </div>
            </>
          ) : (
            <>
              <div className="dcard-working-bar" style={{ '--bar-color': persona.color }} />
              <div className="dcard-working-bar" style={{ '--bar-color': persona.color, animationDelay: '.15s' }} />
              <div className="dcard-working-bar" style={{ '--bar-color': persona.color, animationDelay: '.3s' }} />
              <span className="dcard-working-text">
                {state?.narration || persona.tagline}
              </span>
            </>
          )}
        </div>
      )}

      {status === 'error' && state?.error && (
        <div className="dcard-error-text">
          <Icon n="ti-alert-triangle" /> {state.error}
        </div>
      )}

      {hasDeliverable && (
        <div className="dcard-content">
          <DeliverableContent persona={persona} deliverable={deliverable} expanded={expanded} />
          {!expanded && (
            <button className="dcard-expand-btn" onClick={() => setExpanded(true)} style={{ color: persona.color }}>
              <Icon n="ti-chevron-down" /> Show full deliverable
            </button>
          )}
          {expanded && (
            <button className="dcard-expand-btn" onClick={() => setExpanded(false)} style={{ color: persona.color }}>
              <Icon n="ti-chevron-up" /> Collapse
            </button>
          )}
        </div>
      )}

      {/* Action row */}
      {hasDeliverable && !isApproved && (
        <div className="dcard-actions">
          <div style={{ display: 'flex', gap: 4 }}>
            <button className="dcard-btn-secondary" onClick={() => exportDeliverable(persona.id, deliverable, 'pdf')} title="Print / Save as PDF">
              <Icon n="ti-file-text" /> PDF
            </button>
            <button className="dcard-btn-secondary" onClick={() => exportDeliverable(persona.id, deliverable, 'md')} title="Download as Markdown">
              <Icon n="ti-markdown" /> MD
            </button>
            <button className="dcard-btn-secondary" onClick={() => { exportDeliverable(persona.id, deliverable, 'json'); onExport() }} title="Download as JSON">
              <Icon n="ti-braces" /> JSON
            </button>
          </div>
          <button className="dcard-btn-primary" style={{ '--btn-color': persona.color }} onClick={onApprove}>
            <Icon n="ti-circle-check" /> Approve
          </button>
        </div>
      )}

      {isApproved && (
        <div className="dcard-approved-row">
          <Icon n="ti-circle-check" />
          Deliverable approved — logged to audit trail
          <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
            <button className="dcard-btn-secondary" onClick={() => exportDeliverable(persona.id, deliverable, 'pdf')} title="PDF">
              <Icon n="ti-file-text" />
            </button>
            <button className="dcard-btn-secondary" onClick={() => exportDeliverable(persona.id, deliverable, 'md')} title="Markdown">
              <Icon n="ti-markdown" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Deliverable content renderer ──────────────────────────────────────
// Renders structured deliverables (WorkOrder, ProcurementList, IncidentReport, etc.)
// with appropriate visual hierarchy. Falls back to preformatted JSON for unknowns.
function DeliverableContent({ persona, deliverable, expanded }) {
  const { type } = persona.deliverable
  const raw = deliverable?.raw || deliverable?.result || deliverable

  if (!raw) return null

  // text deliverables (diagnosis, cascade, narration)
  if (type === 'diagnosis_report' || type === 'cascade_analysis' || type === 'operations_briefing') {
    const text = raw?.text || (typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2))
    const lines = text.split('\n').filter(Boolean)
    const preview = expanded ? lines : lines.slice(0, 4)
    return (
      <div className="dcard-text-body">
        {preview.map((line, i) => (
          <p key={i} style={{ margin: '0 0 6px', lineHeight: 1.6, fontSize: 13 }}>{line}</p>
        ))}
      </div>
    )
  }

  // WorkOrder
  if (type === 'work_order' && raw?.wo_number) {
    return (
      <div className="dcard-structured">
        <div className="dcard-kv-row">
          <span className="dcard-kv-key">WO Number</span>
          <span className="dcard-kv-val mono">{raw.wo_number}</span>
        </div>
        <div className="dcard-kv-row">
          <span className="dcard-kv-key">ATA Chapter</span>
          <span className="dcard-kv-val">{raw.ata_chapter}</span>
        </div>
        <div className="dcard-kv-row">
          <span className="dcard-kv-key">Priority</span>
          <PriorityBadge priority={raw.priority} />
        </div>
        <div className="dcard-kv-row">
          <span className="dcard-kv-key">Est. Hours</span>
          <span className="dcard-kv-val">{raw.estimated_hours}h</span>
        </div>
        <div className="dcard-kv-row">
          <span className="dcard-kv-key">Sign-off</span>
          <span className="dcard-kv-val">{raw.sign_off}</span>
        </div>
        {expanded && raw.steps?.length > 0 && (
          <div className="dcard-steps">
            <div className="dcard-steps-label">Repair steps</div>
            {raw.steps.map((s, i) => (
              <div key={i} className="dcard-step">
                <div className="dcard-step-num">{s.step}</div>
                <div className="dcard-step-body">
                  <div className="dcard-step-action">{s.action}</div>
                  <div className="dcard-step-criteria">{s.criteria}</div>
                  {s.safety && <div className="dcard-step-safety"><Icon n="ti-alert-triangle" /> {s.safety}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // ProcurementList
  if (type === 'procurement_list' && raw?.parts) {
    return (
      <div className="dcard-structured">
        <div className="dcard-kv-row">
          <span className="dcard-kv-key">WO Reference</span>
          <span className="dcard-kv-val mono">{raw.work_order_ref}</span>
        </div>
        <div className="dcard-kv-row">
          <span className="dcard-kv-key">Total Cost</span>
          <span className="dcard-kv-val" style={{ fontWeight: 700 }}>${raw.total_estimated_cost?.toLocaleString()}</span>
        </div>
        <div className="dcard-kv-row">
          <span className="dcard-kv-key">AOG Available</span>
          <span className="dcard-kv-val" style={{ color: raw.aog_available ? '#16a34a' : '#e11d48' }}>
            {raw.aog_available ? 'Yes' : 'No'}
          </span>
        </div>
        {expanded && raw.parts.map((p, i) => (
          <div key={i} className="dcard-part-row">
            <span className="dcard-part-num mono">{p.part_number}</span>
            <span className="dcard-part-desc">{p.description}</span>
            <span className="dcard-part-qty">×{p.quantity}</span>
            <span className="dcard-part-cost">${p.estimated_cost_usd?.toFixed(0)}</span>
            <span className="dcard-part-lead">{p.lead_time}</span>
          </div>
        ))}
      </div>
    )
  }

  // IncidentReport
  if (type === 'incident_report' && raw?.report_id) {
    return (
      <div className="dcard-structured">
        <div className="dcard-kv-row">
          <span className="dcard-kv-key">Report ID</span>
          <span className="dcard-kv-val mono">{raw.report_id}</span>
        </div>
        <div className="dcard-kv-row">
          <span className="dcard-kv-key">Classification</span>
          <span className="dcard-kv-val">{raw.classification}</span>
        </div>
        <div className="dcard-kv-row">
          <span className="dcard-kv-key">Probable Cause</span>
          <span className="dcard-kv-val">{raw.probable_cause}</span>
        </div>
        {expanded && (
          <>
            <div className="dcard-kv-row">
              <span className="dcard-kv-key">Regulatory Closure</span>
              <span className="dcard-kv-val">{raw.regulatory_closure}</span>
            </div>
            <div className="dcard-kv-row">
              <span className="dcard-kv-key">Return to Service</span>
              <span className="dcard-kv-val">{raw.return_to_service}</span>
            </div>
            {raw.symptoms?.length > 0 && (
              <div className="dcard-steps">
                <div className="dcard-steps-label">Observed symptoms</div>
                {raw.symptoms.map((s, i) => (
                  <div key={i} className="dcard-symptom">{s}</div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    )
  }

  // ScenarioBrief
  if (type === 'scenario_brief' && raw?.name) {
    return (
      <div className="dcard-structured">
        <div className="dcard-kv-row">
          <span className="dcard-kv-key">Scenario</span>
          <span className="dcard-kv-val" style={{ fontWeight: 700 }}>{raw.name}</span>
        </div>
        <div className="dcard-kv-row">
          <span className="dcard-kv-key">Severity</span>
          <PriorityBadge priority={raw.severity} />
        </div>
        <div className="dcard-kv-row">
          <span className="dcard-kv-key">Primary Signal</span>
          <span className="dcard-kv-val mono">{raw.primary_signal}</span>
        </div>
        {expanded && raw.steps?.length > 0 && (
          <div className="dcard-steps">
            <div className="dcard-steps-label">Technician steps</div>
            {raw.steps.map((s, i) => (
              <div key={i} className="dcard-step">
                <div className="dcard-step-num">{i + 1}</div>
                <div className="dcard-step-body"><div className="dcard-step-action">{s}</div></div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  // fallback: pretty-print JSON
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2)
  return (
    <pre className="dcard-json" style={{ maxHeight: expanded ? 'none' : 140 }}>
      {text}
    </pre>
  )
}

function PriorityBadge({ priority }) {
  const p = (priority || '').toLowerCase()
  const color = p === 'aog' || p === 'critical' ? '#e11d48'
    : p === 'high' ? '#d97706'
    : p === 'medium' ? '#2563eb'
    : '#16a34a'
  return (
    <span className="dcard-priority-badge" style={{ color, background: `${color}18` }}>
      {priority}
    </span>
  )
}

// for stagger animation delay calc
const PERSONAS_ORDER = ['riya', 'alex', 'fatima', 'priya', 'mikhail', 'omar', 'juno']
