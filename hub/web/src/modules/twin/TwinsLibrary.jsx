// TwinsLibrary.jsx — the Digital Twin module's entry surface.
//
// Two sections, mirroring the NextXR platform's own Twins page:
//   • My Twins — every twin that actually EXISTS on the twin service (built
//     from the library, from an image, or on the service itself). Open attaches
//     to the live tenant; delete removes it from the service.
//   • Twin Library — the domain templates (AssetPicker) to create/open new ones.
import React, { useCallback, useEffect, useState } from 'react'
import { Icon } from '../../lib.jsx'
import AssetPicker from '../AssetPicker.jsx'
import { useTwin } from '../../hub/twinState.jsx'
import { domainMeta as machineMeta } from './scene/machine.js'
import API from '../../api.js'

const dateOf = (iso) => { try { return new Date(iso).toLocaleDateString() } catch { return '' } }

export default function TwinsLibrary({ onOpen, onOpenExisting, active, onBuild, canBuild }) {
  const { serviceMode, active: activeTwin } = useTwin()
  const [twins, setTwins] = useState([])
  const [busy, setBusy] = useState(null)

  const refresh = useCallback(() => {
    if (serviceMode !== 'live') { setTwins([]); return }
    API.twin.list()
      .then(r => setTwins(r?.twins || []))
      .catch(() => setTwins([]))
  }, [serviceMode])
  useEffect(() => { refresh() }, [refresh])

  const remove = async (e, t) => {
    e.stopPropagation()
    if (!window.confirm(`Delete twin "${t.name}"? This removes its graph entities from the twin service.`)) return
    setBusy(t.tenant_id)
    try { await API.twin.remove(t.tenant_id) } catch { /* keep the card; refresh below reconciles */ }
    setBusy(null)
    refresh()
  }

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">Twins</div>
          <div className="panel-subtitle">Open a live digital twin, or build a new one from a 2-D image.</div>
        </div>
        {canBuild && (
          <div className="panel-actions">
            <button className="btn btn-primary" onClick={onBuild}><Icon n="ti-sparkles" /> Build from image</button>
          </div>
        )}
      </div>

      {/* ── My Twins — real instances living on the twin service ── */}
      {twins.length > 0 && (
        <div className="section-gap">
          <div className="card-label" style={{ marginBottom: 10 }}><Icon n="ti-device-floppy" /> My Twins
            <span className="pill pill-green" style={{ marginLeft: 8, fontSize: 9 }}>● live on the twin service</span>
          </div>
          <div className="grid-3">
            {twins.map((t) => {
              const m = machineMeta(t.domain)
              const isActive = activeTwin?.tenant === t.tenant_id
              return (
                <div key={t.tenant_id} className="card twin-card" style={{ cursor: 'pointer', position: 'relative',
                  borderColor: isActive ? m.accent : undefined }}
                  onClick={() => onOpenExisting && onOpenExisting(t)}>
                  <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, borderRadius: '16px 16px 0 0',
                    background: `linear-gradient(90deg, ${m.accent}, ${m.accent}88)` }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, marginTop: 4 }}>
                    <div className="agent-icon" style={{ background: `${m.accent}18`, color: m.accent }}><Icon n={m.icon} /></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--display)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{m.label !== t.domain ? m.label : t.domain}</div>
                    </div>
                    {isActive && <span className="pill pill-green" style={{ fontSize: 9 }}>ACTIVE</span>}
                    <span title="Delete twin" onClick={(e) => remove(e, t)}
                      style={{ cursor: 'pointer', color: 'var(--hint)', fontSize: 15 }}>
                      {busy === t.tenant_id ? <span className="spinner" style={{ width: 12, height: 12 }} /> : <Icon n="ti-trash" />}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>
                    <span><Icon n="ti-cube" /> {t.summary?.total ?? 0} entities</span>
                    <span><Icon n="ti-calendar" /> {dateOf(t.created_at)}</span>
                  </div>
                  <button className="btn btn-primary" style={{ width: '100%', marginTop: 10, background: m.accent, borderColor: 'transparent' }}
                    onClick={(e) => { e.stopPropagation(); onOpenExisting && onOpenExisting(t) }}>
                    <Icon n="ti-bolt" /> Open dashboard
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Twin Library — domain templates ── */}
      <div className="card-label" style={{ margin: '4px 0 10px' }}><Icon n="ti-stack-2" /> Twin Library</div>
      <AssetPicker onOpen={onOpen} active={active} />
      <div className="cta-band" style={{ marginTop: 18 }}>
        <h3>One backbone, any twin</h3>
        <p>Every twin runs on the same ontology + behaviour engine: live telemetry, a 3-tier findings
          pipeline and predictive RUL. Add the Scenario Engine to drill it, or the Agentic AI layer to
          reason over it — the hub composes exactly what you've enabled.</p>
      </div>
    </div>
  )
}
