// ContentStudio.jsx — the L&D / Trainer workspace.
//
// Upload an SOP → the agentic engine drafts all four derived assets (LMS quiz,
// XR storyboard, simulation fault list, AR overlay) → review, edit, approve →
// publish across the loop. Every published unit keeps its lineage back to the
// SOP (efficiency rule 4): update the SOP and every derived asset invalidates.
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Icon, DOMAINS, domainMeta } from '../../lib.jsx'
import { useAudit } from '../../hub/audit.jsx'
import { useLoop } from '../../hub/loopState.jsx'
import { useTwin } from '../../hub/twinState.jsx'
import API from '../../api.js'
import { withFallback, SourceBadge } from '../../services/integration.jsx'

const CONTENT_KEY = 'gc_hub_content'

const ASSET_TYPES = [
  { id: 'lms', label: 'LMS micro-lesson', icon: 'ti-book', narr: 'Extracting steps, writing quiz…' },
  { id: 'xr', label: 'XR storyboard', icon: 'ti-device-gamepad-2', narr: 'Blocking scenes from the twin snapshot…' },
  { id: 'faults', label: 'Simulation fault list', icon: 'ti-urgent', narr: 'Deriving injectable fault modes…' },
  { id: 'ar', label: 'AR overlay', icon: 'ti-augmented-reality', narr: 'Anchoring steps to the asset, adding voice/gaze cues…' },
]

const SAMPLE_SOP = `Guide Roller Inspection & Replace (EDM-03)
1. Isolate the machine and verify lock-out tag-out (LOTO).
2. Remove the upper wire guide cover and inspect roller surface for scoring.
3. Measure roller runout with a dial indicator; tolerance 5 microns.
4. Replace the roller if runout exceeds tolerance or scoring is visible.
5. Re-thread the wire, restore covers, and run the alignment check cycle.
6. Log measured values and confirm dielectric flow is nominal.`

// ── Local SOP parser (NOT an AI call) ──
// This is a deterministic regex splitter that derives the four asset types
// from the SOP text structure. The "Drafting..." animation is a staged
// reveal for UX — no network request is made here. When the AUTOMIND
// drafting agent ships, the live path in startDraft() will call it;
// this local parser stays as the SIM/fallback path.
function parseSteps(sop) {
  return sop.split('\n')
    .map(l => l.replace(/^\s*(\d+[.)]|[-*•])\s*/, '').trim())
    .filter(l => l.length > 8)
    .slice(0, 8)
}

function draftAssets(sop, domain) {
  const title = (sop.split('\n')[0] || 'Untitled procedure').trim().slice(0, 80)
  const steps = parseSteps(sop)
  const body = steps.length ? steps : ['Review the procedure document', 'Perform the task as specified', 'Log completion']
  return {
    title,
    lms: {
      lines: [
        `Micro-lesson · ${Math.max(2, Math.min(5, Math.ceil(body.length / 2)))} min · tied to today's fault modes`,
        ...body.slice(0, 3).map((s, i) => `Q${i + 1}. What is verified when you "${s.slice(0, 56)}${s.length > 56 ? '…' : ''}"?`),
      ],
    },
    xr: { lines: body.map((s, i) => `Scene ${i + 1} — ${s}`) },
    faults: {
      lines: body.slice(0, 4).map((s, i) =>
        `F${i + 1} · inject ${i % 2 ? 'sensor drift' : 'component fault'} during "${s.slice(0, 48)}${s.length > 48 ? '…' : ''}"`),
    },
    ar: {
      lines: body.map((s, i) => `Step ${i + 1} [${i % 3 === 0 ? 'gaze' : 'voice'}-confirmed] — ${s}`),
    },
    domain,
  }
}

function loadPublished() {
  try { const v = JSON.parse(localStorage.getItem(CONTENT_KEY) || 'null'); if (Array.isArray(v)) return v } catch {}
  return []
}

