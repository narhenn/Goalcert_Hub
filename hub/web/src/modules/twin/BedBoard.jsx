// BedBoard.jsx — Hospital ward bed board: occupancy grid with ward selection,
// bed status colors, click-to-inspect patient summary. Hospital vertical.
import React, { useState, useMemo, useEffect } from 'react'
import { Icon } from '../../lib.jsx'
import { useTwin } from '../../hub/twinState.jsx'

const WARDS = [
  { id: 'icu', label: 'ICU', beds: 12, icon: 'ti-heartbeat' },
  { id: 'general', label: 'General', beds: 30, icon: 'ti-bed' },
  { id: 'paediatric', label: 'Paediatric', beds: 16, icon: 'ti-baby-carriage' },
  { id: 'surgical', label: 'Surgical', beds: 20, icon: 'ti-cut' },
  { id: 'ed', label: 'ED', beds: 18, icon: 'ti-urgent' },
]

const STATUSES = ['empty', 'occupied', 'discharge', 'isolation']
const STATUS_COLOR = { empty: 'var(--accent-green)', occupied: 'var(--accent-blue)', discharge: 'var(--accent-amber)', isolation: 'var(--accent-red)' }
const STATUS_LABEL = { empty: 'Empty', occupied: 'Occupied', discharge: 'Discharge Planned', isolation: 'Isolation' }

const FIRST_NAMES = ['Tan','Lim','Wong','Ng','Lee','Koh','Chua','Chen','Goh','Ong','Yeo','Low','Teo','Sim','Ho','Ang']
const CONDITIONS = ['Post-op recovery','Acute respiratory','Cardiac monitoring','Sepsis protocol','Fracture reduction','Pneumonia','Diabetic ketoacidosis','Stroke observation','Appendectomy','Dehydration','Chest pain evaluation','Asthma exacerbation']

function genBeds(ward) {
  const beds = []
  for (let i = 0; i < ward.beds; i++) {
    const r = Math.random()
    const status = r > 0.75 ? 'empty' : r > 0.15 ? 'occupied' : r > 0.06 ? 'discharge' : 'isolation'
    beds.push({
      id: `${ward.id.toUpperCase()}-${String(i + 1).padStart(2, '0')}`,
      ward: ward.id,
      status,
      patient: status !== 'empty' ? {
        initials: FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)].substring(0, 1) + FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)].substring(0, 1),
        age: Math.round(20 + Math.random() * 65),
        gender: Math.random() > 0.5 ? 'M' : 'F',
        condition: CONDITIONS[Math.floor(Math.random() * CONDITIONS.length)],
        los: Math.round(1 + Math.random() * 12),
        acuity: Math.random() > 0.7 ? 'High' : Math.random() > 0.3 ? 'Medium' : 'Low',
        nurse: `RN-${String(Math.floor(Math.random() * 20) + 1).padStart(2, '0')}`,
      } : null,
    })
  }
  return beds
}

