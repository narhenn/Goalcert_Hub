// BuildTwin.jsx — "Build a twin from an image." Full 5-step flow:
//   1. Pick a domain
//   2. AI chat to describe the asset (calls build-from-plan with chat history)
//   3. Upload a photo (drag-drop + click, preview)
//   4. Reconstruct 3D model (calls API, polls status, shows GLB preview)
//   5. Confirm → wire live twin (physics, sensors, agents)
//
// Adapted from Tejesh's real 3D-reconstruction pipeline in the Collins demo,
// ported to the Hub's import paths, CSS classes, API gateway and auth model.
import React, { useEffect, useRef, useState } from 'react'
import { DOMAINS, Icon } from '../../lib.jsx'
import { useTwin } from '../../hub/twinState.jsx'
import { useAudit } from '../../hub/audit.jsx'
import API from '../../api.js'
import GlbViewer from './scene/views/GlbViewer.jsx'

// All GoalCert verticals + generics
const BUILD_DOMAINS = [
  { key: 'turbine-engine', icon: 'ti-engine',               label: 'Gas Turbine',    tag: 'Aerospace MRO',       color: '#2563eb' },
  { key: 'mrt-line',       icon: 'ti-train',                label: 'Railway',         tag: 'MRT / Metro',         color: '#0ea5e9' },
  { key: 'ev-network',     icon: 'ti-charging-pile',        label: 'EV Network',      tag: 'EV Charging',         color: '#22c55e' },
  { key: 'hospital',       icon: 'ti-building-hospital',    label: 'Hospital',        tag: 'Healthcare',          color: '#14b8a6' },
  { key: 'defence-base',   icon: 'ti-shield-chevron',       label: 'Defence',         tag: 'Defence Base',        color: '#6366f1' },
  { key: 'manufacturing',  icon: 'ti-building-factory-2',   label: 'Manufacturing',   tag: 'Industrial',          color: '#f59e0b' },
  { key: 'datacenter',     icon: 'ti-server-2',             label: 'Data Center',     tag: 'IT Infrastructure',   color: '#0ea5e9' },
]

