// NetworkMap.jsx — Singapore MRT line map with animated train positions,
// station inspection and live headway/passenger stats. Railway vertical.
import React, { useState, useMemo, useEffect, useRef } from 'react'
import { Icon } from '../../lib.jsx'
import { useTwin } from '../../hub/twinState.jsx'

const LINES = [
  { id: 'NSL', label: 'North-South', color: '#e11d48', stations: ['Jurong East','Bukit Batok','Bukit Gombak','Choa Chu Kang','Yew Tee','Kranji','Marsiling','Woodlands','Admiralty','Sembawang','Canberra','Yishun','Khatib','Ang Mo Kio','Bishan','Braddell','Toa Payoh','Novena','Newton','Orchard','Somerset','Dhoby Ghaut','City Hall','Raffles Place','Marina Bay','Marina South Pier'] },
  { id: 'EWL', label: 'East-West', color: '#16a34a', stations: ['Tuas Link','Tuas West Rd','Tuas Crescent','Gul Circle','Joo Koon','Pioneer','Boon Lay','Lakeside','Chinese Garden','Jurong East','Clementi','Dover','Buona Vista','Commonwealth','Queenstown','Redhill','Tiong Bahru','Outram Park','Tanjong Pagar','Raffles Place','City Hall','Bugis','Lavender','Kallang','Aljunied','Paya Lebar','Eunos','Kembangan','Bedok','Tanah Merah','Simei','Tampines','Pasir Ris'] },
  { id: 'CCL', label: 'Circle', color: '#d97706', stations: ['Dhoby Ghaut','Bras Basah','Esplanade','Promenade','Nicoll Highway','Stadium','Mountbatten','Dakota','Paya Lebar','MacPherson','Tai Seng','Bartley','Serangoon','Lorong Chuan','Bishan','Marymount','Caldecott','Botanic Gardens','Farrer Road','Holland Village','Buona Vista','one-north','Kent Ridge','Haw Par Villa','Pasir Panjang','Labrador Park','Telok Blangah','HarbourFront'] },
  { id: 'DTL', label: 'Downtown', color: '#2563eb', stations: ['Bukit Panjang','Cashew','Hillview','Beauty World','King Albert Park','Sixth Avenue','Tan Kah Kee','Botanic Gardens','Stevens','Newton','Little India','Rochor','Bugis','Promenade','Bayfront','Downtown','Telok Ayer','Chinatown','Fort Canning','Bencoolen','Jalan Besar','Bendemeer','Geylang Bahru','Mattar','MacPherson','Ubi','Kaki Bukit','Bedok North','Bedok Reservoir','Tampines West','Tampines','Tampines East','Upper Changi','Expo'] },
  { id: 'TEL', label: 'Thomson-EL', color: '#7c3aed', stations: ['Woodlands North','Woodlands','Woodlands South','Springleaf','Lentor','Mayflower','Bright Hill','Upper Thomson','Caldecott','Stevens','Napier','Orchard Boulevard','Orchard','Great World','Havelock','Outram Park','Maxwell','Shenton Way','Marina Bay','Gardens by the Bay','Tanjong Rhu','Katong Park','Tanjong Katong','Marine Parade','Marine Terrace','Siglap','Bayshore'] },
]

function genTrains(lineId, count) {
  const arr = []
  for (let i = 0; i < count; i++) {
    arr.push({ id: `${lineId}-${String(i+1).padStart(2,'0')}`, pos: Math.random(), speed: 0.003 + Math.random() * 0.004, dir: Math.random() > 0.5 ? 1 : -1, load: Math.round(40 + Math.random() * 55) })
  }
  return arr
}

