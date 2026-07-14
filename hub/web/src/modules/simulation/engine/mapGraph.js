// mapGraph.js — the integration seam.
//
// Turns the engine's RunGraph (POST /runs/graph) into a plain view model the React
// components render. Pure: no React, no DOM, no fetch — which is what makes it testable
// and what makes adding a new domain a no-op here.
//
// The engine gives us, per node: run_id, scenario_name, node_kind (fault|consequence),
// category, impact_level, depth, t_offset_s and the node's full RunResult (events, KPIs,
// objectives, clearance). Per edge: parent/child run ids, the trigger condition that
// fired, its delay, and `preventable` — whether it only fired because the fault was NOT
// contained. `preventable` is the single most valuable bit in the whole payload: it is
// the engine telling you which consequences were avoidable.

import { IMPACT_SEV, EVENT_SEV, minutes } from './severity.js'

// node box geometry (kept in one place so the SVG and the report chain agree)
export const NODE_W = 168
export const NODE_H = 48
const COL_GAP = 205
const ROW_GAP = 74
const MARGIN_X = 24
const MARGIN_Y = 28

// Longest-path layering over the DAG.
//
// A naive BFS that visits each node once under-ranks any node that a *later* branch also
// feeds. That happens for real here: the railway cascade converges — passenger_medical
// ALSO spawns service_suspension — so service_suspension must sit to the right of both
// its parents or its incoming edge renders backwards. Relaxing depth in topological
// order is what guarantees every edge points forward.
function layer(nodes, edges) {
  const ids = nodes.map(n => n.id)
  const indeg = {}, adj = {}, depth = {}
  ids.forEach(i => { indeg[i] = 0; adj[i] = []; depth[i] = 0 })
  edges.forEach(e => {
    if (adj[e.from] == null || indeg[e.to] == null) return
    indeg[e.to]++
    adj[e.from].push(e.to)
  })

  // Kahn's algorithm → a topological order
  const deg = { ...indeg }
  const queue = ids.filter(i => !deg[i])
  const order = []
  while (queue.length) {
    const id = queue.shift()
    order.push(id)
    adj[id].forEach(to => { if (--deg[to] === 0) queue.push(to) })
  }
  // any node not in `order` sits on a cycle; the engine guarantees a DAG, but never
  // trust that blindly — append them so they still get laid out rather than vanish.
  ids.forEach(i => { if (!order.includes(i)) order.push(i) })

  order.forEach(id => adj[id].forEach(to => {
    depth[to] = Math.max(depth[to], depth[id] + 1)
  }))
  return depth
}