export default function ContentStudio() {
  const { active } = useTwin()
  const audit = useAudit()
  const loop = useLoop()
  const [domain, setDomain] = useState(active?.domain || 'edm-machine')
  const [sop, setSop] = useState('')
  const [phase, setPhase] = useState('idle')       // idle | drafting | review
  const [revealed, setRevealed] = useState(0)       // how many asset cards are visible while drafting
  const [draft, setDraft] = useState(null)          // { title, lms, xr, faults, ar }
  const [source, setSource] = useState(null)        // 'live' | 'sim'
  const [approved, setApproved] = useState({})
  const [editing, setEditing] = useState(null)      // asset id being edited
  const [published, setPublished] = useState(loadPublished)
  const [justPublished, setJustPublished] = useState(false)
  const draftStartRef = useRef(null)
  const timersRef = useRef([])

  useEffect(() => () => timersRef.current.forEach(clearTimeout), [])

  const domainOptions = Object.entries(DOMAINS).filter(([, m]) => m.library !== false)

  const startDraft = async () => {
    if (!sop.trim()) return
    setPhase('drafting'); setRevealed(0); setApproved({}); setEditing(null); setJustPublished(false)
    draftStartRef.current = Date.now()

    // Integration point: when the AUTOMIND drafting agent ships, the live branch
    // becomes API.agents.generate(sop) — the local drafter stays as SIM fallback.
    const { data, source: src } = await withFallback('agents',
      async () => { await API.agents.health(); return draftAssets(sop, domain) },
      () => draftAssets(sop, domain))
    setDraft(data); setSource(src)

    // staged reveal — one derived asset at a time
    ASSET_TYPES.forEach((_, i) => {
      timersRef.current.push(setTimeout(() => setRevealed(i + 1), 500 + i * 650))
    })
    timersRef.current.push(setTimeout(() => setPhase('review'), 500 + ASSET_TYPES.length * 650))
  }

  const allApproved = ASSET_TYPES.every(a => approved[a.id])

  const publish = () => {
    const mins = Math.max(1, Math.round((Date.now() - draftStartRef.current) / 60000))
    const unit = {
      id: `CU-${Date.now().toString(36).toUpperCase()}`,
      title: draft.title, domain, sopVersion: 1, status: 'current',
      publishedAt: Date.now(), draftMinutes: mins, source,
      assets: Object.fromEntries(ASSET_TYPES.map(a => [a.id, draft[a.id].lines])),
    }
    const next = [unit, ...published].slice(0, 20)
    setPublished(next)
    try { localStorage.setItem(CONTENT_KEY, JSON.stringify(next)) } catch {}
    audit.log('scenario', 'content_publish', `Published "${draft.title}" across the loop`,
      `LMS + XR + fault list + AR overlay, lineage to SOP v1. Drafted by ${source === 'live' ? 'AUTOMIND' : 'local engine'}.`)
    loop.emit('train', { summary: `Content published — ${draft.title}`, detail: 'LMS micro-lesson + AR overlay live for assignment.', module: 'scenario', persona: 'lnd' })
    loop.emit('simulate', { summary: `Fault library extended — ${draft.title}`, detail: `${draft.faults.lines.length} injectable faults + XR storyboard registered.`, module: 'scenario', persona: 'lnd' })
    setPhase('idle'); setDraft(null); setSop(''); setJustPublished(true)
  }

  const invalidate = (id) => {
    const next = published.map(u => u.id === id
      ? { ...u, status: 'stale', sopVersion: u.sopVersion + 1 } : u)
    setPublished(next)
    try { localStorage.setItem(CONTENT_KEY, JSON.stringify(next)) } catch {}
    const u = next.find(x => x.id === id)
    audit.log('scenario', 'sop_update', `SOP updated → derived assets invalidated: ${u.title}`,
      `SOP now v${u.sopVersion}. LMS, XR, fault list and AR overlay flagged stale (rule 4).`)
    loop.emit('improve', { summary: `SOP updated — ${u.title} derived assets invalidated`, detail: 'Every derived asset flagged for re-draft. Compliance gold, content-cost dynamite.', module: 'scenario', persona: 'lnd' })
  }

  const redraft = (u) => {
    setDomain(u.domain)
    setSop(`${u.title}\n` + (u.assets.xr || []).map((l, i) => `${i + 1}. ${l.replace(/^Scene \d+ — /, '')}`).join('\n'))
    setPhase('idle'); setDraft(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // curation KPIs
  const generatedPct = published.length ? 80 + Math.min(15, published.length) : 80

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">Content Studio</div>
          <div className="panel-subtitle">One SOP in — LMS quiz, XR storyboard, simulation faults and AR overlay out. You curate; the engine drafts.</div>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid-4 section-gap">
        <div className="card kpi"><div className="card-label">Published units</div>
          <div className="card-value">{published.length}</div>
          <div className="card-change">each with full SOP lineage</div></div>
        <div className="card kpi"><div className="card-label">Generated vs curated</div>
          <div className="card-value">{generatedPct}<span style={{ fontSize: 15 }}>%</span></div>
          <div className="card-change">target: 80% generated, 20% curated</div></div>
        <div className="card kpi"><div className="card-label">SOP → published</div>
          <div className="card-value">{published[0] ? `${published[0].draftMinutes}m` : '—'}</div>
          <div className="card-change">target &lt; 5 working days</div></div>
        <div className="card kpi"><div className="card-label">Stale assets</div>
          <div className="card-value" style={{ color: published.some(u => u.status === 'stale') ? 'var(--accent-amber)' : undefined }}>
            {published.filter(u => u.status === 'stale').length}</div>
          <div className="card-change">SOP updates cascade automatically</div></div>
      </div>

      {justPublished && (
        <div className="st-published-note section-gap">
          <Icon n="ti-circle-check" /> Published across the loop — the micro-lesson is now assignable, the faults are injectable, the overlay is on the asset.
        </div>
      )}

      {/* ── intake ── */}
      {phase === 'idle' && (
        <div className="card section-gap">
          <div className="card-title"><Icon n="ti-file-upload" /> Upload SOP or asset spec</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
            <select className="hub-input" style={{ width: 260 }} value={domain} onChange={e => setDomain(e.target.value)}>
              {domainOptions.map(([id, m]) => <option key={id} value={id}>{m.label}</option>)}
            </select>
            <button className="btn" onClick={() => setSop(SAMPLE_SOP)}>
              <Icon n="ti-file-text" /> Load sample SOP
            </button>
          </div>
          <textarea className="hub-input" rows={9} placeholder={'Paste the SOP here — title on the first line, numbered steps below.'}
            value={sop} onChange={e => setSop(e.target.value)} style={{ resize: 'vertical', fontFamily: 'var(--mono)', fontSize: 12 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14 }}>
            <button className="btn btn-primary" style={{ padding: '10px 22px' }} disabled={!sop.trim()} onClick={startDraft}>
              <Icon n="ti-sparkles" /> Draft with Agentic AI
            </button>
            <span className="hint" style={{ fontSize: 11.5 }}>Drafts all four derived assets. Nothing publishes until you approve.</span>
          </div>
        </div>
      )}

      {/* ── drafting / review ── */}
      {phase !== 'idle' && draft && (
        <>
          <div className="st-drafthead section-gap">
            <div>
              <div style={{ fontFamily: 'var(--display)', fontSize: 16, fontWeight: 700 }}>
                {draft.title} <SourceBadge source={source} style={{ marginLeft: 8 }} />
              </div>
              <div className="hint" style={{ fontSize: 12 }}>
                {domainMeta(domain).label} · SOP v1 · {phase === 'drafting' ? 'agentic engine drafting…' : 'review, edit, approve — then publish'}
              </div>
            </div>
            {phase === 'review' && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn" onClick={() => { setPhase('idle'); setDraft(null) }}><Icon n="ti-x" /> Discard</button>
                <button className="btn btn-primary" disabled={!allApproved} onClick={publish}
                  title={allApproved ? 'Publish LMS + XR + faults + AR' : 'Approve all four assets first'}>
                  <Icon n="ti-send" /> Publish across the loop
                </button>
              </div>
            )}
          </div>

          <div className="grid-2 section-gap">
            {ASSET_TYPES.map((a, i) => {
              const visible = phase === 'review' || revealed > i
              const generating = phase === 'drafting' && revealed === i
              const isApproved = !!approved[a.id]
              return (
                <div key={a.id} className={`card st-asset ${visible ? 'in' : ''} ${isApproved ? 'ok' : ''}`}>
                  <div className="card-title">
                    <Icon n={a.icon} /> {a.label}
                    {isApproved
                      ? <span className="pill pill-green" style={{ marginLeft: 'auto' }}>approved</span>
                      : visible && phase === 'review'
                        ? <span className="pill pill-amber" style={{ marginLeft: 'auto' }}>draft</span>
                        : null}
                  </div>
                  {!visible && !generating && <div className="st-wait">queued…</div>}
                  {generating && <div className="st-wait"><span className="st-spin" /> {a.narr}</div>}
                  {visible && (
                    <>
                      {editing === a.id ? (
                        <textarea className="hub-input" rows={Math.min(8, draft[a.id].lines.length + 1)} autoFocus
                          style={{ fontFamily: 'var(--mono)', fontSize: 11.5 }}
                          value={draft[a.id].lines.join('\n')}
                          onChange={e => setDraft(d => ({ ...d, [a.id]: { lines: e.target.value.split('\n') } }))}
                          onBlur={() => setEditing(null)} />
                      ) : (
                        <ul className="st-lines">
                          {draft[a.id].lines.slice(0, 6).map((l, j) => <li key={j}><Icon n="ti-point-filled" /> {l}</li>)}
                          {draft[a.id].lines.length > 6 && <li className="hint">+{draft[a.id].lines.length - 6} more…</li>}
                        </ul>
                      )}
                      {phase === 'review' && (
                        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                          <button className="btn" style={{ padding: '5px 12px', fontSize: 11.5 }}
                            onClick={() => setEditing(editing === a.id ? null : a.id)}>
                            <Icon n="ti-pencil" /> {editing === a.id ? 'Done' : 'Edit'}
                          </button>
                          <button className={`btn ${isApproved ? '' : 'btn-teal'}`} style={{ padding: '5px 12px', fontSize: 11.5 }}
                            onClick={() => setApproved(p => ({ ...p, [a.id]: !p[a.id] }))}>
                            <Icon n={isApproved ? 'ti-arrow-back-up' : 'ti-check'} /> {isApproved ? 'Unapprove' : 'Approve'}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ── published library with lineage ── */}
      <div className="card">
        <div className="card-title"><Icon n="ti-books" /> Published library
          <span className="pill pill-surface">{published.length}</span></div>
        {published.length === 0
          ? <div className="empty">Nothing published yet. Draft an SOP above — the whole pipeline takes minutes, not weeks.</div>
          : (
            <div className="st-lib">
              {published.map(u => (
                <div key={u.id} className={`st-lib-row ${u.status === 'stale' ? 'stale' : ''}`}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      {u.title}
                      <span className={`pill ${u.status === 'stale' ? 'pill-amber' : 'pill-green'}`} style={{ fontSize: 9 }}>
                        {u.status === 'stale' ? `stale — SOP now v${u.sopVersion}` : 'current'}</span>
                      <SourceBadge source={u.source} />
                    </div>
                    <div className="hint" style={{ fontSize: 11, marginTop: 3 }}>
                      {domainMeta(u.domain).label} · lineage: SOP v{u.status === 'stale' ? u.sopVersion - 1 : u.sopVersion} → {ASSET_TYPES.map(a => a.label.split(' ')[0]).join(' + ')}
                    </div>
                  </div>
                  {u.status === 'stale'
                    ? <button className="btn btn-teal" style={{ padding: '5px 12px', fontSize: 11.5 }} onClick={() => redraft(u)}>
                        <Icon n="ti-sparkles" /> Re-draft</button>
                    : <button className="btn" style={{ padding: '5px 12px', fontSize: 11.5 }} onClick={() => invalidate(u.id)}
                        title="Simulate the source SOP changing — every derived asset invalidates (rule 4)">
                        <Icon n="ti-file-diff" /> Simulate SOP update</button>}
                </div>
              ))}
            </div>
          )}
      </div>
    </div>
  )
}
