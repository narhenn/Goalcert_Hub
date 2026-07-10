// FrontlineFlow.jsx — the 8-step certified frontline journey.
//
// Assess → Train → Simulate → Deploy → Assist → Observe → Improve
// Each step maps to a stage in Prem's 7-stage loop. The flow is a sequential
// wizard — you can't skip steps, but you can retry Step 4 (competency check).
import React, { useState, useCallback } from 'react'
import { Icon, domainMeta, fmt, pct } from '../../lib.jsx'
import { useTwin } from '../../hub/twinState.jsx'
import { useFrontline } from '../../hub/frontlineState.jsx'
import { useReadiness } from '../../hub/readinessState.jsx'
import { useAudit } from '../../hub/audit.jsx'
import { useLoop } from '../../hub/loopState.jsx'
import ReadinessGauge from './ReadinessGauge.jsx'

const STEPS = [
  { id: 1, label: 'Shift Login', icon: 'ti-login', stage: 'Assess', time: '1 min' },
  { id: 2, label: 'Pre-Work Learning', icon: 'ti-book', stage: 'Train', time: '2-5 min' },
  { id: 3, label: 'XR Practice', icon: 'ti-device-gamepad-2', stage: 'Simulate', time: '10-15 min' },
  { id: 4, label: 'Competency Check', icon: 'ti-certificate', stage: 'Simulate', time: '5-10 min' },
  { id: 5, label: 'Clearance', icon: 'ti-shield-check', stage: 'Deploy', time: '1 min' },
  { id: 6, label: 'AR Overlay', icon: 'ti-augmented-reality', stage: 'Assist', time: '15-20 min' },
  { id: 7, label: 'Expert Assist', icon: 'ti-headset', stage: 'Assist', time: 'as needed' },
  { id: 8, label: 'Close & Feedback', icon: 'ti-checkbox', stage: 'Improve', time: '2 min' },
]