export default function NetworkMap() {
  const { twin } = useTwin()
  const [selected, setSelected] = useState('NSL')
  const [inspect, setInspect] = useState(null)
  const [trains, setTrains] = useState(() => {
    const m = {}; LINES.forEach(l => { m[l.id] = genTrains(l.id, 6 + Math.floor(Math.random() * 4)) }); return m
  })

  const line = LINES.find(l => l.id === selected)
  const live = twin?.latest || {}

  // animate trains
  useEffect(() => {
    const iv = setInterval(() => {
      setTrains(prev => {
        const next = {}
        for (const [lid, arr] of Object.entries(prev)) {
          next[lid] = arr.map(t => {
            let p = t.pos + t.speed * t.dir
            let d = t.dir
            if (p > 1) { p = 1; d = -1 }
            if (p < 0) { p = 0; d = 1 }
            return { ...t, pos: p, dir: d, load: Math.max(10, Math.min(100, t.load + (Math.random() - 0.5) * 4)) }
          })
        }
        return next
      })
    }, 800)
    return () => clearInterval(iv)
  }, [])

  const lineTrains = trains[selected] || []
  const stationCount = line?.stations.length || 0

  // SVG layout
  const W = 820, H = 260, padX = 40, padY = 50
  const stationPositions = useMemo(() => {
    if (!line) return []
    return line.stations.map((name, i) => {
      const frac = i / (line.stations.length - 1)
      // slight sine curve for visual appeal
      const x = padX + frac * (W - 2 * padX)
      const y = H / 2 + Math.sin(frac * Math.PI * 2.2) * 40
      return { name, x, y, frac }
    })
  }, [selected])

  const pathD = useMemo(() => {
    if (stationPositions.length < 2) return ''
    return 'M ' + stationPositions.map(s => `${s.x},${s.y}`).join(' L ')
  }, [stationPositions])

  const headway = live['rail:headway'] ?? 105
  const paxLoad = live['rail:passengerLoad'] ?? 72
  const doorCycle = live['rail:doorCycleTime'] ?? 4.2

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title"><Icon n="ti-train" /> Network Map</div>
          <div className="panel-subtitle">Singapore MRT -- live train positions and station telemetry</div>
        </div>
        <div className="panel-actions">
          <span className="pill pill-green">LIVE</span>
        </div>
      </div>

      {/* Line selector pills */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {LINES.map(l => (
          <button key={l.id} className={`pill ${selected === l.id ? '' : 'pill-surface'}`}
            style={selected === l.id ? { background: l.color, color: '#fff', cursor: 'pointer', border: 'none' } : { cursor: 'pointer', border: 'none' }}
            onClick={() => { setSelected(l.id); setInspect(null) }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 3, background: l.color, marginRight: 4 }} />
            {l.id}
          </button>
        ))}
      </div>

      {/* KPI strip */}
      <div className="grid-4 section-gap">
        <div className="card kpi"><div className="card-label">Trains on Line</div><div className="card-value">{lineTrains.length}</div><div className="card-change">{stationCount} stations</div></div>
        <div className="card kpi"><div className="card-label">Avg Headway</div><div className="card-value">{Math.round(headway)}<span style={{ fontSize: 13 }}>s</span></div><div className="card-change" style={{ color: headway > 120 ? 'var(--accent-red)' : 'var(--accent-green)' }}>{headway > 120 ? 'DELAYED' : 'NORMAL'}</div></div>
        <div className="card kpi"><div className="card-label">Passenger Load</div><div className="card-value">{Math.round(paxLoad)}<span style={{ fontSize: 13 }}>%</span></div><div className="card-change">{paxLoad > 90 ? 'crowded' : 'comfortable'}</div></div>
        <div className="card kpi"><div className="card-label">Door Cycle</div><div className="card-value">{doorCycle.toFixed(1)}<span style={{ fontSize: 13 }}>s</span></div><div className="card-change">avg dwell</div></div>
      </div>

      {/* SVG Map */}
      <div className="card" style={{ position: 'relative', padding: 0, overflow: 'hidden' }}>
        <div className="netmap" style={{ position: 'relative', height: H + 40 }}>
          <svg width="100%" height={H + 40} viewBox={`0 0 ${W} ${H + 40}`} style={{ display: 'block' }}>
            {/* track line */}
            <path d={pathD} fill="none" stroke={line?.color || '#999'} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity="0.3" />
            <path d={pathD} fill="none" stroke={line?.color || '#999'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="3.2 3.2" className="netmap-flash" />

            {/* stations */}
            {stationPositions.map((s, i) => (
              <g key={i} style={{ cursor: 'pointer' }} onClick={() => setInspect(s)}>
                <circle cx={s.x} cy={s.y} r={inspect?.name === s.name ? 8 : 5} fill={line?.color || '#999'} opacity={inspect?.name === s.name ? 1 : 0.7} />
                <circle cx={s.x} cy={s.y} r={3} fill="#fff" />
                {(i % 3 === 0 || inspect?.name === s.name) && (
                  <text x={s.x} y={s.y - 12} textAnchor="middle" fontSize="8" fill="var(--muted)" fontWeight={inspect?.name === s.name ? 700 : 400}>{s.name}</text>
                )}
              </g>
            ))}

            {/* animated trains */}
            {lineTrains.map(t => {
              const frac = t.pos
              const idx = frac * (stationPositions.length - 1)
              const lo = Math.floor(idx), hi = Math.min(lo + 1, stationPositions.length - 1)
              const mix = idx - lo
              const cx = stationPositions[lo].x + (stationPositions[hi].x - stationPositions[lo].x) * mix
              const cy = stationPositions[lo].y + (stationPositions[hi].y - stationPositions[lo].y) * mix
              const col = t.load > 85 ? '#e11d48' : t.load > 65 ? '#d97706' : '#16a34a'
              return (
                <g key={t.id}>
                  <circle cx={cx} cy={cy} r={6} fill={col} opacity="0.85" className="netmap-pulse" />
                  <circle cx={cx} cy={cy} r={3} fill="#fff" />
                </g>
              )
            })}
          </svg>

          {/* Inspector panel */}
          {inspect && (
            <div className="netmap-inspect">
              <button className="x" onClick={() => setInspect(null)}><Icon n="ti-x" /></button>
              <div className="t"><i style={{ background: line?.color }} />{inspect.name}</div>
              <div className="r"><span>Headway</span><b>{(90 + Math.random() * 30).toFixed(0)}s</b></div>
              <div className="r"><span>Pax load</span><b>{(50 + Math.random() * 45).toFixed(0)}%</b></div>
              <div className="r"><span>Door cycles</span><b>{(3.5 + Math.random() * 2).toFixed(1)}s</b></div>
              <div className="r"><span>Platform temp</span><b>{(28 + Math.random() * 4).toFixed(1)} C</b></div>
              <div className="r"><span>Escalators</span><b>{Math.random() > 0.2 ? 'OK' : 'FAULT'}</b></div>
              <div className="r"><span>PSD status</span><b>{Math.random() > 0.1 ? 'Normal' : 'Alert'}</b></div>
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 11, color: 'var(--muted)' }}>
        <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#16a34a', marginRight: 4 }} />Normal load</span>
        <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#d97706', marginRight: 4 }} />High load</span>
        <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#e11d48', marginRight: 4 }} />Crowded</span>
      </div>
    </div>
  )
}
