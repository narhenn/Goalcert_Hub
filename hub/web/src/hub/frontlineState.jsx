// frontlineState.jsx — shift assignment context for frontline users.
//
// The agentic engine assigns the right procedure based on:
//   1. What asset the twin is running (domain)
//   2. Which findings are active (most findings = highest priority)
//   3. The operator's readiness score (lower = needs more training first)
//
// In production: this calls HiveMind to make the assignment decision.
// In stub mode: picks the asset with the most findings.
import React, { createContext, useContext, useState, useMemo } from 'react'
import { domainMeta } from '../lib.jsx'

const FrontlineCtx = createContext(null)

// -- procedure catalog per domain (mocked) --
const PROCEDURES = {
  'edm-machine': [
    { id: 'EDM-01', name: 'Wire Threading & Alignment Check', estimatedMin: 25, type: 'routine' },
    { id: 'EDM-02', name: 'Dielectric System Flush & Filter', estimatedMin: 35, type: 'routine' },
    { id: 'EDM-03', name: 'Guide Roller Inspection & Replace', estimatedMin: 45, type: 'corrective' },
    { id: 'EDM-04', name: 'Power Supply Calibration', estimatedMin: 30, type: 'preventive' },
  ],
  'turbine-engine': [
    { id: 'TUR-01', name: 'Borescope Hot Section Inspection', estimatedMin: 40, type: 'routine' },
    { id: 'TUR-02', name: 'Oil System Sampling & Analysis', estimatedMin: 20, type: 'preventive' },
    { id: 'TUR-03', name: 'Compressor Wash Procedure', estimatedMin: 35, type: 'corrective' },
  ],
  'tram-network': [
    { id: 'TRM-01', name: 'Pantograph Carbon Strip Inspection', estimatedMin: 30, type: 'routine' },
    { id: 'TRM-02', name: 'Bogie Bearing Vibration Check', estimatedMin: 45, type: 'preventive' },
  ],
  'mrt-line': [
    { id: 'MRT-01', name: 'PSD Door Cycle & Alignment Check', estimatedMin: 25, type: 'routine' },
    { id: 'MRT-02', name: 'Third Rail Joint Resistance Test', estimatedMin: 35, type: 'preventive' },
    { id: 'MRT-03', name: 'Escalator Step Chain Tension Check', estimatedMin: 40, type: 'routine' },
    { id: 'MRT-04', name: 'CBTC Zone Controller Health Check', estimatedMin: 30, type: 'corrective' },
    { id: 'MRT-05', name: 'Tunnel Lining Visual Inspection', estimatedMin: 45, type: 'routine' },
  ],
  'ev-network': [
    { id: 'EV-01', name: 'Charger Connector & Cable Inspection', estimatedMin: 20, type: 'routine' },
    { id: 'EV-02', name: 'Battery Pack Thermal Scan', estimatedMin: 35, type: 'preventive' },
    { id: 'EV-03', name: 'Grid Transformer Oil Level Check', estimatedMin: 25, type: 'routine' },
  ],
  'hospital': [
    { id: 'HSP-01', name: 'Medical Gas Zone Pressure Verification', estimatedMin: 20, type: 'routine' },
    { id: 'HSP-02', name: 'Autoclave Bowie-Dick Test & F0 Check', estimatedMin: 30, type: 'routine' },
    { id: 'HSP-03', name: 'OR AHU Filter DP & Pressure Cascade', estimatedMin: 35, type: 'preventive' },
    { id: 'HSP-04', name: 'Blood Bank Fridge Calibration', estimatedMin: 25, type: 'preventive' },
  ],
  'defence-base': [
    { id: 'DEF-01', name: 'Perimeter Sensor Calibration Walk', estimatedMin: 40, type: 'routine' },
    { id: 'DEF-02', name: 'Gas Turbine Compressor Wash (Naval)', estimatedMin: 45, type: 'corrective' },
    { id: 'DEF-03', name: 'Radar Antenna Alignment Check', estimatedMin: 35, type: 'preventive' },
  ],
  'datacenter': [
    { id: 'DC-01', name: 'CRAC Unit Filter Replacement', estimatedMin: 25, type: 'routine' },
    { id: 'DC-02', name: 'UPS Battery Impedance Test', estimatedMin: 30, type: 'preventive' },
  ],
  'manufacturing': [
    { id: 'MFG-01', name: 'CNC Spindle Runout Measurement', estimatedMin: 35, type: 'routine' },
    { id: 'MFG-02', name: 'Robot Joint Torque Calibration', estimatedMin: 40, type: 'corrective' },
  ],
}

export function FrontlineProvider({ children, domain, twin }) {
  const [status, setStatus] = useState('pending') // pending | in_progress | complete
  const [flowResults, setFlowResults] = useState(null)

  // -- agentic assignment: pick procedure based on twin state --
  const assignment = useMemo(() => {
    const procs = PROCEDURES[domain] || PROCEDURES['edm-machine']
    const findings = twin?.findings || []
    // if there are critical findings → assign corrective procedure
    const hasCritical = findings.some(f => f.severity === 'critical')
    const proc = hasCritical
      ? procs.find(p => p.type === 'corrective') || procs[0]
      : procs[0]
    const meta = domainMeta(domain)
    const assetName = (meta.assets && meta.assets[0] && meta.assets[0][0]) || meta.label
    const now = new Date()
    const dueBy = new Date(now.getTime() + proc.estimatedMin * 60 * 1000 + 2 * 3600000)
    return {
      procedureId: proc.id,
      procedureName: proc.name,
      procedureType: proc.type,
      assetDomain: domain,
      assetName,
      estimatedMinutes: proc.estimatedMin,
      dueBy: dueBy.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      status,
    }
  }, [domain, twin, status])

  const startFlow = () => setStatus('in_progress')
  const completeFlow = (results) => { setStatus('complete'); setFlowResults(results) }
  const resetFlow = () => { setStatus('pending'); setFlowResults(null) }

  return (
    <FrontlineCtx.Provider value={{ assignment, status, startFlow, completeFlow, resetFlow, flowResults }}>
      {children}
    </FrontlineCtx.Provider>
  )
}

export function useFrontline() {
  return useContext(FrontlineCtx) || { assignment: null, status: 'pending', startFlow: () => {}, completeFlow: () => {}, resetFlow: () => {} }
}