export default function FrontlineFlow({ onComplete }) {
  const [step, setStep] = useState(1)
  const [results, setResults] = useState({})
  const { active, twin } = useTwin()
  const { assignment, completeFlow } = useFrontline()
  const { score, onFlowComplete } = useReadiness()
  const audit = useAudit()
  const loop = useLoop()
  const meta = domainMeta(active?.domain || 'edm-machine')

  // each completed step feeds the loop bus — this is the data trail the
  // supervisor, compliance, COO and L&D views read back out
  const emitStep = useCallback((stepId, stepResults) => {
    const proc = assignment?.procedureName || 'procedure'
    const emits = {
      1: ['assess', `Shift login — assigned ${proc}`, 'Roster, asset state and readiness score matched by the agentic engine.', 'agentic'],
      2: ['train', `Micro-lesson completed — ${proc}`, 'Smallest content unit, tied to the fault modes the twin sees today.', 'scenario'],
      3: ['simulate', `XR practice scored ${stepResults.score ?? '—'}% — ${proc}`, 'Scenario mirrored the live twin snapshot. Performance captured continuously.', 'scenario'],
      4: ['simulate', `Competency check passed — ${proc}`, `One fault-injected scenario, scored ${stepResults.score ?? '—'}% against SOP steps and timing.`, 'scenario'],
      5: ['deploy', `Clearance signed — ${proc}`, 'Signed, timestamped record exposed to compliance and the supervisor dashboard.', 'frontline'],
      6: ['assist', `AR overlay walked on ${assignment?.assetName || 'asset'}`, 'Twin fingerprinted the asset; overlay versioned per asset revision.', 'twin'],
      7: stepResults.expertUsed
        ? ['assist', 'One-tap expert session completed', 'Call routed by asset and procedure. Recorded, tagged, transcribed → candidate training content.', 'agentic']
        : null,
      8: ['observe', `Job closed — ${proc}`, 'Session logged; readiness score updated from today’s evidence.', 'twin'],
    }
    const e = emits[stepId]
    if (e) loop.emit(e[0], { summary: e[1], detail: e[2], module: e[3], persona: 'frontline' })
  }, [assignment, loop])

  const advance = useCallback((stepResults = {}) => {
    setResults(prev => ({ ...prev, [`step${step}`]: { ...stepResults, completedAt: new Date().toISOString() } }))
    emitStep(step, stepResults)
    if (step < 8) {
      setStep(s => s + 1)
    } else {
      // flow complete
      const xrScore = results.step3?.score || results.step4?.score || 75
      onFlowComplete(xrScore)
      completeFlow(results)
      audit.log('frontline', 'flow_complete', `Frontline flow completed for ${assignment?.procedureName}`)
      loop.emit('improve', {
        summary: `Loop closed — ${assignment?.procedureName}`,
        detail: 'Readiness updated; micro-refresh queued for tomorrow if a gap was observed.',
        module: 'agentic', persona: 'frontline',
      })
      if (onComplete) onComplete()
    }
  }, [step, results, assignment, onFlowComplete, completeFlow, audit, loop, emitStep, onComplete])

  const currentStep = STEPS[step - 1]

  return (
    <div className="panel" style={{ maxWidth: 720, margin: '0 auto' }}>
      {/* progress bar */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 24 }}>
        {STEPS.map((s, i) => (
          <div key={s.id} style={{
            flex: 1, height: 4, borderRadius: 2,
            background: i < step ? meta.accent : i === step - 1 ? `${meta.accent}60` : 'var(--border)',
            transition: 'background .3s',
          }} />
        ))}
      </div>

      {/* step header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: `${meta.accent}18`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: meta.accent, fontSize: 18 }}>
          <Icon n={currentStep.icon} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--hint)', fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '.08em' }}>
            Step {step} of 8 — {currentStep.stage}
          </div>
          <div style={{ fontFamily: 'var(--display)', fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>
            {currentStep.label}
          </div>
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--hint)' }}>
          <Icon n="ti-clock" /> {currentStep.time}
        </span>
      </div>

      {/* step content */}
      <div className="card" style={{ padding: 24, minHeight: 280, marginTop: 16 }}>
        {step === 1 && <StepLogin user="Operator" assignment={assignment} onNext={advance} />}
        {step === 2 && <StepPreLearn assignment={assignment} meta={meta} onNext={advance} />}
        {step === 3 && <StepXRPractice twin={twin} meta={meta} onNext={advance} />}
        {step === 4 && <StepCompetencyCheck twin={twin} meta={meta} onNext={advance} />}
        {step === 5 && <StepClearance assignment={assignment} audit={audit} onNext={advance} />}
        {step === 6 && <StepAROverlay assignment={assignment} meta={meta} onNext={advance} />}
        {step === 7 && <StepExpert onNext={advance} />}
        {step === 8 && <StepCloseOut score={score} assignment={assignment} onNext={advance} />}
      </div>

      {/* step indicators */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 16 }}>
        {STEPS.map((s, i) => (
          <div key={s.id} title={s.label} style={{
            width: 8, height: 8, borderRadius: 4,
            background: i < step - 1 ? '#16a34a' : i === step - 1 ? meta.accent : 'var(--border)',
            transition: 'background .2s',
          }} />
        ))}
      </div>
    </div>
  )
}

// ── Step components ────────────────────────────────────────────────

function StepLogin({ user, assignment, onNext }) {
  return (
    <div style={{ textAlign: 'center', padding: '20px 0' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>&#9745;</div>
      <h3 style={{ margin: '0 0 8px', fontFamily: 'var(--display)' }}>Shift authenticated</h3>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 20 }}>
        Welcome back. Your assignment: <b>{assignment?.procedureName}</b> on <b>{assignment?.assetName}</b>.
      </p>
      <button className="btn" style={{ background: 'var(--brand)', color: '#fff', padding: '10px 32px',
        border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }} onClick={() => onNext({ loggedIn: true })}>
        Continue to pre-work learning
      </button>
    </div>
  )
}