export function mapRunGraph(rg) {
  const depth = layer(
    rg.nodes.map(n => ({ id: n.run_id })),
    rg.edges.map(e => ({ from: e.parent_run_id, to: e.child_run_id })),
  )

  // group by column, then centre each column vertically
  const cols = {}
  rg.nodes.forEach(n => {
    const d = depth[n.run_id] || 0
    ;(cols[d] = cols[d] || []).push(n)
  })
  const maxRows = Math.max(1, ...Object.values(cols).map(c => c.length))

  const nodes = {}
  Object.keys(cols).map(Number).forEach(d => {
    const col = cols[d]
    const offset = (maxRows - col.length) / 2
    col.forEach((n, i) => {
      const cat = n.category
      const clearance = (n.result?.summary?.clearance) || null
      nodes[n.run_id] = {
        id: n.run_id,
        x: MARGIN_X + d * COL_GAP,
        y: MARGIN_Y + (i + offset) * ROW_GAP,
        w: NODE_W,
        h: NODE_H,
        depth: d,
        label: n.scenario_name,
        scenarioId: n.scenario_id,
        kind: n.node_kind,                      // 'fault' | 'consequence'
        category: cat,
        sev: IMPACT_SEV[n.impact_level] || 3,
        impact: n.impact_level,
        t: minutes(n.t_offset_s),               // minutes on the master cascade clock
        durationMin: minutes(n.result?.duration_s),
        kpis: n.result?.kpis || {},
        scores: n.result?.scores || {},
        objectives: n.result?.objectives?.operator || [],
        eventCount: (n.result?.events || []).length,
        certified: clearance ? !!clearance.certified : null,
        evidence: clearance?.evidence || [],
        raw: n,
      }
    })
  })

  const edges = rg.edges.map(e => ({
    from: e.parent_run_id,
    to: e.child_run_id,
    preventable: e.preventable,
    condition: e.condition,
    delayMin: e.delay_min,
    probability: e.probability,
    reason: e.reason,
  }))

  // Flatten every node's SimEvents onto ONE absolute cascade clock. Each node's events
  // are timestamped relative to that node's own start, so the offset has to be added
  // back — otherwise five nodes all appear to start at t=0.
  const events = []
  rg.nodes.forEach(n => {
    (n.result?.events || []).forEach(ev => {
      events.push({
        id: `${n.run_id}:${ev.seq}`,
        tsec: n.t_offset_s + ev.t,
        t: minutes(n.t_offset_s + ev.t),
        title: ev.title || ev.type,
        message: ev.message || '',
        type: ev.type,
        severity: ev.severity,
        sev: EVENT_SEV[ev.severity] || 1,
        node: n.scenario_name,
        runId: n.run_id,
      })
    })
  })
  events.sort((a, b) => a.tsec - b.tsec)

  const root = rg.nodes[0]
  return {
    rootRunId: rg.root_run_id,
    scenarioId: rg.scenario_id,
    scenarioName: rg.scenario_name,
    domain: rg.domain,
    config: rg.config,
    readiness: rg.config?.readiness ?? 0,
    totals: rg.totals || {},
    truncated: !!rg.truncated,
    nodes,
    edges,
    events,
    root: root ? nodes[root.run_id] : null,
    raw: rg,
  }
}

// End of the cascade in minutes — spans nodes, events and the engine's own total.
export function cascadeEnd(g) {
  if (!g) return 1
  const nodeT = Object.values(g.nodes).map(n => n.t)
  const evT = g.events.map(e => e.t)
  const engineT = minutes(g.totals?.end_of_cascade_s)
  return Math.max(1, ...nodeT, ...evT, engineT)
}

// The extent the SVG needs, so the viewBox tracks the cascade instead of clipping it —
// or, worse, letterboxing a linear chain into a field of empty grid.
export function graphExtent(g) {
  const ns = Object.values(g.nodes)
  const w = Math.max(700, ...ns.map(n => n.x + n.w + MARGIN_X))
  const h = Math.max(120, ...ns.map(n => n.y + n.h + MARGIN_Y))
  // a long edge is routed *below* the node rows (see edgePath), so reserve room for it
  const hasLongEdge = g.edges.some(e => {
    const a = g.nodes[e.from], b = g.nodes[e.to]
    return a && b && Math.abs(b.depth - a.depth) > 1
  })
  return { w, h: h + (hasLongEdge ? 52 : 0) }
}

// The path for one edge.
//
// An edge that skips columns (e.g. the root fault spawning Service Suspension three
// columns downstream) would otherwise be drawn as a straight horizontal line at the same
// y as the nodes it passes — running THROUGH the boxes in between and reading as though
// every link between them were that edge. So any edge spanning more than one column is
// routed in a arc *below* the node row, where it can be followed unambiguously.
export function edgePath(a, b) {
  const x1 = a.x + a.w, y1 = a.y + a.h / 2
  const x2 = b.x, y2 = b.y + b.h / 2
  const span = Math.abs(b.depth - a.depth)

  if (span > 1 && Math.abs(y1 - y2) < 4) {
    const dip = 40 + 12 * (span - 1)
    return `M${x1} ${y1} C ${x1 + 46} ${y1 + dip}, ${x2 - 46} ${y2 + dip}, ${x2} ${y2}`
  }
  const mx = (x1 + x2) / 2
  return `M${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`
}

// The edges the engine says were avoidable — the actionable core of a run.
export const preventableEdges = (g) => g.edges.filter(e => e.preventable)
