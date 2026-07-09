// AssignedToMe.jsx — "Your work today" landing view for frontline users.
//
// One card. One assignment. One primary action. This is the screen that
// replaces the generic Overview for operators. Everything the user needs
// to start their shift in one glance.
import React from 'react'
import { Icon, domainMeta } from '../../lib.jsx'
import { useFrontline } from '../../hub/frontlineState.jsx'
import { useReadiness } from '../../hub/readinessState.jsx'
import ReadinessGauge from './ReadinessGauge.jsx'

export default function AssignedToMe({ onStart, onNav }) {
  const { assignment, status } = useFrontline()
  const { score, breakdown } = useReadiness()

  if (!assignment) return null
  const meta = domainMeta(assignment.assetDomain)
  const isComplete = status === 'complete'
  const isInProgress = status === 'in_progress'

  return (
    <div className="panel" style={{ maxWidth: 680, margin: '0 auto', paddingTop: 32 }}>
      {/* -- greeting -- */}
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{ fontSize: 13, color: 'var(--hint)', fontWeight: 600, textTransform: 'uppercase',
          letterSpacing: '.1em', marginBottom: 6 }}>
          {new Date().toLocaleDateString('en-SG', { weekday: 'long', day: 'numeric', month: 'long' })}
        </div>
        <h2 style={{ fontFamily: 'var(--display)', fontSize: 22, margin: 0, color: 'var(--text)' }}>
          {isComplete ? 'Shift complete' : isInProgress ? 'In progress' : 'Your work today'}
        </h2>
        <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 4 }}>
          {isComplete ? 'All assignments cleared. Great work.' : 'One assignment, one primary action.'}
        </div>
      </div>

      {/* -- readiness ring -- */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
        <ReadinessGauge score={score} breakdown={breakdown} size={140} showBreakdown />
      </div>

      {/* -- assignment card -- */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', border: `2px solid ${isComplete ? '#16a34a' : meta.accent}22` }}>
        {/* header stripe */}
        <div style={{ background: isComplete ? '#16a34a' : meta.accent, color: '#fff', padding: '14px 20px',
          display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, fontWeight: 600 }}>
          <Icon n={meta.icon} />
          <span style={{ flex: 1 }}>{meta.tag}</span>
          <span style={{ background: 'rgba(255,255,255,.2)', padding: '2px 10px', borderRadius: 99,
            fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em' }}>
            {assignment.procedureType}
          </span>
        </div>

        {/* body */}
        <div style={{ padding: '20px 24px' }}>
          <div style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 700, color: 'var(--text)',
            marginBottom: 6 }}>
            {assignment.procedureName}
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
            on <b style={{ color: 'var(--text)' }}>{assignment.assetName}</b>
          </div>

          {/* meta row */}
          <div style={{ display: 'flex', gap: 20, fontSize: 12, color: 'var(--muted)', marginBottom: 20 }}>
            <span><Icon n="ti-clock" /> {assignment.estimatedMinutes} min</span>
            <span><Icon n="ti-calendar-event" /> Due by {assignment.dueBy}</span>
            <span><Icon n="ti-id" /> {assignment.procedureId}</span>
          </div>

          {/* 7-stage loop indicator */}
          <div style={{ display: 'flex', gap: 2, marginBottom: 20 }}>
            {['Assess', 'Train', 'Simulate', 'Deploy', 'Assist', 'Observe', 'Improve'].map((stage, i) => (
              <div key={stage} style={{
                flex: 1, textAlign: 'center', fontSize: 8, fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: '.04em', padding: '6px 0', borderRadius: 4,
                background: isComplete ? '#dcfce7'
                  : isInProgress && i < 4 ? `${meta.accent}18`
                  : 'var(--surface2)',
                color: isComplete ? '#065f46'
                  : isInProgress && i < 4 ? meta.accent
                  : 'var(--hint)',
              }}>
                {stage}
              </div>
            ))}
          </div>

          {/* primary action */}
          {isComplete ? (
            <div style={{ textAlign: 'center', padding: 12, background: '#dcfce7', borderRadius: 10,
              color: '#065f46', fontWeight: 600, fontSize: 14 }}>
              <Icon n="ti-circle-check" /> Cleared for {assignment.procedureName}
            </div>
          ) : (
            <button className="btn" style={{
              width: '100%', padding: '14px 0', fontSize: 15, fontWeight: 700,
              background: meta.accent, color: '#fff', border: 'none', borderRadius: 10,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              boxShadow: `0 4px 14px ${meta.accent}40`,
            }} onClick={onStart}>
              <Icon n={isInProgress ? 'ti-player-play' : 'ti-arrow-right'} />
              {isInProgress ? 'Resume Flow' : 'Start'}
            </button>
          )}
        </div>
      </div>

      {/* -- efficiency rules reminder -- */}
      <div style={{ marginTop: 20, fontSize: 11, color: 'var(--hint)', textAlign: 'center',
        fontStyle: 'italic' }}>
        Every action generates data. The system decides. One primary action per screen.
      </div>
    </div>
  )
}