function StepPreLearn({ assignment, meta, onNext }) {
  const [done, setDone] = useState(false)
  return (
    <div>
      <div style={{ background: `${meta.accent}08`, borderRadius: 10, padding: 16, marginBottom: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Micro-lesson: {assignment?.procedureName}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
          This 3-minute refresher covers the key steps, safety precautions, and recent updates
          to the procedure. Content is tailored to the current state of your assigned asset —
          the digital twin flagged {Math.floor(Math.random() * 3) + 1} active findings that
          affect today's work.
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {['Safety briefing', 'Procedure steps', 'Recent changes', 'Twin findings'].map((t, i) => (
          <div key={t} style={{ flex: '1 1 45%', padding: '10px 14px', borderRadius: 8,
            background: done || i < 3 ? '#dcfce7' : 'var(--surface2)',
            fontSize: 12, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon n={done || i < 3 ? 'ti-circle-check' : 'ti-circle'} /> {t}
          </div>
        ))}
      </div>
      {!done ? (
        <button className="btn" style={{ background: meta.accent, color: '#fff', padding: '10px 24px',
          border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
          onClick={() => setDone(true)}>
          Mark lesson complete
        </button>
      ) : (
        <button className="btn" style={{ background: 'var(--brand)', color: '#fff', padding: '10px 24px',
          border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
          onClick={() => onNext({ lessonCompleted: true })}>
          Continue to XR practice
        </button>
      )}
    </div>
  )
}

function StepXRPractice({ twin, meta, onNext }) {
  const [practicing, setPracticing] = useState(false)
  const [score, setScore] = useState(null)

  const startPractice = () => {
    setPracticing(true)
    // simulate XR session
    setTimeout(() => {
      setScore(72 + Math.floor(Math.random() * 20))
    }, 3000)
  }

  return (
    <div style={{ textAlign: 'center', padding: '10px 0' }}>
      {!practicing ? (
        <>
          <div style={{ fontSize: 40, marginBottom: 12 }}>&#127918;</div>
          <h3 style={{ margin: '0 0 8px', fontFamily: 'var(--display)' }}>XR Practice Session</h3>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>
            Practice the procedure in an XR scenario that mirrors today's asset state.
            Twin health: <b style={{ color: twin?.health > 0.7 ? '#16a34a' : '#d97706' }}>{pct(twin?.health)}</b>
          </p>
          <button className="btn" style={{ background: meta.accent, color: '#fff', padding: '10px 32px',
            border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }} onClick={startPractice}>
            Launch XR Practice
          </button>
        </>
      ) : score === null ? (
        <>
          <div className="netmap-pulse" style={{ fontSize: 40, display: 'inline-block' }}>&#127918;</div>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 12 }}>XR session in progress...</p>
        </>
      ) : (
        <>
          <ReadinessGauge score={score} size={100} />
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 12 }}>
            Practice score: <b>{score}%</b>
          </p>
          <button className="btn" style={{ background: 'var(--brand)', color: '#fff', padding: '10px 24px',
            border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, marginTop: 8 }}
            onClick={() => onNext({ score })}>
            Continue to competency check
          </button>
        </>
      )}
    </div>
  )
}

function StepCompetencyCheck({ twin, meta, onNext }) {
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState(null)

  const runCheck = () => {
    setRunning(true)
    setTimeout(() => {
      const score = 68 + Math.floor(Math.random() * 28)
      setResult({ score, passed: score >= 70 })
    }, 2500)
  }

  return (
    <div style={{ textAlign: 'center', padding: '10px 0' }}>
      {!running ? (
        <>
          <div style={{ fontSize: 40, marginBottom: 12 }}>&#128161;</div>
          <h3 style={{ margin: '0 0 8px', fontFamily: 'var(--display)' }}>Competency Check</h3>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>
            One fault-injected scenario. Pass (≥70%) or fail. No multiple choice — demonstrate the procedure.
          </p>
          <button className="btn" style={{ background: meta.accent, color: '#fff', padding: '10px 32px',
            border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }} onClick={runCheck}>
            Begin Assessment
          </button>
        </>
      ) : result === null ? (
        <>
          <div className="netmap-pulse" style={{ fontSize: 40, display: 'inline-block' }}>&#128161;</div>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 12 }}>Assessment in progress...</p>
        </>
      ) : (
        <>
          <ReadinessGauge score={result.score} size={100} />
          <p style={{ fontSize: 15, fontWeight: 700, marginTop: 12,
            color: result.passed ? '#16a34a' : '#e11d48' }}>
            {result.passed ? 'PASSED' : 'NOT YET — retry required'}
          </p>
          {result.passed ? (
            <button className="btn" style={{ background: '#16a34a', color: '#fff', padding: '10px 24px',
              border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, marginTop: 8 }}
              onClick={() => onNext({ score: result.score, passed: true })}>
              Continue to clearance
            </button>
          ) : (
            <button className="btn" style={{ background: '#d97706', color: '#fff', padding: '10px 24px',
              border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, marginTop: 8 }}
              onClick={() => { setRunning(false); setResult(null) }}>
              Retry Assessment
            </button>
          )}
        </>
      )}
    </div>
  )
}

function StepClearance({ assignment, audit, onNext }) {
  const [signed, setSigned] = useState(false)
  const ts = new Date().toISOString()
  const sign = () => {
    setSigned(true)
    audit.log('frontline', 'clearance',
      `Clearance signed — ${assignment?.procedureName} on ${assignment?.assetName}`,
      `Signed at ${ts}. Procedure ${assignment?.procedureId}. Evidence chain: LMS + XR + Simulation.`)
  }
  return (
    <div style={{ textAlign: 'center', padding: '10px 0' }}>
      {!signed ? (
        <>
          <div style={{ fontSize: 40, marginBottom: 12 }}>&#128272;</div>
          <h3 style={{ margin: '0 0 8px', fontFamily: 'var(--display)' }}>Sign Clearance</h3>
          <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 8 }}>
            You are about to be cleared for: <b>{assignment?.procedureName}</b>
          </p>
          <p style={{ fontSize: 11, color: 'var(--hint)', marginBottom: 16 }}>
            This creates a signed, timestamped record exposed to compliance and your supervisor's dashboard.
          </p>
          <button className="btn" style={{ background: '#16a34a', color: '#fff', padding: '12px 32px',
            border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 14 }} onClick={sign}>
            <Icon n="ti-shield-check" /> Sign & Clear
          </button>
        </>
      ) : (
        <>
          <div style={{ fontSize: 40, marginBottom: 12, color: '#16a34a' }}>&#9989;</div>
          <h3 style={{ margin: '0 0 8px', fontFamily: 'var(--display)', color: '#16a34a' }}>Cleared</h3>
          <p style={{ fontSize: 12, color: 'var(--muted)' }}>
            Clearance signed at {new Date().toLocaleTimeString()}. Record filed to audit trail.
          </p>
          <button className="btn" style={{ background: 'var(--brand)', color: '#fff', padding: '10px 24px',
            border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, marginTop: 12 }}
            onClick={() => onNext({ signedAt: ts })}>
            Continue to on-asset work
          </button>
        </>
      )}
    </div>
  )
}

function StepAROverlay({ assignment, meta, onNext }) {
  const [step, setStep] = useState(0)
  const arSteps = [
    'Approach asset and scan QR code',
    'Verify lock-out tag-out (LOTO) status',
    'Follow AR overlay steps 1-5 on the asset',
    'Confirm readings match expected values',
    'Document observations via voice note',
  ]
  return (
    <div>
      <div style={{ fontWeight: 600, marginBottom: 12 }}>AR Procedure Overlay</div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
        Follow the step-by-step overlay on your AR glasses or phone camera.
      </div>
      {arSteps.map((s, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
          borderBottom: '1px solid var(--border)', opacity: i <= step ? 1 : 0.4 }}
          onClick={() => { if (i === step) setStep(step + 1) }}>
          <div style={{ width: 24, height: 24, borderRadius: 12, fontSize: 11, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: i < step ? '#16a34a' : i === step ? meta.accent : 'var(--surface2)',
            color: i <= step ? '#fff' : 'var(--hint)' }}>
            {i < step ? '✓' : i + 1}
          </div>
          <span style={{ fontSize: 13, color: i <= step ? 'var(--text)' : 'var(--hint)', cursor: i === step ? 'pointer' : 'default' }}>{s}</span>
        </div>
      ))}
      {step >= arSteps.length && (
        <button className="btn" style={{ background: 'var(--brand)', color: '#fff', padding: '10px 24px',
          border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, marginTop: 16 }}
          onClick={() => onNext({ arStepsCompleted: arSteps.length })}>
          AR steps complete — continue
        </button>
      )}
    </div>
  )
}

function StepExpert({ onNext }) {
  const [called, setCalled] = useState(false)
  return (
    <div style={{ textAlign: 'center', padding: '20px 0' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>&#128222;</div>
      <h3 style={{ margin: '0 0 8px', fontFamily: 'var(--display)' }}>Need Expert Help?</h3>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>
        If you're stuck, one tap opens an AR remote session with the on-call expert
        or an agentic assistant that escalates.
      </p>
      <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
        <button className="btn" style={{ background: '#7c3aed', color: '#fff', padding: '10px 20px',
          border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
          onClick={() => setCalled(true)}>
          <Icon n="ti-headset" /> Call Expert
        </button>
        <button className="btn" style={{ background: 'var(--surface2)', color: 'var(--text)', padding: '10px 20px',
          border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}
          onClick={() => onNext({ expertUsed: false })}>
          No help needed — continue
        </button>
      </div>
      {called && (
        <div style={{ marginTop: 16, padding: 12, background: '#f5f3ff', borderRadius: 8, fontSize: 12 }}>
          <b>Expert session connected.</b> Session recorded, tagged, and transcribed for training.
          <br />
          <button className="btn" style={{ background: 'var(--brand)', color: '#fff', padding: '8px 16px',
            border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600, marginTop: 8 }}
            onClick={() => onNext({ expertUsed: true })}>
            End session & continue
          </button>
        </div>
      )}
    </div>
  )
}

function StepCloseOut({ score, assignment, onNext }) {
  const [rating, setRating] = useState(0)
  return (
    <div style={{ textAlign: 'center', padding: '10px 0' }}>
      <div style={{ marginBottom: 16 }}>
        <ReadinessGauge score={score} size={100} />
      </div>
      <h3 style={{ margin: '0 0 8px', fontFamily: 'var(--display)' }}>Job Complete</h3>
      <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>
        <b>{assignment?.procedureName}</b> completed. Your readiness score has been updated.
      </p>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, color: 'var(--hint)', marginBottom: 6, fontWeight: 600 }}>Rate this assignment</div>
        <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
          {[1,2,3,4,5].map(n => (
            <button key={n} style={{ fontSize: 24, background: 'none', border: 'none', cursor: 'pointer',
              color: n <= rating ? '#f59e0b' : 'var(--border)' }}
              onClick={() => setRating(n)}>
              ★
            </button>
          ))}
        </div>
      </div>
      <button className="btn" style={{ background: '#16a34a', color: '#fff', padding: '12px 32px',
        border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 14 }}
        onClick={() => onNext({ rating, completed: true })}>
        <Icon n="ti-checkbox" /> Close Shift
      </button>
    </div>
  )
}
