// BuildTwin.jsx — "Build a twin from an image." A base Digital Twin feature.
//
// This is now REAL: you drop a photo / floor-plan, it's uploaded (as a data-URL)
// to the NextXR twin service through the gateway (POST /api/twin/agents/twin/
// build-from-plan). Vision parses it into a 3-D nxr-scene/1, the engine commits a
// live twin (graph + telemetry), and we render the reconstructed model right here
// with the ported 3-D viewer. "Open live dashboard" then attaches to that tenant.
//
// It degrades gracefully: if the twin service has no vision key or its DB is
// offline, build-from-plan still returns a synthesized 3-D scene (committed:false)
// so the model always renders.
import React, { useRef, useState } from 'react'
import { DOMAINS, Icon } from '../../lib.jsx'
import { useTwin } from '../../hub/twinState.jsx'
import { useAudit } from '../../hub/audit.jsx'
import API from '../../api.js'
import BimViewer from './scene/BimViewer.jsx'

const STAGES = [
  { k: 'upload', label: 'Uploading image', icon: 'ti-photo-up' },
  { k: 'vision', label: 'Vision → building/asset spec', icon: 'ti-eye-code' },
  { k: 'geometry', label: 'Reconstructing 3-D geometry', icon: 'ti-3d-cube-sphere' },
  { k: 'signals', label: 'Wiring telemetry & signals', icon: 'ti-plug-connected' },
  { k: 'seed', label: 'Committing live twin', icon: 'ti-cpu' },
]

// facilities the build-from-plan pipeline understands (BIM / building twins)
const FACILITIES = [
  { id: 'office', label: 'Office / Facility' },
  { id: 'datacenter', label: 'Data Center' },
  { id: 'hospital', label: 'Hospital' },
  { id: 'manufacturing', label: 'Manufacturing Plant' },
  { id: 'warehouse', label: 'Warehouse' },
  { id: 'ev-network', label: 'EV Charging Site' },
  { id: 'defence-base', label: 'Defence Base' },
]

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result)
    r.onerror = reject
    r.readAsDataURL(file)
  })
}