export default function BedBoard() {
  const { twin } = useTwin()
  const [activeWard, setActiveWard] = useState('icu')
  const [allBeds, setAllBeds] = useState(() => {
    const m = {}; WARDS.forEach(w => { m[w.id] = genBeds(w) }); return m
  })
  const [selected, setSelected] = useState(null)

  const live = twin?.latest || {}
  const ward = WARDS.find(w => w.id === activeWard)
  const beds = allBeds[activeWard] || []

  // drift bed statuses
  useEffect(() => {
    const iv = setInterval(() => {
      setAllBeds(prev => {
        const next = { ...prev }
        for (const wid of Object.keys(next)) {
          next[wid] = next[wid].map(b => {
            if (Math.random() < 0.03) {
              const r = Math.random()
              const status = r > 0.72 ? 'empty' : r > 0.12 ? 'occupied' : r > 0.04 ? 'discharge' : 'isolation'
              if (status === 'empty') return { ...b, status, patient: null }
              if (b.patient) return { ...b, status, patient: { ...b.patient, los: b.patient.los + 1 } }
              return { ...b, status, patient: {
                initials: FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)].substring(0, 1) + FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)].substring(0, 1),
                age: Math.round(20 + Math.random() * 65), gender: Math.random() > 0.5 ? 'M' : 'F',
                condition: CONDITIONS[Math.floor(Math.random() * CONDITIONS.length)],
                los: 0, acuity: Math.random() > 0.7 ? 'High' : 'Medium', nurse: `RN-${String(Math.floor(Math.random() * 20) + 1).padStart(2, '0')}`,
              }}
            }
            return b
          })
        }
        return next
      })
    }, 3000)
    return () => clearInterval(iv)
  }, [])

  const stats = useMemo(() => {
    const occupied = beds.filter(b => b.status !== 'empty').length
    const total = beds.length
    const pctOcc = total > 0 ? Math.round((occupied / total) * 100) : 0
    const avgLos = beds.filter(b => b.patient).reduce((a, b) => a + b.patient.los, 0) / (occupied || 1)
    const discharges = beds.filter(b => b.status === 'discharge').length
    const isolations = beds.filter(b => b.status === 'isolation').length
    return { occupied, total, pctOcc, avgLos: avgLos.toFixed(1), discharges, isolations }
  }, [beds])

  const gridCols = ward.beds <= 12 ? 4 : ward.beds <= 20 ? 5 : 6

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title"><Icon n="ti-bed" /> Bed Board</div>
          <div className="panel-subtitle">St. Vera Hospital -- real-time ward occupancy and patient flow</div>
        </div>
        <div className="panel-actions"><span className="pill pill-green">LIVE</span></div>
      </div>

      {/* Ward selector */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {WARDS.map(w => (
          <button key={w.id} className={`btn ${activeWard === w.id ? 'btn-primary' : ''}`}
            style={{ fontSize: 12 }} onClick={() => { setActiveWard(w.id); setSelected(null) }}>
            <Icon n={w.icon} /> {w.label} <span className="pill pill-surface" style={{ marginLeft: 4 }}>{w.beds}</span>
          </button>
        ))}
      </div>

      {/* Stats strip */}
      <div className="grid-4 section-gap">
        <div className="card kpi"><div className="card-label">Occupancy</div>
          <div className="card-value" style={{ color: stats.pctOcc > 90 ? 'var(--accent-red)' : stats.pctOcc > 75 ? 'var(--accent-amber)' : 'var(--accent-green)' }}>{stats.pctOcc}%</div>
          <div className="card-change">{stats.occupied} / {stats.total} beds</div>
        </div>
        <div className="card kpi"><div className="card-label">Avg Length of Stay</div><div className="card-value">{stats.avgLos}<span style={{ fontSize: 13 }}> days</span></div><div className="card-change">current ward</div></div>
        <div className="card kpi"><div className="card-label">Pending Discharges</div><div className="card-value" style={{ color: 'var(--accent-amber)' }}>{stats.discharges}</div><div className="card-change">planned today</div></div>
        <div className="card kpi"><div className="card-label">Isolation</div><div className="card-value" style={{ color: stats.isolations > 0 ? 'var(--accent-red)' : 'var(--accent-green)' }}>{stats.isolations}</div><div className="card-change">{stats.isolations > 0 ? 'active isolation' : 'none'}</div></div>
      </div>

      <div className="grid-2 section-gap">
        {/* Bed grid */}
        <div className="card">
          <div className="card-title"><Icon n={ward.icon} /> {ward.label} Ward</div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${gridCols}, 1fr)`, gap: 8 }}>
            {beds.map(b => {
              const isSel = selected?.id === b.id
              return (
                <div key={b.id} onClick={() => setSelected(b)} style={{
                  padding: '10px 8px', borderRadius: 10, cursor: 'pointer',
                  background: isSel ? 'var(--brand-soft)' : 'var(--surface2)',
                  border: isSel ? '2px solid var(--brand)' : '1px solid var(--border)',
                  textAlign: 'center', transition: 'all .15s',
                }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: STATUS_COLOR[b.status], margin: '0 auto 6px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon n={b.status === 'isolation' ? 'ti-lock' : b.status === 'empty' ? 'ti-bed' : 'ti-user'} />
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 600, fontFamily: 'var(--mono)' }}>{b.id}</div>
                  {b.patient && <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>{b.patient.initials} / {b.patient.age}{b.patient.gender}</div>}
                </div>
              )
            })}
          </div>

          {/* Legend */}
          <div style={{ display: 'flex', gap: 12, marginTop: 12, fontSize: 10, color: 'var(--muted)', flexWrap: 'wrap' }}>
            {STATUSES.map(s => (
              <span key={s}><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 3, background: STATUS_COLOR[s], marginRight: 4 }} />{STATUS_LABEL[s]}</span>
            ))}
          </div>
        </div>

        {/* Inspector */}
        <div className="card">
          {selected ? (
            <>
              <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span><Icon n="ti-bed" /> Bed {selected.id}</span>
                <button className="btn btn-ghost" style={{ padding: '2px 6px', fontSize: 13 }} onClick={() => setSelected(null)}><Icon n="ti-x" /></button>
              </div>
              <div style={{ marginBottom: 10 }}>
                <span className="pill" style={{ background: STATUS_COLOR[selected.status], color: '#fff' }}>{STATUS_LABEL[selected.status]}</span>
              </div>
              {selected.patient ? (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div className="kpibox"><div className="l">Patient</div><div className="v" style={{ fontSize: 16 }}>{selected.patient.initials}</div></div>
                    <div className="kpibox"><div className="l">Age / Gender</div><div className="v" style={{ fontSize: 16 }}>{selected.patient.age} {selected.patient.gender}</div></div>
                    <div className="kpibox"><div className="l">Acuity</div><div className="v" style={{ fontSize: 15, color: selected.patient.acuity === 'High' ? 'var(--accent-red)' : selected.patient.acuity === 'Medium' ? 'var(--accent-amber)' : 'var(--accent-green)' }}>{selected.patient.acuity}</div></div>
                    <div className="kpibox"><div className="l">LoS</div><div className="v" style={{ fontSize: 16 }}>{selected.patient.los} <span style={{ fontSize: 11 }}>days</span></div></div>
                  </div>
                  <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 10, background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 12 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>Condition</div>
                    <div style={{ color: 'var(--muted)' }}>{selected.patient.condition}</div>
                  </div>
                  <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 10, background: 'var(--surface2)', border: '1px solid var(--border)', fontSize: 12 }}>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>Assigned Nurse</div>
                    <div style={{ color: 'var(--muted)' }}>{selected.patient.nurse}</div>
                  </div>
                  {selected.status === 'isolation' && (
                    <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 10, background: 'rgba(225,29,72,.06)', border: '1px solid rgba(225,29,72,.2)', fontSize: 12, color: 'var(--accent-red)' }}>
                      <Icon n="ti-alert-triangle" /> Isolation precautions active. Negative pressure room. PPE required for entry.
                    </div>
                  )}
                </>
              ) : (
                <div className="empty" style={{ marginTop: 8 }}>Bed is empty and available for admission.</div>
              )}
            </>
          ) : (
            <div className="empty">Click any bed to view patient summary, acuity level and assigned nurse.</div>
          )}
        </div>
      </div>
    </div>
  )
}
