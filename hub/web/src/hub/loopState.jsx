// loopState.jsx — the loop data bus. "Every action generates data used elsewhere."
//
// Every module emits stage events into this bus; every persona view reads its
// segment back out. This is the dataflow from Prem's doc made visible: a frontline
// clearance shows up on the supervisor board, in the compliance chain, in the COO
// roll-up and as an L&D improvement signal — because they all read the same bus.
import React, { createContext, useContext, useMemo, useState } from 'react'
import { LOOP_STAGES } from './personas.jsx'

const KEY = 'gc_hub_loop'
const LoopCtx = createContext(null)
let _seq = 0

// First-run seed so the loop reads as alive before the user generates events.
function seedEvents() {
  const now = Date.now(), m = 60000
  return [
    { stage: 'improve',  module: 'agentic',  persona: 'lnd',        summary: 'Micro-refresh drafted from AR call GC-1142', detail: 'Fix pattern was new — filed as candidate simulation fault.', ts: now - 18 * m },
    { stage: 'observe',  module: 'twin',     persona: 'coo',        summary: 'Twin flagged dielectric temperature drift', detail: 'Finding raised on EDM-7; readiness inputs updated.', ts: now - 34 * m },
    { stage: 'assist',   module: 'agentic',  persona: 'frontline',  summary: 'AR expert session — guide roller replacement', detail: 'Routed to on-call expert in 40s. Recorded, tagged, transcribed.', ts: now - 51 * m },
    { stage: 'deploy',   module: 'frontline', persona: 'frontline', summary: 'Clearance signed — Wire Threading & Alignment', detail: 'Signed, timestamped record exposed to compliance + supervisor.', ts: now - 65 * m },
    { stage: 'simulate', module: 'scenario', persona: 'frontline',  summary: 'Competency check passed — fault-injected scenario', detail: 'Score 87% against SOP steps, timing and error tolerance.', ts: now - 78 * m },
    { stage: 'train',    module: 'scenario', persona: 'lnd',        summary: 'Micro-lesson served — dielectric flush procedure', detail: 'Smallest unit matched to the fault modes the twin sees today.', ts: now - 92 * m },
    { stage: 'assess',   module: 'agentic',  persona: 'supervisor', summary: 'Shift roster matched to readiness scores', detail: 'Agentic engine assigned 12 operators to today’s procedures.', ts: now - 110 * m },
  ].map(e => ({ ...e, id: `l${++_seq}` }))
}

export function LoopProvider({ children }) {
  const [events, setEvents] = useState(() => {
    try {
      const v = JSON.parse(localStorage.getItem(KEY) || 'null')
      if (Array.isArray(v) && v.length) { _seq = v.length; return v }
    } catch {}
    return seedEvents()
  })

  const api = useMemo(() => {
    const counts = Object.fromEntries(LOOP_STAGES.map(s => [s.id, 0]))
    for (const e of events) if (counts[e.stage] != null) counts[e.stage]++
    const latest = {}
    for (const e of events) if (!latest[e.stage]) latest[e.stage] = e // events are newest-first

    return {
      events, counts, latest,
      lastEvent: events[0] || null,
      emit: (stage, { summary, detail = '', module = 'core', persona = null } = {}) => {
        setEvents(prev => {
          const next = [{ id: `l${++_seq}`, ts: Date.now(), stage, module, persona, summary, detail }, ...prev].slice(0, 120)
          try { localStorage.setItem(KEY, JSON.stringify(next)) } catch {}
          return next
        })
      },
      clear: () => { setEvents([]); try { localStorage.removeItem(KEY) } catch {} },
    }
  }, [events])

  return <LoopCtx.Provider value={api}>{children}</LoopCtx.Provider>
}

export function useLoop() {
  return useContext(LoopCtx) || {
    events: [], counts: {}, latest: {}, lastEvent: null, emit: () => {}, clear: () => {},
  }
}
