// lib.jsx — shared brand, helpers, signal metadata, and the twin-domain registry.
import React from 'react'

// Goalcert logo mark (from the demo): ring + bars in a purple→blue gradient.
export function Logo({ size = 32 }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html:
        `<svg viewBox="0 0 120 120" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
          <defs><linearGradient id="gcg" x1="14" y1="14" x2="106" y2="106" gradientUnits="userSpaceOnUse">
            <stop stop-color="#7c3aed"/><stop offset="1" stop-color="#2563eb"/></linearGradient></defs>
          <circle cx="60" cy="62" r="33" stroke="url(#gcg)" stroke-width="13" fill="none"/>
          <rect x="53" y="11" width="14" height="100" rx="3" fill="url(#gcg)"/>
          <rect x="44" y="11" width="32" height="9" rx="3" fill="url(#gcg)"/>
          <rect x="44" y="102" width="32" height="9" rx="3" fill="url(#gcg)"/>
        </svg>` }} />
  )
}

export const Icon = ({ n }) => <i className={`ti ${n}`} />

// ── Animated count-up hook ──────────────────────────────────────────
export function useCountUp(target, duration = 800) {
  const [value, setValue] = React.useState(0)
  const prevRef = React.useRef(0)
  React.useEffect(() => {
    if (target == null || isNaN(target)) { setValue(0); return }
    const from = prevRef.current, to = target
    const start = performance.now()
    let raf
    const step = (now) => {
      const k = Math.min(1, (now - start) / duration)
      const ease = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2
      setValue(from + (to - from) * ease)
      if (k < 1) raf = requestAnimationFrame(step)
      else prevRef.current = to
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return value
}

// ── SVG Health Ring ─────────────────────────────────────────────────
export function HealthRing({ value, size = 72, stroke = 6, label }) {
  const r = (size - stroke) / 2
  const circ = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, value ?? 0))
  const offset = circ * (1 - v)
  const color = v >= 0.6 ? '#16a34a' : v >= 0.4 ? '#d97706' : '#e11d48'
  return (
    <div className="health-ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#ebe9f2" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={circ} strokeDashoffset={offset} className="health-ring-fg" />
      </svg>
      <div className="health-ring-label">
        <span style={{ fontFamily: 'var(--display)', fontSize: size * 0.24, fontWeight: 700, color }}>{Math.round(v * 100)}</span>
        {label && <span style={{ fontSize: 8, color: '#9aa1ad', textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</span>}
      </div>
    </div>
  )
}

// ── Sparkline (inline SVG mini trend) ───────────────────────────────
export function Sparkline({ data, width = 56, height = 22, color = '#7c3aed' }) {
  if (!data || data.length < 2) return null
  const min = Math.min(...data), max = Math.max(...data)
  const range = max - min || 1
  const pts = data.map((v, i) =>
    `${(i / (data.length - 1)) * width},${height - ((v - min) / range) * (height - 2) - 1}`
  ).join(' ')
  return (
    <svg className="sparkline" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx={width} cy={height - ((data[data.length-1] - min) / range) * (height - 2) - 1}
        r="2" fill={color} />
    </svg>
  )
}

// ── Signal display metadata + thresholds ─────────────────────────────
// One flat map across every domain. Keys are namespaced (aero:, edm:, dc:…)
// so they never collide; sevClass() and the tiles look up by key alone.
export const SIG = {
  // ── Gas turbine (aerospace) — mirrors turbine/physics.py redlines ──
  'aero:exhaustGasTemp': { label: 'EGT', unit: '°C', warn: 700, crit: 780, icon: 'ti-flame' },
  'aero:shaftSpeedN1': { label: 'N1', unit: 'RPM', warn: 5450, crit: 5500, icon: 'ti-rotate-clockwise' },
  'aero:shaftSpeedN2': { label: 'N2', unit: 'RPM', warn: 10700, crit: 10800, icon: 'ti-rotate-clockwise-2' },
  'aero:fuelFlow': { label: 'Fuel Flow', unit: 'kg/h', icon: 'ti-gas-station' },
  'aero:vibrationG': { label: 'Vibration', unit: 'g', warn: 1.5, crit: 2.0, icon: 'ti-activity' },
  'aero:oilTemperature': { label: 'Oil Temp', unit: '°C', warn: 80, crit: 85, icon: 'ti-temperature' },
  'aero:oilPressure': { label: 'Oil Press', unit: 'PSI', warnLow: 45, critLow: 40, icon: 'ti-gauge' },
  'aero:enginePressureRatio': { label: 'EPR', unit: '', icon: 'ti-chart-dots' },

  // ── Wire EDM — mirrors edm/physics.py redlines ──
  'edm:cuttingSpeed': { label: 'Cutting Speed', unit: 'mm²/min', icon: 'ti-slice' },
  'edm:shortCircuitRate': { label: 'Short-Circuit', unit: '%', warn: 12, crit: 20, icon: 'ti-plug-connected-x' },
  'edm:wireBreakRisk': { label: 'Wire-Break Risk', unit: '%', warn: 42, crit: 70, icon: 'ti-alert-triangle' },
  'edm:dielectricTemperature': { label: 'Dielectric Temp', unit: '°C', warn: 29, crit: 32, icon: 'ti-temperature' },
  'edm:dielectricConductivity': { label: 'Conductivity', unit: 'µS/cm', warn: 21, crit: 25, icon: 'ti-bolt' },
  'edm:wireTension': { label: 'Wire Tension', unit: 'N', warnLow: 8, critLow: 6, icon: 'ti-line-dashed' },
  'edm:gapVoltage': { label: 'Gap Voltage', unit: 'V', warnLow: 31, critLow: 25, icon: 'ti-bolt' },
  'edm:dielectricPressure': { label: 'Flush Pressure', unit: 'bar', warnLow: 4.5, critLow: 3, icon: 'ti-gauge' },
  'edm:dielectricFlow': { label: 'Flush Flow', unit: 'L/min', warnLow: 4, critLow: 2.5, icon: 'ti-droplet' },
  'edm:peakCurrent': { label: 'Peak Current', unit: 'A', icon: 'ti-flash' },
  'edm:pulseOnTime': { label: 'Pulse On (Ton)', unit: 'µs', icon: 'ti-square' },
  'edm:pulseOffTime': { label: 'Pulse Off (Toff)', unit: 'µs', icon: 'ti-square-dot' },
  'edm:sparkFrequency': { label: 'Spark Freq', unit: 'kHz', icon: 'ti-wave-sine' },
  'edm:dischargeEnergy': { label: 'Discharge Energy', unit: 'mJ', icon: 'ti-flame' },
  'edm:sparkGap': { label: 'Spark Gap', unit: 'µm', icon: 'ti-arrows-horizontal' },
  'edm:surfaceRoughnessRa': { label: 'Surface Ra', unit: 'µm', warn: 2.5, crit: 3.2, icon: 'ti-wave-saw-tool' },
  'edm:wireFeedRate': { label: 'Wire Feed', unit: 'm/min', icon: 'ti-arrow-bar-to-down' },
  'edm:wireWear': { label: 'Wire Wear', unit: '%', warn: 60, crit: 85, icon: 'ti-circle-dashed' },

  // ── Tram fleet network — mirrors fleet/physics.py redlines ──
  'fleet:onTimePerformance': { label: 'On-Time Performance', unit: '%', warnLow: 75, critLow: 65, icon: 'ti-clock-check' },
  'fleet:headwayAdherence': { label: 'Headway Adherence', unit: '%', warnLow: 80, critLow: 70, icon: 'ti-arrows-horizontal' },
  'fleet:networkSpeed': { label: 'Network Speed', unit: 'km/h', warnLow: 11, critLow: 8, icon: 'ti-gauge' },
  'fleet:fleetAvailability': { label: 'Fleet Availability', unit: '%', warnLow: 85, critLow: 78, icon: 'ti-bus' },
  'fleet:tramsInService': { label: 'Trams In Service', unit: '', icon: 'ti-train' },
  'fleet:passengerLoad': { label: 'Passenger Load', unit: '%', warn: 90, crit: 110, icon: 'ti-users' },
  'fleet:avgDwellTime': { label: 'Avg Dwell', unit: 's', warn: 40, crit: 55, icon: 'ti-hourglass' },
  'fleet:tractionPower': { label: 'Traction Power', unit: 'MW', warn: 32, crit: 40, icon: 'ti-bolt' },
  'fleet:regenShare': { label: 'Regen Share', unit: '%', warnLow: 14, critLow: 8, icon: 'ti-recycle' },
  'fleet:overheadVoltage': { label: 'OHL Voltage', unit: 'V', warnLow: 555, critLow: 520, icon: 'ti-bolt' },
  'fleet:substationLoad': { label: 'Substation Load', unit: '%', warn: 85, crit: 95, icon: 'ti-building-factory' },
  'fleet:railTemperature': { label: 'Rail Temp', unit: '°C', warn: 42, crit: 47, icon: 'ti-temperature' },
  'fleet:switchFaults': { label: 'Switch Faults', unit: '', warn: 4, crit: 8, icon: 'ti-arrows-split' },
  'fleet:signalFaults': { label: 'Signal Faults', unit: '', warn: 3, crit: 5, icon: 'ti-traffic-lights' },
  'fleet:doorFaults': { label: 'Door Faults', unit: '', warn: 7, crit: 10, icon: 'ti-door' },
  'fleet:brakeWear': { label: 'Brake Wear', unit: '%', warn: 55, crit: 70, icon: 'ti-circle-dashed' },
  'fleet:pantographWear': { label: 'Pantograph Wear', unit: '%', warn: 60, crit: 75, icon: 'ti-antenna' },
  'fleet:tractionMotorTemp': { label: 'Traction Motor', unit: '°C', warn: 95, crit: 105, icon: 'ti-engine' },
  'fleet:bogieVibration': { label: 'Bogie Vibration', unit: 'g', warn: 0.9, crit: 1.2, icon: 'ti-activity' },
  'fleet:networkDelay': { label: 'Network Delay', unit: 'min', warn: 60, crit: 120, icon: 'ti-clock-exclamation' },
  'fleet:activeIncidents': { label: 'Incidents', unit: '', warn: 2, crit: 4, icon: 'ti-urgent' },
  'fleet:hvacLoad': { label: 'HVAC Load', unit: '%', warn: 80, crit: 92, icon: 'ti-air-conditioning' },

  // ── Data center (simulated example) ──
  'dc:rackLoad': { label: 'Rack Load', unit: '%', warn: 85, crit: 95, icon: 'ti-server' },
  'dc:inletTemp': { label: 'Inlet Temp', unit: '°C', warn: 27, crit: 32, icon: 'ti-temperature' },
  'dc:coolingCOP': { label: 'Cooling COP', unit: '', warnLow: 3.2, critLow: 2.6, icon: 'ti-snowflake' },
  'dc:upsCharge': { label: 'UPS Charge', unit: '%', warnLow: 60, critLow: 40, icon: 'ti-battery-charging' },
  'dc:pue': { label: 'PUE', unit: '', warn: 1.6, crit: 1.9, icon: 'ti-bolt' },

  // ── Hospital (facility management) ──
  'hosp:orPressure': { label: 'OR Pressure', unit: 'Pa', warnLow: 8, critLow: 5, icon: 'ti-wind' },
  'hosp:airChanges': { label: 'Air Changes', unit: 'ACH', warnLow: 12, critLow: 9, icon: 'ti-air-conditioning' },
  'hosp:fridgeTemp': { label: 'Pharmacy Fridge', unit: '°C', warn: 7, crit: 9, icon: 'ti-temperature-snow' },
  'hosp:o2Pressure': { label: 'O₂ Pressure', unit: 'bar', warnLow: 3.6, critLow: 3.2, icon: 'ti-vaccine' },
  'hosp:nurseCalls': { label: 'Open Nurse Calls', unit: '', warn: 6, crit: 10, icon: 'ti-urgent' },
  'hosp:bedOccupancy': { label: 'Bed Occupancy', unit: '%', warn: 90, crit: 97, icon: 'ti-bed' },
  'hosp:orUtilisation': { label: 'OR Utilisation', unit: '%', icon: 'ti-calendar-event' },
  'hosp:edWaitTime': { label: 'ED Wait', unit: 'min', warn: 30, crit: 60, icon: 'ti-clock-exclamation' },
  'hosp:isolationPressure': { label: 'Isolation Room', unit: 'Pa', warn: -3, crit: -1, icon: 'ti-lock' },
  'hosp:steriliserF0': { label: 'Autoclave F₀', unit: '', warnLow: 15, critLow: 10, icon: 'ti-flame' },
  'hosp:waterReturnTemp': { label: 'HW Return', unit: '°C', warnLow: 50, critLow: 45, icon: 'ti-droplet' },
  'hosp:upsRuntime': { label: 'UPS Runtime', unit: 'min', warnLow: 20, critLow: 10, icon: 'ti-battery-charging' },

  // ── Manufacturing unit (simulated example) ──
  'mfg:oee': { label: 'OEE', unit: '%', warnLow: 75, critLow: 60, icon: 'ti-gauge' },
  'mfg:spindleVib': { label: 'Spindle Vib', unit: 'mm/s', warn: 4.5, crit: 7, icon: 'ti-activity' },
  'mfg:cycleTime': { label: 'Cycle Time', unit: 's', warn: 48, crit: 60, icon: 'ti-clock' },
  'mfg:motorTemp': { label: 'Motor Temp', unit: '°C', warn: 75, crit: 90, icon: 'ti-temperature' },
  'mfg:throughput': { label: 'Throughput', unit: 'u/h', warnLow: 90, critLow: 70, icon: 'ti-arrows-right' },

  // ── MRT / Rail transit ──
  'rail:headway': { label: 'Headway', unit: 's', warn: 120, crit: 180, icon: 'ti-arrows-horizontal' },
  'rail:tractionVoltage': { label: 'Traction Voltage', unit: 'V', warnLow: 680, critLow: 650, icon: 'ti-bolt' },
  'rail:passengerLoad': { label: 'Passenger Load', unit: '%', warn: 90, crit: 110, icon: 'ti-users' },
  'rail:doorCycleTime': { label: 'Door Cycle', unit: 's', warn: 6, crit: 8, icon: 'ti-door' },
  'rail:atpStatus': { label: 'ATP Mode', unit: '%', warnLow: 85, critLow: 70, icon: 'ti-shield-check' },
  'rail:energyPerKm': { label: 'Energy/km', unit: 'kWh', warn: 4.5, crit: 5.5, icon: 'ti-bolt' },
  'rail:platformDwell': { label: 'Platform Dwell', unit: 's', warn: 45, crit: 60, icon: 'ti-hourglass' },
  'rail:networkOTP': { label: 'On-Time Perf', unit: '%', warnLow: 90, critLow: 80, icon: 'ti-clock-check' },
  'rail:escalatorLoad': { label: 'Escalator Load', unit: '%', warn: 85, crit: 95, icon: 'ti-stairs-up' },
  'rail:tunnelTemp': { label: 'Tunnel Temp', unit: '°C', warn: 34, crit: 38, icon: 'ti-temperature' },
  'rail:switchFaults': { label: 'Switch Faults', unit: '', warn: 3, crit: 5, icon: 'ti-arrows-split' },
  'rail:signalFaults': { label: 'Signal Faults', unit: '', warn: 2, crit: 4, icon: 'ti-traffic-lights' },

  // ── EV / Charging / Battery ──
  'ev:stateOfCharge': { label: 'Fleet Avg SoC', unit: '%', warnLow: 25, critLow: 15, icon: 'ti-battery-3' },
  'ev:chargingPower': { label: 'Charging Power', unit: 'kW', icon: 'ti-bolt' },
  'ev:gridLoad': { label: 'Grid Load', unit: '%', warn: 85, crit: 95, icon: 'ti-building-factory' },
  'ev:stateOfHealth': { label: 'Battery SoH', unit: '%', warnLow: 78, critLow: 70, icon: 'ti-heart' },
  'ev:cellTempMax': { label: 'Cell Temp Max', unit: '°C', warn: 42, crit: 55, icon: 'ti-temperature' },
  'ev:chargerUptime': { label: 'Charger Uptime', unit: '%', warnLow: 92, critLow: 85, icon: 'ti-plug-connected' },
  'ev:sessionsActive': { label: 'Active Sessions', unit: '', icon: 'ti-plug-connected-x' },
  'ev:energyToday': { label: 'Energy Today', unit: 'MWh', icon: 'ti-bolt' },
  'ev:v2gCapacity': { label: 'V2G Available', unit: 'kWh', icon: 'ti-arrows-exchange' },
  'ev:thermalRunawayRisk': { label: 'Runaway Risk', unit: '%', warn: 15, crit: 40, icon: 'ti-alert-triangle' },
  'ev:transformerTemp': { label: 'Transformer', unit: '°C', warn: 85, crit: 105, icon: 'ti-temperature' },
  'ev:solarOutput': { label: 'Solar Output', unit: 'kW', icon: 'ti-sun' },

  // ── Defence (military base / naval) ──
  'def:perimeterAlerts': { label: 'Perimeter Alerts', unit: '', warn: 1, crit: 3, icon: 'ti-alert-triangle' },
  'def:radarCoverage': { label: 'Radar Coverage', unit: '%', warnLow: 85, critLow: 70, icon: 'ti-radar-2' },
  'def:forceReadiness': { label: 'Force Readiness', unit: '%', warnLow: 88, critLow: 75, icon: 'ti-shield-star' },
  'def:fuelReserve': { label: 'Fuel Reserve', unit: '%', warnLow: 30, critLow: 15, icon: 'ti-gas-station' },
  'def:commsLatency': { label: 'Comms Latency', unit: 'ms', warn: 50, crit: 100, icon: 'ti-antenna' },
  'def:powerGrid': { label: 'Power Grid', unit: '%', warnLow: 90, critLow: 75, icon: 'ti-bolt' },
  'def:shipListAngle': { label: 'Ship List', unit: '°', warn: 5, crit: 10, icon: 'ti-anchor' },
  'def:engineHrsToMaint': { label: 'Hrs to Maint', unit: 'h', warnLow: 20, critLow: 8, icon: 'ti-clock' },
  'def:ammoTemp': { label: 'Ammo Storage', unit: '°C', warn: 30, crit: 38, icon: 'ti-bomb' },
  'def:uasThreatLevel': { label: 'UAS Threat', unit: '', warn: 1, crit: 2, icon: 'ti-drone' },

  // ── Smart building (simulated example) ──
  'bldg:zoneTemp': { label: 'Zone Temp', unit: '°C', warn: 25, crit: 28, icon: 'ti-temperature' },
  'bldg:co2': { label: 'CO₂', unit: 'ppm', warn: 1000, crit: 1400, icon: 'ti-cloud' },
  'bldg:occupancy': { label: 'Occupancy', unit: '%', icon: 'ti-users' },
  'bldg:power': { label: 'Demand', unit: 'kW', warn: 180, crit: 220, icon: 'ti-bolt' },
  'bldg:chwTemp': { label: 'Chilled Water', unit: '°C', warn: 9, crit: 12, icon: 'ti-snowflake' },
}

// Turbine tile order kept for backward compatibility.
export const TILE_ORDER = ['aero:exhaustGasTemp', 'aero:shaftSpeedN1', 'aero:vibrationG',
  'aero:oilTemperature', 'aero:oilPressure', 'aero:fuelFlow', 'aero:shaftSpeedN2',
  'aero:enginePressureRatio']

// ── The twin-domain registry: what the Twins library offers ──────────
// source 'live' = real NextXR backend twin (physics + ontology + agents).
// source 'sim'  = a light, frontend-simulated example twin (visual + telemetry).
export const DOMAINS = {
  'edm-machine': {
    label: 'Wire EDM Machine', tag: 'Precision Machining', icon: 'ti-grill',
    accent: '#7c3aed', source: 'live', hero: 'edm', detailed: true,
    blurb: 'CNC wire-cut electrical-discharge machine, modelled to its discharge generator, dielectric & flushing, wire transport and guides — a full process-physics digital twin.',
    tiles: ['edm:cuttingSpeed', 'edm:shortCircuitRate', 'edm:wireBreakRisk', 'edm:dielectricTemperature',
      'edm:dielectricConductivity', 'edm:wireTension', 'edm:gapVoltage', 'edm:dielectricPressure'],
    all: ['edm:cuttingSpeed', 'edm:shortCircuitRate', 'edm:wireBreakRisk', 'edm:surfaceRoughnessRa',
      'edm:gapVoltage', 'edm:peakCurrent', 'edm:pulseOnTime', 'edm:pulseOffTime', 'edm:sparkFrequency',
      'edm:dischargeEnergy', 'edm:sparkGap', 'edm:wireTension', 'edm:wireFeedRate', 'edm:wireWear',
      'edm:dielectricFlow', 'edm:dielectricPressure', 'edm:dielectricTemperature', 'edm:dielectricConductivity'],
  },
  // Not listed in the Twins library, but kept so Build-a-Twin (image→3D) twins,
  // which are seeded as turbine-engine, still render their dashboard.
  'turbine-engine': {
    label: 'Gas Turbine Engine', tag: 'Aerospace MRO', icon: 'ti-engine',
    accent: '#2563eb', source: 'live', hero: 'turbine', detailed: true, library: false,
    blurb: 'A two-spool gas turbine on an MRO test rig: compressor / combustor / turbine modules with EGT, shaft speed, fuel flow, vibration and oil monitoring.',
    tiles: TILE_ORDER,
    all: TILE_ORDER,
  },
  'tram-network': {
    label: 'Melbourne Tram Network', tag: 'Fleet & Transit', icon: 'ti-train',
    accent: '#78be20', source: 'live', hero: 'network', detailed: true,
    blurb: 'The world\'s largest tram network as a live fleet twin: 24 routes, 400+ trams, traction power, track & points, signalling and service operations — with per-vehicle live positions. Feed any network spec to twin any fleet.',
    tiles: ['fleet:onTimePerformance', 'fleet:headwayAdherence', 'fleet:networkSpeed', 'fleet:fleetAvailability',
      'fleet:overheadVoltage', 'fleet:substationLoad', 'fleet:railTemperature', 'fleet:networkDelay'],
    all: ['fleet:onTimePerformance', 'fleet:headwayAdherence', 'fleet:networkSpeed', 'fleet:fleetAvailability',
      'fleet:tramsInService', 'fleet:passengerLoad', 'fleet:avgDwellTime', 'fleet:tractionPower',
      'fleet:regenShare', 'fleet:overheadVoltage', 'fleet:substationLoad', 'fleet:railTemperature',
      'fleet:switchFaults', 'fleet:signalFaults', 'fleet:doorFaults', 'fleet:brakeWear',
      'fleet:pantographWear', 'fleet:tractionMotorTemp', 'fleet:bogieVibration', 'fleet:networkDelay',
      'fleet:activeIncidents', 'fleet:hvacLoad'],
  },
  'datacenter': {
    label: 'Helix Data Center', tag: 'Data Center', icon: 'ti-server-2',
    accent: '#0ea5e9', source: 'sim', hero: 'grid',
    blurb: 'Server halls, CRAC cooling and UPS power with rack-level telemetry.',
    tiles: ['dc:rackLoad', 'dc:inletTemp', 'dc:coolingCOP', 'dc:upsCharge', 'dc:pue'],
    all: ['dc:rackLoad', 'dc:inletTemp', 'dc:coolingCOP', 'dc:upsCharge', 'dc:pue'],
    sim: {
      'dc:rackLoad': { base: 72, jit: 4, drift: 12 }, 'dc:inletTemp': { base: 24, jit: 1, drift: 5 },
      'dc:coolingCOP': { base: 3.8, jit: 0.15 }, 'dc:upsCharge': { base: 96, jit: 1 },
      'dc:pue': { base: 1.42, jit: 0.04, drift: 0.18 },
    },
    assets: [['RACK-A1', 'ok'], ['RACK-A4', 'warn'], ['RACK-B2', 'crit'], ['CRAC-1', 'ok'], ['UPS-1', 'ok'], ['CORE-SW', 'ok']],
  },
  'hospital': {
    label: 'St. Vera Hospital', tag: 'Healthcare', icon: 'ti-building-hospital',
    accent: '#0891b2', source: 'sim', hero: 'grid',
    blurb: 'Full hospital campus twin: operating theatre pressure cascade, medical gas pipeline monitoring, cold chain compliance, sterilisation F₀ tracking, patient flow, bed management and infection risk modeling.',
    tiles: ['hosp:orPressure', 'hosp:o2Pressure', 'hosp:fridgeTemp', 'hosp:bedOccupancy',
      'hosp:airChanges', 'hosp:edWaitTime', 'hosp:upsRuntime', 'hosp:nurseCalls'],
    all: ['hosp:orPressure', 'hosp:airChanges', 'hosp:fridgeTemp', 'hosp:o2Pressure', 'hosp:nurseCalls',
      'hosp:bedOccupancy', 'hosp:orUtilisation', 'hosp:edWaitTime', 'hosp:isolationPressure',
      'hosp:steriliserF0', 'hosp:waterReturnTemp', 'hosp:upsRuntime'],
    sim: {
      'hosp:orPressure': { base: 12, jit: 1, drift: -5 }, 'hosp:airChanges': { base: 16, jit: 0.6 },
      'hosp:fridgeTemp': { base: 5.5, jit: 0.4, drift: 2.5 }, 'hosp:o2Pressure': { base: 4.1, jit: 0.05 },
      'hosp:nurseCalls': { base: 3, jit: 1, drift: 3 }, 'hosp:bedOccupancy': { base: 78, jit: 3, drift: 14 },
      'hosp:orUtilisation': { base: 72, jit: 4 }, 'hosp:edWaitTime': { base: 18, jit: 5, drift: 25 },
      'hosp:isolationPressure': { base: -8, jit: 0.5, drift: 5 }, 'hosp:steriliserF0': { base: 18, jit: 0.5, drift: -5 },
      'hosp:waterReturnTemp': { base: 55, jit: 1, drift: -8 }, 'hosp:upsRuntime': { base: 28, jit: 1, drift: -12 },
    },
    assets: [['OR-Theatre-1', 'ok'], ['ICU-Bed-12', 'warn'], ['Med-Gas-Zone-A', 'ok'], ['Blood-Bank-Fridge', 'crit'], ['Autoclave-1', 'ok'], ['ED-HVAC', 'warn']],
  },
  'manufacturing': {
    label: 'Forge Plant 7', tag: 'Manufacturing', icon: 'ti-building-factory-2',
    accent: '#f59e0b', source: 'sim', hero: 'grid',
    blurb: 'Production lines, robotics and utilities with predictive-maintenance signals.',
    tiles: ['mfg:oee', 'mfg:spindleVib', 'mfg:cycleTime', 'mfg:motorTemp', 'mfg:throughput'],
    all: ['mfg:oee', 'mfg:spindleVib', 'mfg:cycleTime', 'mfg:motorTemp', 'mfg:throughput'],
    sim: {
      'mfg:oee': { base: 82, jit: 2, drift: -10 }, 'mfg:spindleVib': { base: 2.4, jit: 0.3, drift: 4 },
      'mfg:cycleTime': { base: 42, jit: 1.5 }, 'mfg:motorTemp': { base: 58, jit: 2, drift: 22 },
      'mfg:throughput': { base: 118, jit: 4 },
    },
    assets: [['PRESS-1', 'ok'], ['ROBOT-3', 'warn'], ['CONV-A', 'ok'], ['CNC-7', 'crit'], ['WELD-2', 'ok'], ['COMP-1', 'ok']],
  },
  // ── New verticals (sim until physics engines land from Tejesh) ──
  'mrt-line': {
    label: 'Singapore MRT', tag: 'Rail Transit', icon: 'ti-train',
    accent: '#059669', source: 'sim', hero: 'network',
    blurb: 'Singapore MRT digital twin: North-South Line, 27 stations, 83 trains, CBTC signalling, traction power substations, platform screen doors and station HVAC. Real-time headway adherence, passenger load and energy monitoring.',
    tiles: ['rail:networkOTP', 'rail:headway', 'rail:tractionVoltage', 'rail:passengerLoad',
      'rail:doorCycleTime', 'rail:tunnelTemp', 'rail:escalatorLoad', 'rail:signalFaults'],
    all: ['rail:networkOTP', 'rail:headway', 'rail:tractionVoltage', 'rail:passengerLoad',
      'rail:doorCycleTime', 'rail:atpStatus', 'rail:energyPerKm', 'rail:platformDwell',
      'rail:escalatorLoad', 'rail:tunnelTemp', 'rail:switchFaults', 'rail:signalFaults'],
    sim: {
      'rail:networkOTP': { base: 95, jit: 1.5, drift: -8 }, 'rail:headway': { base: 105, jit: 8, drift: 40 },
      'rail:tractionVoltage': { base: 740, jit: 5, drift: -45 }, 'rail:passengerLoad': { base: 72, jit: 6, drift: 20 },
      'rail:doorCycleTime': { base: 4.2, jit: 0.3, drift: 2.5 }, 'rail:atpStatus': { base: 98, jit: 1 },
      'rail:energyPerKm': { base: 3.2, jit: 0.2, drift: 1.2 }, 'rail:platformDwell': { base: 32, jit: 3, drift: 15 },
      'rail:escalatorLoad': { base: 65, jit: 5, drift: 18 }, 'rail:tunnelTemp': { base: 30, jit: 0.5, drift: 5 },
      'rail:switchFaults': { base: 0, jit: 0.5, drift: 3 }, 'rail:signalFaults': { base: 0, jit: 0.3, drift: 2 },
    },
    assets: [['NSL-Train-041', 'ok'], ['Jurong-PSD', 'warn'], ['Bishan-ACMV', 'ok'], ['TSS-NS-03', 'crit'], ['Escalator-JE-2', 'ok'], ['ATP-Zone-7', 'warn']],
  },
  'ev-network': {
    label: 'EV Charging Network', tag: 'EV & Grid', icon: 'ti-charging-pile',
    accent: '#16a34a', source: 'sim', hero: 'grid',
    blurb: 'Island-wide EV charging network: DC fast chargers, fleet depot management, cell-level battery health monitoring, V2G grid services, transformer thermal aging and solar integration.',
    tiles: ['ev:stateOfCharge', 'ev:chargingPower', 'ev:gridLoad', 'ev:stateOfHealth',
      'ev:cellTempMax', 'ev:chargerUptime', 'ev:thermalRunawayRisk', 'ev:transformerTemp'],
    all: ['ev:stateOfCharge', 'ev:chargingPower', 'ev:gridLoad', 'ev:stateOfHealth',
      'ev:cellTempMax', 'ev:chargerUptime', 'ev:sessionsActive', 'ev:energyToday',
      'ev:v2gCapacity', 'ev:thermalRunawayRisk', 'ev:transformerTemp', 'ev:solarOutput'],
    sim: {
      'ev:stateOfCharge': { base: 68, jit: 4, drift: -22 }, 'ev:chargingPower': { base: 142, jit: 15 },
      'ev:gridLoad': { base: 72, jit: 5, drift: 18 }, 'ev:stateOfHealth': { base: 94, jit: 0.5, drift: -8 },
      'ev:cellTempMax': { base: 32, jit: 2, drift: 14 }, 'ev:chargerUptime': { base: 97, jit: 1, drift: -6 },
      'ev:sessionsActive': { base: 14, jit: 3 }, 'ev:energyToday': { base: 2.4, jit: 0.3 },
      'ev:v2gCapacity': { base: 180, jit: 20 }, 'ev:thermalRunawayRisk': { base: 2, jit: 1, drift: 18 },
      'ev:transformerTemp': { base: 68, jit: 3, drift: 25 }, 'ev:solarOutput': { base: 85, jit: 12 },
    },
    assets: [['DCFC-01', 'ok'], ['DCFC-07', 'warn'], ['Pack-Bus-12', 'ok'], ['Transformer-A', 'crit'], ['Solar-Array', 'ok'], ['V2G-Node', 'warn']],
  },
  'defence-base': {
    label: 'Naval Operations', tag: 'Defence', icon: 'ti-shield-star',
    accent: '#1e40af', source: 'sim', hero: 'grid',
    blurb: 'Military installation and naval vessel digital twin: gas turbine propulsion, ship stability monitoring, radar coverage, perimeter security, ammunition storage and C4ISR fusion.',
    tiles: ['def:forceReadiness', 'def:radarCoverage', 'def:perimeterAlerts', 'def:fuelReserve',
      'def:shipListAngle', 'def:commsLatency', 'def:powerGrid', 'def:uasThreatLevel'],
    all: ['def:forceReadiness', 'def:radarCoverage', 'def:perimeterAlerts', 'def:fuelReserve',
      'def:shipListAngle', 'def:commsLatency', 'def:powerGrid', 'def:engineHrsToMaint',
      'def:ammoTemp', 'def:uasThreatLevel'],
    sim: {
      'def:forceReadiness': { base: 94, jit: 1, drift: -8 }, 'def:radarCoverage': { base: 97, jit: 1.5, drift: -12 },
      'def:perimeterAlerts': { base: 0, jit: 0.3, drift: 2 }, 'def:fuelReserve': { base: 82, jit: 1, drift: -20 },
      'def:shipListAngle': { base: 0.5, jit: 0.3, drift: 5 }, 'def:commsLatency': { base: 18, jit: 4, drift: 35 },
      'def:powerGrid': { base: 98, jit: 0.5, drift: -8 }, 'def:engineHrsToMaint': { base: 120, jit: 2, drift: -90 },
      'def:ammoTemp': { base: 22, jit: 0.5, drift: 10 }, 'def:uasThreatLevel': { base: 0, jit: 0.2, drift: 1.5 },
    },
    assets: [['RSS-Tenacious', 'ok'], ['Radar-TRS3D', 'warn'], ['GT-LM2500-1', 'ok'], ['Perimeter-A', 'crit'], ['Ammo-Mag-B3', 'ok'], ['Comms-Node-1', 'warn']],
  },
}

export function domainMeta(domain) { return DOMAINS[domain] || DOMAINS['turbine-engine'] }
export function tilesFor(domain) { return domainMeta(domain).tiles }

// Prediction/scenario trajectory chart groups + subsystem keys per domain.
// Keys match the physics predict() trajectory + component_health_* output.
export const PREDICT_CHARTS = {
  'edm-machine': [
    { title: 'Cutting speed (mm²/min)', series: [{ key: 'cut_speed', label: 'Cut speed', color: '#7c3aed' }] },
    { title: 'Gap stability (%)', series: [{ key: 'short_rate', label: 'Short-circuit', color: '#e11d48' }, { key: 'break_risk', label: 'Wire-break risk', color: '#d97706' }] },
    { title: 'Dielectric (°C · µS/cm)', series: [{ key: 'die_temp', label: 'Temp °C', color: '#0d9488' }, { key: 'die_cond', label: 'Conductivity', color: '#2563eb' }] },
    { title: 'Subsystem health', series: [{ key: 'health', label: 'Overall', color: '#0d9488' }, { key: 'generator_h', label: 'Generator', color: '#e11d48' }, { key: 'dielectric_h', label: 'Dielectric', color: '#2563eb' }, { key: 'wire_system_h', label: 'Wire', color: '#d97706' }, { key: 'guides_axes_h', label: 'Guides', color: '#7c3aed' }] },
  ],
  'turbine-engine': [
    { title: 'EGT (°C)', redline: 780, series: [{ key: 'egt', label: 'EGT', color: '#e11d48' }] },
    { title: 'Vibration (g)', series: [{ key: 'vib', label: 'Vibration', color: '#d97706' }] },
    { title: 'Oil (°C · PSI)', series: [{ key: 'oil_temp', label: 'Oil temp', color: '#0d9488' }, { key: 'oil_press', label: 'Oil press', color: '#2563eb' }] },
    { title: 'Subsystem health', series: [{ key: 'health', label: 'Overall', color: '#0d9488' }, { key: 'turbine_h', label: 'Turbine', color: '#e11d48' }, { key: 'compressor_h', label: 'Compressor', color: '#2563eb' }, { key: 'bearings_h', label: 'Bearings', color: '#d97706' }, { key: 'lubrication_h', label: 'Lubrication', color: '#7c3aed' }] },
  ],
  'tram-network': [
    { title: 'Service performance (%)', series: [{ key: 'otp', label: 'On-time', color: '#16a34a' }, { key: 'headway', label: 'Headway', color: '#2563eb' }] },
    { title: 'Overhead voltage (V)', redline: 520, series: [{ key: 'ohl_v', label: 'OHL voltage', color: '#d97706' }] },
    { title: 'Track & disruption', series: [{ key: 'track_temp', label: 'Rail °C', color: '#e11d48' }, { key: 'delay', label: 'Delay min', color: '#7c3aed' }] },
    { title: 'Subsystem health', series: [{ key: 'health', label: 'Overall', color: '#0d9488' }, { key: 'rolling_stock_h', label: 'Rolling stock', color: '#d97706' }, { key: 'power_h', label: 'Power', color: '#e11d48' }, { key: 'track_h', label: 'Track', color: '#2563eb' }, { key: 'signalling_h', label: 'Signalling', color: '#7c3aed' }, { key: 'operations_h', label: 'Operations', color: '#16a34a' }] },
  ],
  'datacenter': [
    { title: 'Rack load & inlet temp', series: [{ key: 'dc:rackLoad', label: 'Rack load %', color: '#e11d48' }, { key: 'dc:inletTemp', label: 'Inlet °C', color: '#d97706' }] },
    { title: 'Cooling & power', series: [{ key: 'dc:coolingCOP', label: 'Cooling COP', color: '#0d9488' }, { key: 'dc:upsCharge', label: 'UPS %', color: '#2563eb' }] },
    { title: 'Overall health', series: [{ key: 'health', label: 'Health', color: '#0d9488' }] },
  ],
  'hospital': [
    { title: 'OR pressure & ventilation', series: [{ key: 'hosp:orPressure', label: 'OR Pa', color: '#2563eb' }, { key: 'hosp:airChanges', label: 'ACH', color: '#0d9488' }, { key: 'hosp:isolationPressure', label: 'Isolation Pa', color: '#7c3aed' }] },
    { title: 'Medical gas & cold chain', series: [{ key: 'hosp:o2Pressure', label: 'O₂ bar', color: '#7c3aed' }, { key: 'hosp:fridgeTemp', label: 'Fridge °C', color: '#e11d48' }] },
    { title: 'Patient flow', series: [{ key: 'hosp:bedOccupancy', label: 'Beds %', color: '#0891b2' }, { key: 'hosp:edWaitTime', label: 'ED wait min', color: '#d97706' }] },
    { title: 'Subsystem health', series: [{ key: 'health', label: 'Overall', color: '#0d9488' }, { key: 'hvac_h', label: 'HVAC', color: '#2563eb' }, { key: 'medical_gas_h', label: 'Med gas', color: '#7c3aed' }, { key: 'cold_chain_h', label: 'Cold chain', color: '#e11d48' }, { key: 'power_h', label: 'Power', color: '#d97706' }, { key: 'patient_safety_h', label: 'Safety', color: '#059669' }] },
  ],
  'manufacturing': [
    { title: 'OEE & throughput', series: [{ key: 'mfg:oee', label: 'OEE %', color: '#0d9488' }, { key: 'mfg:throughput', label: 'Units/h', color: '#2563eb' }] },
    { title: 'Vibration & motor temp', series: [{ key: 'mfg:spindleVib', label: 'Vib mm/s', color: '#e11d48' }, { key: 'mfg:motorTemp', label: 'Motor °C', color: '#d97706' }] },
    { title: 'Overall health', series: [{ key: 'health', label: 'Health', color: '#0d9488' }] },
  ],
  'mrt-line': [
    { title: 'Service performance (%)', series: [{ key: 'rail:networkOTP', label: 'On-time', color: '#059669' }, { key: 'rail:headway', label: 'Headway s', color: '#2563eb' }] },
    { title: 'Traction voltage (V)', redline: 650, series: [{ key: 'rail:tractionVoltage', label: 'Third rail V', color: '#d97706' }] },
    { title: 'Passenger & station', series: [{ key: 'rail:passengerLoad', label: 'Pax load %', color: '#e11d48' }, { key: 'rail:tunnelTemp', label: 'Tunnel °C', color: '#7c3aed' }] },
    { title: 'Subsystem health', series: [{ key: 'health', label: 'Overall', color: '#0d9488' }, { key: 'rolling_stock_h', label: 'Rolling stock', color: '#d97706' }, { key: 'power_h', label: 'Traction power', color: '#e11d48' }, { key: 'track_h', label: 'Track', color: '#2563eb' }, { key: 'signalling_h', label: 'Signalling', color: '#7c3aed' }, { key: 'stations_h', label: 'Stations', color: '#059669' }] },
  ],
  'ev-network': [
    { title: 'Fleet SoC & charging power', series: [{ key: 'ev:stateOfCharge', label: 'SoC %', color: '#16a34a' }, { key: 'ev:chargingPower', label: 'Power kW', color: '#2563eb' }] },
    { title: 'Grid & thermal', series: [{ key: 'ev:gridLoad', label: 'Grid load %', color: '#d97706' }, { key: 'ev:cellTempMax', label: 'Cell temp °C', color: '#e11d48' }] },
    { title: 'Battery health', series: [{ key: 'ev:stateOfHealth', label: 'SoH %', color: '#0d9488' }, { key: 'ev:thermalRunawayRisk', label: 'Runaway risk %', color: '#e11d48' }] },
    { title: 'Subsystem health', series: [{ key: 'health', label: 'Overall', color: '#0d9488' }, { key: 'battery_h', label: 'Battery', color: '#16a34a' }, { key: 'charger_h', label: 'Chargers', color: '#d97706' }, { key: 'grid_h', label: 'Grid', color: '#2563eb' }, { key: 'thermal_h', label: 'Thermal', color: '#e11d48' }] },
  ],
  'defence-base': [
    { title: 'Force readiness & radar', series: [{ key: 'def:forceReadiness', label: 'Readiness %', color: '#1e40af' }, { key: 'def:radarCoverage', label: 'Radar %', color: '#059669' }] },
    { title: 'Ship stability & fuel', series: [{ key: 'def:shipListAngle', label: 'List °', color: '#e11d48' }, { key: 'def:fuelReserve', label: 'Fuel %', color: '#d97706' }] },
    { title: 'Threats & comms', series: [{ key: 'def:uasThreatLevel', label: 'UAS threat', color: '#e11d48' }, { key: 'def:commsLatency', label: 'Latency ms', color: '#7c3aed' }] },
    { title: 'Subsystem health', series: [{ key: 'health', label: 'Overall', color: '#0d9488' }, { key: 'propulsion_h', label: 'Propulsion', color: '#d97706' }, { key: 'weapons_h', label: 'Weapons', color: '#e11d48' }, { key: 'comms_h', label: 'Comms', color: '#2563eb' }, { key: 'security_h', label: 'Security', color: '#7c3aed' }] },
  ],
}
export const SUBSYS = {
  'edm-machine': [{ key: 'generator', label: 'Generator' }, { key: 'dielectric', label: 'Dielectric' }, { key: 'wire_system', label: 'Wire system' }, { key: 'guides_axes', label: 'Guides & axes' }],
  'turbine-engine': [{ key: 'compressor', label: 'Compressor' }, { key: 'turbine', label: 'Turbine' }, { key: 'bearings', label: 'Bearings' }, { key: 'lubrication', label: 'Lubrication' }],
  'tram-network': [{ key: 'rolling_stock', label: 'Rolling stock' }, { key: 'power', label: 'Traction power' }, { key: 'track', label: 'Track & points' }, { key: 'signalling', label: 'Signalling' }, { key: 'operations', label: 'Operations' }],
  'mrt-line': [{ key: 'rolling_stock', label: 'Rolling stock' }, { key: 'power', label: 'Traction power' }, { key: 'track', label: 'Track & civil' }, { key: 'signalling', label: 'Signalling (CBTC)' }, { key: 'stations', label: 'Stations' }],
  'ev-network': [{ key: 'battery', label: 'Battery health' }, { key: 'charger', label: 'Charger fleet' }, { key: 'grid', label: 'Grid integration' }, { key: 'thermal', label: 'Thermal mgmt' }],
  'hospital': [{ key: 'hvac', label: 'HVAC & pressure' }, { key: 'medical_gas', label: 'Medical gas' }, { key: 'cold_chain', label: 'Cold chain' }, { key: 'power', label: 'Power & UPS' }, { key: 'patient_safety', label: 'Patient safety' }],
  'defence-base': [{ key: 'propulsion', label: 'Propulsion' }, { key: 'weapons', label: 'Weapons' }, { key: 'comms', label: 'Comms & radar' }, { key: 'security', label: 'Force protection' }],
}
export const predictCharts = (domain) => PREDICT_CHARTS[domain] || PREDICT_CHARTS['turbine-engine']
export const subsysFor = (domain) => SUBSYS[domain] || SUBSYS['turbine-engine']

export function sevClass(sig, v) {
  const m = SIG[sig]; if (!m || v == null) return ''
  if (m.crit != null && v >= m.crit) return 'crit'
  if (m.critLow != null && v <= m.critLow) return 'crit'
  if (m.warn != null && v >= m.warn) return 'warn'
  if (m.warnLow != null && v <= m.warnLow) return 'warn'
  return ''
}
export const fmt = (v) => (v == null ? '—'
  : Math.abs(v) >= 100 ? Math.round(v).toLocaleString()
  : v.toFixed(Math.abs(v) < 10 ? 2 : 1))
export const pct = (h) => (h == null ? '—' : `${Math.round(h * 100)}%`)
export const hColor = (h) => (h == null ? 'var(--hint)' : h >= 0.8 ? 'var(--accent-green)'
  : h >= 0.6 ? 'var(--accent-teal)' : h >= 0.4 ? 'var(--accent-amber)' : 'var(--accent-red)')
export const statusColor = (s) => ({ ok: 'var(--accent-green)', good: 'var(--accent-green)',
  fair: 'var(--accent-teal)', warning: 'var(--accent-amber)', degraded: 'var(--accent-amber)',
  critical: 'var(--accent-red)' }[s] || 'var(--hint)')

// ── Frontend simulator for the light example twins ───────────────────
// Produces a twin-shaped object {domain, latest, health, findings, incidents,
// source}, identical in shape to the live backend so the generic Dashboard
// renders it unchanged. `phase` (0..1) ramps the "drift" so a problem grows
// the longer you watch — giving the examples a live, evolving feel.
// How each facility fault biases its signals (delta at full severity).
export const FAULT_FX = {
  datacenter: {
    crac_failure: { 'dc:inletTemp': 11, 'dc:coolingCOP': -1.3, 'dc:pue': 0.35 },
    thermal_runaway: { 'dc:inletTemp': 13, 'dc:rackLoad': 8, 'dc:pue': 0.45 },
    ups_depletion: { 'dc:upsCharge': -62, 'dc:pue': 0.2 },
    power_surge: { 'dc:pue': 0.5, 'dc:upsCharge': -25 },
  },
  hospital: {
    laminar_loss: { 'hosp:orPressure': -9, 'hosp:airChanges': -7, 'hosp:isolationPressure': 6 },
    medgas_drop: { 'hosp:o2Pressure': -1.1 },
    coldchain_excursion: { 'hosp:fridgeTemp': 5 },
    hvac_fault: { 'hosp:airChanges': -6, 'hosp:orPressure': -5, 'hosp:isolationPressure': 5 },
    power_failure: { 'hosp:upsRuntime': -18, 'hosp:airChanges': -4 },
    legionella_risk: { 'hosp:waterReturnTemp': -10 },
  },
  manufacturing: {
    spindle_bearing: { 'mfg:spindleVib': 6, 'mfg:motorTemp': 16, 'mfg:oee': -16 },
    robot_overload: { 'mfg:motorTemp': 22, 'mfg:oee': -11 },
    conveyor_jam: { 'mfg:throughput': -42, 'mfg:oee': -22 },
    compressor_fault: { 'mfg:oee': -13, 'mfg:cycleTime': 11 },
  },
  'mrt-line': {
    signal_failure: { 'rail:signalFaults': 5, 'rail:headway': 80, 'rail:networkOTP': -18 },
    door_malfunction: { 'rail:doorCycleTime': 4, 'rail:platformDwell': 25, 'rail:networkOTP': -6 },
    traction_undervoltage: { 'rail:tractionVoltage': -90, 'rail:energyPerKm': 1.5 },
    tunnel_overheat: { 'rail:tunnelTemp': 9, 'rail:escalatorLoad': 15 },
  },
  'ev-network': {
    thermal_runaway_precursor: { 'ev:cellTempMax': 22, 'ev:thermalRunawayRisk': 55, 'ev:stateOfHealth': -8 },
    grid_overload: { 'ev:gridLoad': 22, 'ev:transformerTemp': 30, 'ev:chargingPower': -40 },
    charger_fleet_fault: { 'ev:chargerUptime': -18, 'ev:sessionsActive': -6 },
    battery_degradation: { 'ev:stateOfHealth': -15, 'ev:stateOfCharge': -20, 'ev:cellTempMax': 8 },
  },
  'defence-base': {
    perimeter_breach: { 'def:perimeterAlerts': 4, 'def:forceReadiness': -5 },
    radar_degradation: { 'def:radarCoverage': -22, 'def:uasThreatLevel': 2 },
    ship_flooding: { 'def:shipListAngle': 8, 'def:forceReadiness': -12 },
    fuel_contamination: { 'def:fuelReserve': -15, 'def:engineHrsToMaint': -40 },
  },
}

// Derived 0..1 health from how many signals are out of band.
function simHealth(domain, frame) {
  const meta = domainMeta(domain)
  let pen = 0
  for (const key of meta.all) { const c = sevClass(key, frame[key]); if (c === 'crit') pen += 0.22; else if (c === 'warn') pen += 0.09 }
  return Math.max(0.05, Math.min(1, 1 - pen))
}

// One simulated frame, optionally biased by an active fault (0..1 severity·progress).
export function simTwin(domain, phase = 0, fault = null, faultMag = 0) {
  const meta = domainMeta(domain)
  const spec = meta.sim || {}
  const fx = (FAULT_FX[domain] || {})[fault] || {}
  const latest = {}
  for (const key of meta.all) {
    const s = spec[key] || { base: 0, jit: 0 }
    const drift = (s.drift || 0) * Math.min(1, phase)
    const jitter = (Math.random() - 0.5) * 2 * (s.jit || 0)
    let v = s.base + drift + jitter + (fx[key] || 0) * faultMag
    v = Math.round(v * 100) / 100
    latest[key] = v
  }
  // findings from any signal past its warn/crit band
  const findings = []
  for (const key of meta.all) {
    const sev = sevClass(key, latest[key])
    if (!sev) continue
    const m = SIG[key]
    findings.push({
      displayName: `${m.label} ${sev === 'crit' ? 'out of limits' : 'drifting out of band'}`,
      severity: sev === 'crit' ? 'critical' : 'warning',
      message: `${m.label} at ${fmt(latest[key])}${m.unit ? ' ' + m.unit : ''} — ${sev === 'crit' ? 'breached threshold' : 'approaching limit'}.`,
      signal: key,
    })
  }
  // health: 1 minus a penalty for each out-of-band signal
  const penalty = findings.reduce((a, f) => a + (f.severity === 'critical' ? 0.22 : 0.09), 0)
  const health = Math.max(0.05, Math.min(1, 1 - penalty))
  return { domain, source: 'sim', fault: fault || null, latest, health: Math.round(health * 1000) / 1000,
    findings, incidents: findings.filter(f => f.severity === 'critical').slice(0, 1) }
}

// Forward trajectory for a simulated twin (prediction/scenario charts). Drifts
// signals over the horizon; if a fault is given it ramps its bias in over time.
export function simTrajectory(domain, horizonMin = 360, points = 60, fault = null, severity = 1) {
  const meta = domainMeta(domain)
  const spec = meta.sim || {}
  const fx = (FAULT_FX[domain] || {})[fault] || {}
  const out = []
  for (let i = 0; i <= points; i++) {
    const prog = i / points
    const frame = { t_min: Math.round(horizonMin * prog) }
    for (const key of meta.all) {
      const s = spec[key] || { base: 0 }
      const v = s.base + (s.drift || 0) * prog + (fx[key] || 0) * prog * severity
      frame[key] = Math.round(v * 100) / 100
    }
    frame.health = Math.round(simHealth(domain, frame) * 1000) / 1000
    out.push(frame)
  }
  return out
}

// Signals at/over their limits in a frame (a lightweight RUL-equivalent for sim).
export function signalsAtRisk(domain, frame) {
  const meta = domainMeta(domain)
  return meta.all.map(key => ({ key, sev: sevClass(key, frame?.[key]), value: frame?.[key], meta: SIG[key] }))
    .filter(r => r.sev)
}
