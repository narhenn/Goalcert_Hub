// BuildTwin.jsx — "Build a twin from an image." A base Digital Twin feature even
// though it uses AI (vision → twin spec): it belongs to the twin, not the agent layer.
// Frontend-only staged simulation of the generate → preview → attach pipeline.
import React, { useEffect, useRef, useState } from 'react'
import { DOMAINS, Icon } from '../../lib.jsx'
import { useTwin } from '../../hub/twinState.jsx'
import { useAudit } from '../../hub/audit.jsx'

const STAGES = [
  { k: 'segment', label: 'Isolating subject', icon: 'ti-crop' },
  { k: 'vision', label: 'Vision → twin spec', icon: 'ti-eye-code' },
  { k: 'geometry', label: 'Reconstructing geometry', icon: 'ti-3d-cube-sphere' },
  { k: 'signals', label: 'Wiring telemetry & signals', icon: 'ti-plug-connected' },
  { k: 'seed', label: 'Seeding physics & behaviour', icon: 'ti-cpu' },
]

export default function BuildTwin({ onOpened }) {
  const { openTwin } = useTwin()
  const { log } = useAudit()
  const [domain, setDomain] = useState('manufacturing')
  const [name, setName] = useState('')
  const [stage, setStage] = useState(-1)   // -1 idle, 0..n running, 99 done
  const timer = useRef(null)
  const simDomains = Object.keys(DOMAINS).filter(k => DOMAINS[k].source === 'sim' && DOMAINS[k].library !== false)

  useEffect(() => () => timer.current && clearInterval(timer.current), [])

  const build = () => {
    setStage(0)
    let i = 0
    timer.current = setInterval(() => {
      i += 1
      if (i >= STAGES.length) { clearInterval(timer.current); setStage(99) }
      else setStage(i)
    }, 750)
  }
  const twinName = name.trim() || DOMAINS[domain].label
  const open = () => {
    log('twin', 'build', `Built twin "${twinName}"`, `Reconstructed ${DOMAINS[domain].label} from image`)
    openTwin(domain, twinName); onOpened && onOpened()
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">Build a Twin</div>
          <div className="panel-subtitle">Turn a photo into a live digital twin — vision maps it to a domain, physics seeds it.</div>
        </div>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-title"><Icon n="ti-photo-up" /> Source image</div>
          <div className="build-drop" onClick={stage < 0 ? build : undefined}>
            <Icon n="ti-photo-plus" />
            <div style={{ fontWeight: 600, fontSize: 13 }}>Drop an image, or use a sample</div>
            <div className="hint" style={{ fontSize: 11 }}>2–4 views give higher fidelity</div>
          </div>
          <div style={{ marginTop: 14 }}>
            <div className="card-label" style={{ marginBottom: 6 }}>Target domain</div>
            <select className="select" value={domain} onChange={e => setDomain(e.target.value)} disabled={stage >= 0 && stage !== 99}>
              {simDomains.map(k => <option key={k} value={k}>{DOMAINS[k].label}</option>)}
            </select>
          </div>
          <div style={{ marginTop: 12 }}>
            <div className="card-label" style={{ marginBottom: 6 }}>Twin name</div>
            <input className="hub-input" value={name} onChange={e => setName(e.target.value)}
              placeholder={DOMAINS[domain].label} disabled={stage >= 0 && stage !== 99} />
          </div>
          <button className="btn btn-primary" style={{ width: '100%', marginTop: 14, justifyContent: 'center' }}
            onClick={build} disabled={stage >= 0 && stage !== 99}>
            {stage >= 0 && stage !== 99 ? <><span className="spinner" /> Generating…</> : <><Icon n="ti-sparkles" /> Generate twin</>}
          </button>
        </div>

        <div className="card">
          <div className="card-title"><Icon n="ti-list-check" /> Generation pipeline</div>
          {stage < 0 && <div className="empty" style={{ padding: '30px 10px' }}>The 19-stage pipeline runs here — segment, vision spec, geometry, signals, seed.</div>}
          {stage >= 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {STAGES.map((s, i) => {
                const done = stage === 99 || i < stage
                const now = stage !== 99 && i === stage
                return (
                  <div key={s.k} className={`build-stage ${done ? 'done' : ''} ${now ? 'now' : ''}`}>
                    <span className="build-stage-ic"><Icon n={done ? 'ti-check' : s.icon} /></span>
                    <span style={{ flex: 1 }}>{s.label}</span>
                    {now && <span className="spinner" />}
                    {done && <span className="pill pill-green" style={{ fontSize: 9 }}>done</span>}
                  </div>
                )
              })}
            </div>
          )}
          {stage === 99 && (
            <div style={{ marginTop: 14, padding: '14px 16px', background: 'rgba(22,163,74,.05)',
              border: '1px solid rgba(22,163,74,.2)', borderRadius: 12 }}>
              <div style={{ fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon n="ti-circle-check" style={{ color: 'var(--accent-green)' }} /> {twinName} is ready</div>
              <div className="hint" style={{ fontSize: 12, marginBottom: 12 }}>Geometry reconstructed, telemetry wired, physics seeded.</div>
              <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={open}>
                <Icon n="ti-bolt" /> Open live dashboard</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