export default function BuildTwin({ onOpened }) {
  const { openExisting } = useTwin()
  const { log } = useAudit()
  const fileRef = useRef(null)
  const [facility, setFacility] = useState('office')
  const [floors, setFloors] = useState(1)
  const [name, setName] = useState('')
  const [preview, setPreview] = useState(null)   // data URL of the chosen image
  const [file, setFile] = useState(null)
  const [stage, setStage] = useState(-1)         // -1 idle, 0..n running, 99 done
  const [built, setBuilt] = useState(null)       // { tenant, scene, committed, twin_name, facility, parse_note }
  const [error, setError] = useState(null)
  const timer = useRef(null)

  const pick = async (f) => {
    if (!f) return
    setError(null)
    const url = await fileToDataURL(f)
    setFile(f); setPreview(url)
  }

  const build = async () => {
    if (!preview) { setError('Choose an image first.'); return }
    setError(null); setBuilt(null); setStage(0)
    // advance the pipeline stages visually while the API call runs
    let i = 0
    timer.current = setInterval(() => { i += 1; if (i < STAGES.length) setStage(i) }, 700)
    try {
      const res = await API.twin.buildFromPlan({
        data: preview,
        filename: file?.name || 'plan.png',
        name: name.trim() || undefined,
        facility,
        floors: Number(floors) || 1,
      })
      clearInterval(timer.current)
      setStage(99)
      setBuilt(res)
      log('twin', 'build', `Built twin "${res.twin_name}"`,
        `Reconstructed ${res.facility} from image · ${res.committed ? 'live twin committed' : '3-D only'}`)
    } catch (e) {
      clearInterval(timer.current)
      setStage(-1)
      setError(e?.detail || e?.message || 'Build failed — is the Digital Twin service running?')
    }
  }

  const openLive = () => {
    if (!built) return
    openExisting(built.tenant, built.facility, built.twin_name)
    onOpened && onOpened()
  }

  const reset = () => { setBuilt(null); setStage(-1); setPreview(null); setFile(null); setName('') }

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">Build a Twin</div>
          <div className="panel-subtitle">Drop a photo or 2-D plan — vision reconstructs a live 3-D digital twin.</div>
        </div>
        {built && <button className="btn" onClick={reset}><Icon n="ti-refresh" /> New</button>}
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        {/* ── Left: source + controls ── */}
        <div className="card">
          <div className="card-title"><Icon n="ti-photo-up" /> Source image</div>
          <input ref={fileRef} type="file" accept="image/*,.pdf" style={{ display: 'none' }}
            onChange={e => pick(e.target.files?.[0])} />
          <div className="build-drop" onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); pick(e.dataTransfer.files?.[0]) }}
            style={preview ? { padding: 0, overflow: 'hidden' } : undefined}>
            {preview
              ? <img src={preview} alt="source" style={{ width: '100%', display: 'block', maxHeight: 220, objectFit: 'contain' }} />
              : <>
                  <Icon n="ti-photo-plus" />
                  <div style={{ fontWeight: 600, fontSize: 13 }}>Drop a photo / floor plan, or click to browse</div>
                  <div className="hint" style={{ fontSize: 11 }}>PNG · JPG · PDF — a labelled plan gives the best rooms</div>
                </>}
          </div>

          <div style={{ marginTop: 14 }}>
            <div className="card-label" style={{ marginBottom: 6 }}>Facility type</div>
            <select className="select" value={facility} onChange={e => setFacility(e.target.value)}
              disabled={stage >= 0 && stage !== 99}>
              {FACILITIES.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </div>
          <div className="grid-2" style={{ marginTop: 12, gap: 12 }}>
            <div>
              <div className="card-label" style={{ marginBottom: 6 }}>Twin name</div>
              <input className="hub-input" value={name} onChange={e => setName(e.target.value)}
                placeholder={DOMAINS[facility]?.label || 'Facility Twin'} disabled={stage >= 0 && stage !== 99} />
            </div>
            <div>
              <div className="card-label" style={{ marginBottom: 6 }}>Floors</div>
              <input className="hub-input" type="number" min={1} max={12} value={floors}
                onChange={e => setFloors(e.target.value)} disabled={stage >= 0 && stage !== 99} />
            </div>
          </div>

          <button className="btn btn-primary" style={{ width: '100%', marginTop: 14, justifyContent: 'center' }}
            onClick={build} disabled={(stage >= 0 && stage !== 99) || !preview}>
            {stage >= 0 && stage !== 99 ? <><span className="spinner" /> Reconstructing…</> : <><Icon n="ti-sparkles" /> Generate 3-D twin</>}
          </button>
          {error && <div className="empty" style={{ color: 'var(--accent-red)', marginTop: 10, textAlign: 'left' }}>{error}</div>}
        </div>

        {/* ── Right: pipeline → 3-D result ── */}
        <div className="card" style={{ minHeight: 320 }}>
          <div className="card-title"><Icon n="ti-list-check" /> {built ? 'Reconstructed twin' : 'Reconstruction pipeline'}</div>

          {stage < 0 && <div className="empty" style={{ padding: '30px 10px' }}>Vision parse → 3-D geometry → telemetry → committed live twin.</div>}

          {stage >= 0 && !built && (
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

          {built && (
            <>
              <div style={{ height: 300, borderRadius: 12, overflow: 'hidden', position: 'relative', background: '#1b1e26' }}>
                <BimViewer scene={built.scene} tenant={built.tenant} />
              </div>
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Icon n="ti-circle-check" style={{ color: 'var(--accent-green)' }} />
                <b>{built.twin_name}</b>
                <span className={`pill ${built.committed ? 'pill-green' : 'pill-surface'}`} style={{ fontSize: 8 }}
                  title={built.committed ? 'Committed live on the twin service' : '3-D reconstructed; DB offline so not committed'}>
                  {built.committed ? '● live twin' : '◌ 3-D only'}
                </span>
                {built.synthesized && <span className="pill pill-amber" style={{ fontSize: 8 }} title={built.parse_note || ''}>synthesized (no vision key)</span>}
                <button className="btn btn-primary" style={{ marginLeft: 'auto', justifyContent: 'center' }} onClick={openLive}>
                  <Icon n="ti-bolt" /> Open live dashboard
                </button>
              </div>
              {built.parse_note && <div className="hint" style={{ fontSize: 11, marginTop: 6 }}>{built.parse_note}</div>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