export default function BuildTwin({ onOpened }) {
  const { openExisting } = useTwin()
  const { log: auditLog } = useAudit()

  const [history, setHistory] = useState([])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [machineName, setMachineName] = useState('')
  const [image, setImage] = useState(null)
  const [drag, setDrag] = useState(false)
  const [domain, setDomain] = useState('turbine-engine')
  const [quality, setQuality] = useState('fast')
  const [provider, setProvider] = useState(null)
  const [log, setLog] = useState([])
  const [err, setErr] = useState(null)

  // model reconstruction (step 4)
  const [modelStage, setModelStage] = useState('idle')   // idle | generating | ready | failed
  const [modelTaskId, setModelTaskId] = useState(null)
  const [modelPreview, setModelPreview] = useState(null)  // GLB url for preview

  // twin creation (step 5)
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState(null)            // {tenant, machine, modelUrl}

  const fileRef = useRef(null)
  const pollRef = useRef(null)
  const msgsRef = useRef(null)

  // Kick off the AI chat on mount
  useEffect(() => {
    API.twin.buildMessage({ history: [], message: '' }).then(r => {
      setHistory([{ role: 'assistant', content: r.reply }])
    }).catch(() => setHistory([{ role: 'assistant', content:
      "Hi! I'm the Twin Builder. Tell me about the machine or equipment you want to twin, then upload a photo." }]))
  }, [])

  // Auto-scroll chat
  useEffect(() => { if (msgsRef.current) msgsRef.current.scrollTop = msgsRef.current.scrollHeight }, [history, thinking])

  // Cleanup polling on unmount
  useEffect(() => () => clearInterval(pollRef.current), [])

  const domInfo = BUILD_DOMAINS.find(d => d.key === domain) || BUILD_DOMAINS[0]
  const nameOf = () => machineName || domInfo.label
  const addLog = (entry) => setLog(l => [...l, entry])

  // ── Step 2: AI chat ──
  async function send() {
    const m = input.trim(); if (!m) return
    const h = [...history, { role: 'user', content: m }]
    setHistory(h); setInput(''); setThinking(true)
    try {
      const r = await API.twin.buildMessage({ history, message: m })
      setHistory([...h, { role: 'assistant', content: r.reply }])
      if (r.machine_name) setMachineName(r.machine_name)
    } catch (e) { setHistory([...h, { role: 'assistant', content: 'Error: ' + e.message }]) }
    setThinking(false)
  }

  // ── Step 3: photo upload ──
  function loadFile(f) {
    if (!f) return
    const r = new FileReader()
    r.onload = () => setImage({ b64: r.result, name: f.name, preview: r.result })
    r.readAsDataURL(f)
  }

  // ── Step 4: reconstruct 3D model ──
  async function generateModel() {
    if (!image) { setErr('Drop a photo of the asset first.'); return }
    setErr(null); setModelStage('generating'); setModelPreview(null); setModelTaskId(null)
    setCreated(null)
    setLog([{ t: `> reconstructing 3D model — quality: ${quality}`, acc: true }])
    try {
      const r = await API.twin.buildModel({ image_b64: image.b64, filename: image.name || 'asset.png', quality })
      setProvider(r.provider || null)
      if (r.status === 'no_key') {
        addLog({ t: 'No 3D provider configured (set RUNPOD_API_KEY or TRIPO_API_KEY in .env)', warn: true })
        setModelStage('failed'); return
      }
      if (!r.task_id) { addLog({ t: '3D generation: ' + r.status, warn: true }); setModelStage('failed'); return }
      const pName = r.provider === 'runpod' ? 'RunPod TRELLIS' : r.provider || '3D engine'
      addLog({ t: `${pName}: reconstructing from your photo (first run can take ~2 min on a cold GPU)...`, acc: true })
      pollModel(r.task_id, pName)
    } catch (e) { setErr(String(e.message || e)); setModelStage('failed') }
  }

  function pollModel(taskId, pName) {
    let n = 0
    clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      n++
      try {
        const s = await API.twin.buildStatus(taskId)
        if (s.progress != null && n % 3 === 0) addLog({ t: `${pName}: ${s.status} ${s.progress || 0}%` })
        if (s.status === 'success' && s.model_url) {
          clearInterval(pollRef.current)
          setModelTaskId(taskId); setModelPreview(API.twin.modelUrl(taskId))
          setModelStage('ready')
          addLog({ t: '3D model reconstructed — review it, then confirm', ok: true })
        } else if (s.status === 'failed' || s.status === 'error') {
          clearInterval(pollRef.current)
          addLog({ t: `${pName} failed: ${s.detail || s.status}`, warn: true }); setModelStage('failed')
        }
      } catch { /* keep polling */ }
      if (n > 160) { clearInterval(pollRef.current); setModelStage('failed'); addLog({ t: 'timed out', warn: true }) }
    }, 2500)
  }

  function regenerate() {
    clearInterval(pollRef.current)
    setModelStage('idle'); setModelPreview(null); setModelTaskId(null)
  }

  // ── Step 5: confirm → wire the live twin ──
  async function confirmModel() {
    setCreating(true); setErr(null)
    addLog({ t: '> wiring digital twin: physics, behaviours, sensors', acc: true })
    try {
      const r = await API.twin.buildCreate({ machine: nameOf(), domain, model_task_id: modelTaskId })
      const modelUrl = r.model_url || (modelTaskId ? API.twin.modelUrl(modelTaskId) : null)
      setCreated({ tenant: r.tenant, machine: r.machine, modelUrl })
      addLog({ t: `Live ${domInfo.label} twin created — sensors streaming`, ok: true })
      auditLog('twin', 'build', `Built twin "${r.machine || nameOf()}"`,
        `Reconstructed ${domInfo.label} from image, live twin committed`)
    } catch (e) { setErr(String(e.message || e)) }
    setCreating(false)
  }

  function openLive() {
    if (!created) return
    openExisting(created.tenant, domain, created.machine || nameOf())
    onOpened && onOpened()
  }

  function reset() {
    clearInterval(pollRef.current)
    setModelStage('idle'); setModelPreview(null); setModelTaskId(null)
    setCreated(null); setImage(null); setHistory([]); setMachineName('')
    setLog([]); setErr(null); setProvider(null)
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">Build a Twin</div>
          <div className="panel-subtitle">Drop a photo, we reconstruct the 3D model, you confirm it, we wire a live digital twin (physics, sensors and AI agents) around it.</div>
        </div>
        {created && <button className="btn" onClick={reset}><Icon n="ti-refresh" /> New</button>}
      </div>
      {err && <div className="card" style={{ borderColor: 'rgba(225,29,72,.4)', color: 'var(--accent-red)', marginBottom: 16 }}>{err}</div>}

      {/* Step 1: Domain selector */}
      <div className="card section-gap">
        <div className="card-title"><Icon n="ti-category" /> 1. Select Domain</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {BUILD_DOMAINS.map(d => (
            <button key={d.key} className={`btn ${domain === d.key ? 'btn-primary' : ''}`}
              onClick={() => setDomain(d.key)}
              style={domain === d.key ? { background: d.color, borderColor: 'transparent', boxShadow: `0 4px 14px ${d.color}44` } : {}}>
              <Icon n={d.icon} /> {d.label}
              <span className="hint" style={{ marginLeft: 2, fontSize: 10, color: domain === d.key ? 'rgba(255,255,255,.7)' : undefined }}>{d.tag}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid-2">
        {/* Left: chat + upload + reconstruct */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Step 2: AI chat */}
          <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="card-title"><Icon n="ti-sparkles" /> 2. Describe Your Asset <span className="pill pill-purple">agent</span></div>
            <div ref={msgsRef} style={{ flex: 1, minHeight: 150, maxHeight: 220, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, padding: '2px' }}>
              {history.map((m, i) => (
                <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '85%',
                  padding: '10px 13px', borderRadius: 14, fontSize: 12.5, lineHeight: 1.55,
                  background: m.role === 'user' ? 'var(--gradient)' : 'var(--surface2)',
                  color: m.role === 'user' ? '#fff' : 'var(--text)',
                  border: m.role === 'user' ? 'none' : '1px solid var(--border)' }}>
                  {m.role === 'assistant' && <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3, fontWeight: 600 }}>Twin Builder</div>}
                  {m.content}
                </div>
              ))}
              {thinking && <div style={{ alignSelf: 'flex-start' }}><span className="spinner" /></div>}
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <input className="hub-input" value={input} placeholder="e.g. A TFE731 turbofan on a test stand..."
                onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} style={{ flex: 1 }} />
              <button className="btn btn-primary" onClick={send}><Icon n="ti-send" /></button>
            </div>
          </div>

          {/* Step 3: photo upload */}
          <div className="card">
            <div className="card-title"><Icon n="ti-photo" /> 3. Upload Asset Photo</div>
            <div style={{ border: `2px dashed ${drag ? domInfo.color : 'var(--border2)'}`,
              borderRadius: 14, background: drag ? `${domInfo.color}11` : 'var(--brand-softer)',
              padding: 18, textAlign: 'center', cursor: 'pointer', transition: 'all .2s' }}
              onClick={() => fileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); setDrag(true) }}
              onDragLeave={() => setDrag(false)}
              onDrop={e => { e.preventDefault(); setDrag(false); loadFile(e.dataTransfer.files[0]) }}>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
                onChange={e => loadFile(e.target.files[0])} />
              {image
                ? <div style={{ position: 'relative', display: 'inline-block' }}>
                    <img src={image.preview} alt="asset" style={{ maxHeight: 130, borderRadius: 12, border: '2px solid var(--border)' }} />
                    <button onClick={e => { e.stopPropagation(); setImage(null) }}
                      style={{ position: 'absolute', top: -8, right: -8, width: 24, height: 24, borderRadius: '50%',
                        background: 'var(--accent-red)', color: '#fff', border: 'none', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>x</button>
                  </div>
                : <><div style={{ fontSize: 28, color: domInfo.color }}><Icon n="ti-cloud-upload" /></div>
                    <div style={{ fontWeight: 600, marginTop: 6, fontSize: 13 }}>Drop a photo of your {domInfo.label.toLowerCase()}</div>
                    <div className="hint" style={{ fontSize: 11, marginTop: 4 }}>PNG / JPG — any angle works, clean background is best</div></>}
            </div>
          </div>

          {/* Step 4: quality + reconstruct */}
          <div className="card">
            <div className="card-title"><Icon n="ti-wand" /> 4. Reconstruct 3D Model</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <div className="card-label" style={{ alignSelf: 'center', marginBottom: 0 }}>Quality:</div>
              <button className={`btn ${quality === 'fast' ? 'btn-primary' : ''}`} onClick={() => setQuality('fast')} style={{ fontSize: 11 }}>
                <Icon n="ti-bolt" /> Fast</button>
              <button className={`btn ${quality === 'high' ? 'btn-primary' : ''}`} onClick={() => setQuality('high')} style={{ fontSize: 11 }}>
                <Icon n="ti-diamond" /> High Quality</button>
            </div>
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '12px 0' }}
              onClick={generateModel} disabled={modelStage === 'generating' || creating || !image}>
              {modelStage === 'generating'
                ? <><span className="spinner" /> Reconstructing 3D model...</>
                : <><Icon n="ti-cube-3d-sphere" /> Reconstruct 3D Model</>}
            </button>
          </div>
        </div>

        {/* Right: 3D preview + confirm/regenerate */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card">
            <div className="card-title">
              <Icon n="ti-cube" /> Reconstructed 3D Model
              {provider && <span className="pill pill-blue" style={{ fontSize: 9 }}>{provider === 'runpod' ? 'RunPod TRELLIS' : provider}</span>}
              {modelStage === 'ready' && <span className="pill pill-green" style={{ marginLeft: 'auto' }}>ready</span>}
            </div>

            {modelStage === 'ready' && modelPreview
              ? <GlbViewer url={modelPreview} height={340} label="Reconstructed model" />
              : <div style={{ height: 340, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: '#0b0d18', borderRadius: 12, textAlign: 'center', color: '#aab0e0',
                  fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }}>
                  <div>
                    <div style={{ fontSize: 32, marginBottom: 8 }}><Icon n={domInfo.icon} /></div>
                    <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>{domInfo.label}</div>
                    {modelStage === 'generating'
                      ? <div><span className="spinner" style={{ borderTopColor: '#7c3aed' }} />
                          <span style={{ marginLeft: 8 }}>Reconstructing 3D model from your photo...</span></div>
                      : modelStage === 'failed'
                        ? <div style={{ color: 'var(--accent-red)' }}>Reconstruction failed — check the build log and retry.</div>
                        : <div>Upload a photo and hit <b>Reconstruct 3D Model</b></div>}
                  </div>
                </div>}

            {/* Confirm / regenerate */}
            {modelStage === 'ready' && !created && (
              <div style={{ marginTop: 12 }}>
                <div className="hint" style={{ fontSize: 12, marginBottom: 8 }}>
                  Happy with the reconstruction? Confirm to wire a live twin around it — or regenerate.
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={confirmModel} disabled={creating}>
                    {creating ? <><span className="spinner" /> Building twin...</> : <><Icon n="ti-check" /> 5. Confirm and build twin</>}
                  </button>
                  <button className="btn" onClick={regenerate} disabled={creating}><Icon n="ti-refresh" /> Regenerate</button>
                </div>
              </div>
            )}

            {/* Twin created — open live dashboard */}
            {created && (
              <div className="card" style={{ marginTop: 12, borderColor: 'rgba(22,163,74,.4)', background: 'rgba(22,163,74,.06)' }}>
                <div style={{ fontWeight: 700, color: 'var(--accent-green)' }}><Icon n="ti-circle-check" /> Live {domInfo.label} twin created</div>
                <div style={{ fontSize: 12.5, marginTop: 4, color: 'var(--muted)' }}>
                  Physics, behaviours and sensor telemetry are wired to the reconstructed model and streaming now.
                </div>
                <div className="row" style={{ gap: 8, marginTop: 12 }}>
                  <button className="btn btn-primary" onClick={openLive}><Icon n="ti-layout-dashboard" /> Open live dashboard</button>
                </div>
              </div>
            )}
          </div>

          {/* Build log */}
          {log.length > 0 && (
            <div className="card">
              <div className="card-title"><Icon n="ti-terminal-2" /> Build Log
                {provider && <span className="pill pill-surface" style={{ fontSize: 9 }}>{provider}</span>}
              </div>
              <div className="mono" style={{ fontSize: 11, maxHeight: 180, overflowY: 'auto', lineHeight: 1.8 }}>
                {log.map((l, i) => (
                  <div key={i} style={{ color: l.ok ? 'var(--accent-green)' : l.warn ? 'var(--accent-amber)' : l.acc ? 'var(--brand)' : 'var(--muted)',
                    animation: 'fadeIn .3s ease', padding: '1px 0' }}>{l.t}</div>
                ))}
              </div>
            </div>
          )}

          {/* How it works (shown when idle) */}
          {modelStage === 'idle' && !created && (
            <div className="card" style={{ background: 'var(--brand-softer)', border: '1px solid var(--brand-ring)' }}>
              <div className="card-title" style={{ fontSize: 12 }}><Icon n="ti-info-circle" /> How it works</div>
              <div style={{ fontSize: 11.5, lineHeight: 1.7, color: 'var(--muted)' }}>
                <div style={{ marginBottom: 6 }}><b>1.</b> Pick the domain and (optionally) describe the asset via AI chat</div>
                <div style={{ marginBottom: 6 }}><b>2.</b> Upload a photo — we reconstruct a 3D model on a GPU</div>
                <div style={{ marginBottom: 6 }}><b>3.</b> Preview and confirm the model (or regenerate)</div>
                <div><b>4.</b> We wire a live digital twin around it — physics, sensor telemetry and AI agents</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
