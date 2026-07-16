// simState.jsx — the Simulation module's state.
//
// One context so the Builder, the cascade view, Reports and History all read the same
// run. Follows the Hub's existing state pattern (twinState/kpiState/loopState): a
// provider mounted by the workspace, a `useSim()` hook for the panes.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import API from '../../api.js'
import { useAudit } from '../../hub/audit.jsx'
import { useTwin } from '../../hub/twinState.jsx'
import { probeAll } from '../../services/integration.jsx'
import { mapRunGraph, cascadeEnd } from './engine/mapGraph.js'
import { DEFAULT_DOMAIN, SIM_DOMAIN_ORDER, SIM_DOMAINS, domainMeta, effectiveReadiness, simDomainForTwin } from './engine/domains.js'

const Ctx = createContext(null)
const HISTORY_KEY = 'gc_sim_runs'

export function useSim() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSim must be used inside <SimProvider>')
  return ctx
}

export function SimProvider({ children }) {
  const { log } = useAudit()
  const { active } = useTwin()

  // The Simulation workspace follows the active twin: open the MRT twin → railway faults,
  // a hospital twin → hospital faults, and the header/Builder relabel to match. A twin
  // with no engine domain falls through to its own key so the engine returns nothing and
  // we say so honestly. No active twin → the default domain, so the engine tabs still
  // work standalone (they model a failure, not a machine).
  //
  // The operator can also pick a domain explicitly (domainOverride) to browse and run
  // ANY vertical's scenarios regardless of the active twin — the engine ships scenarios
  // for four domains and all of them should be reachable from the hub. Switching the
  // active twin clears the override so the workspace resumes following the twin.
  const [domainOverride, setDomainOverride] = useState(null)
  useEffect(() => { setDomainOverride(null) }, [active?.domain])
  const domain = useMemo(() => {
    if (domainOverride) return domainOverride
    const mapped = simDomainForTwin(active?.domain)
    return mapped || (active ? active.domain : DEFAULT_DOMAIN)
  }, [active, domainOverride])
  const meta = domainMeta(domain)

  // The domains the operator can pick from (every vertical the engine ships).
  const allDomains = useMemo(
    () => SIM_DOMAIN_ORDER.map(id => ({ id, label: SIM_DOMAINS[id].label, icon: SIM_DOMAINS[id].icon })), [])

  // ── scenario library (from the engine) ──
  const [scenarios, setScenarios] = useState([])
  const [loadingScenarios, setLoadingScenarios] = useState(true)
  const [engineUp, setEngineUp] = useState(null)  // null = unknown, then true/false

  // ── the operator's inputs ──
  const [scenarioId, setScenarioId] = useState('')
  const [readiness, setReadiness] = useState(meta.defaultReadiness)
  const [conditions, setConditions] = useState(['peak'])
  const [difficulty, setDifficulty] = useState('Medium')

  // Safeguards the operator has REMOVED (resource ids). A safeguard is a resource on the
  // scenario's environment that can block the fault outright (engine: spec.prevention).
  // Removing it is the "what if we didn't have the backup relay" question — and keeping
  // it is the "should we buy one" question. This is a different lever from readiness:
  // readiness is training, a safeguard is capital.
  const [removedSafeguards, setRemovedSafeguards] = useState([])

  // ── the run ──
  const [graph, setGraph] = useState(null)        // mapped view model
  const [running, setRunning] = useState(false)
  const [error, setError] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [history, setHistory] = useState([])

  // ── playback ──
  const [playhead, setPlayhead] = useState(0)
  const [playing, setPlaying] = useState(false)
  const raf = useRef(null)
  const firstDomainLoad = useRef(true)   // don't wipe the initial defaults; do wipe on a twin switch

  const effReadiness = effectiveReadiness(domain, readiness, conditions)

  // Load the real scenario library from the Simulation Engine.
  //
  // Only `fault` scenarios are launchable — the consequence nodes are what the cascade
  // SPAWNS, not things you start.
  //
  // Note we do NOT use withFallback() here, even though that is the Hub's usual pattern
  // for platform calls. withFallback() swaps in a LOCAL SIMULATOR when a service is down.
  // There is no honest local fallback for a cascade: fabricating a cause→consequence
  // graph would mean showing the operator invented failures and invented "preventable"
  // verdicts. So the engine is either connected (LIVE) or it isn't, and when it isn't we
  // say so. We still call probeAll() so the shared service state — and the Admin
  // observability panel — sees the engine come up, exactly like Twin and Agents.
  // Re-read the scenario library. Called on mount, and again after AI authoring — a
  // newly authored scenario is registered engine-side, so it only appears in the picker
  // once we ask again.
  const refreshScenarios = useCallback(async () => {
    const list = await API.scenario.sim.scenarios(domain)
    const faults = (list || []).filter(s => s.node_kind === 'fault')
    setScenarios(faults)
    return faults
  }, [domain])

  useEffect(() => {
    let alive = true
    setLoadingScenarios(true)
    // A twin switch changes the domain — drop the previous domain's selection, run and
    // knobs so nothing from railway leaks into hospital. The very first load keeps the
    // component defaults instead of blanking them.
    if (!firstDomainLoad.current) {
      setScenarioId('')
      setGraph(null); setSelectedId(null); setError(null)
      setConditions([]); setRemovedSafeguards([])
      setReadiness(domainMeta(domain).defaultReadiness)
    }
    firstDomainLoad.current = false
    API.scenario.sim.scenarios(domain)
      .then(list => {
        if (!alive) return
        const faults = (list || []).filter(s => s.node_kind === 'fault')
        setScenarios(faults)
        setEngineUp(true)
        setScenarioId(prev => prev || faults[0]?.id || '')
      })
      .catch(e => {
        if (!alive) return
        setEngineUp(false)
        // Name the ops/env problem precisely — these are the only three ways this fails,
        // and each has a different fix:
        //   503          → the hub has no SCENARIO_BASE_URL, or the engine is down/asleep
        //   401 upstream → the engine rejected the hub's SCENARIO_API_KEY (mismatched)
        //   404          → SCENARIO_PATH_PREFIX isn't empty
        if (e.status === 503) setError('not-configured')
        else if (e.status === 401 && e.upstream) setError('key-mismatch')
        else if (e.status === 404) setError('bad-prefix')
        else setError(e.message || 'Simulation engine unreachable')
      })
      .finally(() => {
        if (!alive) return
        setLoadingScenarios(false)
        probeAll()   // refresh the shared LIVE/SIM state for the whole Hub
      })
    return () => { alive = false }
  }, [domain])

  // ── run history ──
  //
  // The engine has no "list graphs" endpoint, and that is deliberate — see the note in
  // services/simulation-engine/backend/app/services/run_manager.py: a RunGraph is a DAG
  // of RunResults, not a single RunRecord, so it doesn't fit the RunORM row shape and is
  // held in memory (_GRAPHS) pending a schema decision. GET /runs therefore only lists
  // runs started via POST /runs — never graph runs.
  //
  // So we keep the INDEX of run ids client-side, but never the data: re-opening a run
  // re-fetches the real graph from the engine via GET /runs/graph/{id}. Because _GRAPHS
  // is in-memory, an engine restart drops them and that fetch 404s — which we surface as
  // "expired" rather than silently showing a stale local copy.
  const refreshHistory = useCallback(() => {
    try {
      setHistory(JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'))
    } catch { setHistory([]) }
  }, [])

  useEffect(() => { refreshHistory() }, [refreshHistory])

  const rememberRun = useCallback((g) => {
    try {
      const entry = {
        rootRunId: g.rootRunId,
        scenarioId: g.scenarioId,
        scenarioName: g.scenarioName,
        readiness: g.readiness,
        nodes: g.totals.total_nodes,
        preventable: g.totals.preventable_consequences,
        contained: !!g.root?.certified,
        at: new Date().toISOString(),
      }
      const prev = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
        .filter(r => r.rootRunId !== entry.rootRunId)
      const next = [entry, ...prev].slice(0, 30)
      localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
      setHistory(next)
    } catch { /* storage disabled — history is a convenience, not the source of truth */ }
  }, [])

  // Re-open a past run by fetching the real graph back from the engine.
  const openRun = useCallback(async (rootRunId) => {
    setRunning(true); setError(null)
    try {
      const rg = await API.scenario.sim.graph(rootRunId)
      const g = mapRunGraph(rg)
      setGraph(g); setSelectedId(null); setPlayhead(cascadeEnd(g)); setPlaying(false)
      return g
    } catch (e) {
      const gone = e.status === 404
      setError(gone
        ? 'That run is no longer held by the engine (its graph store is in-memory and resets on restart). Re-run the scenario to reproduce it — the cascade is deterministic, so you will get the identical graph.'
        : (e.message || 'Could not load that run'))
      return null
    } finally {
      setRunning(false)
    }
  }, [])

  const toggleCondition = useCallback((id) => {
    setConditions(cs => cs.includes(id) ? cs.filter(c => c !== id) : [...cs, id])
  }, [])

  const toggleSafeguard = useCallback((id) => {
    setRemovedSafeguards(rs => rs.includes(id) ? rs.filter(r => r !== id) : [...rs, id])
  }, [])

  // The safeguards available on the selected scenario, and whether each is currently in
  // place. They come from the scenario's own recommended_environment — the engine ships
  // them, we only choose whether to keep them.
  const selectedScenario = scenarios.find(s => s.id === scenarioId) || null
  const safeguards = (selectedScenario?.recommended_environment?.resources || []).map(r => ({
    id: r.id,
    type: r.type,
    scope: r.scope,
    active: !removedSafeguards.includes(r.id),
  }))

  // The world we actually send. Omit it entirely when nothing was removed, so the engine
  // uses the scenario's own environment and we aren't quietly re-stating it.
  const environmentOverride = useCallback(() => {
    const env = selectedScenario?.recommended_environment
    if (!env || !removedSafeguards.length) return undefined
    return { ...env, resources: (env.resources || []).filter(r => !removedSafeguards.includes(r.id)) }
  }, [selectedScenario, removedSafeguards])

  const runConfig = useCallback((readinessValue) => ({
    domain,
    readiness: readinessValue,
    difficulty,          // Easy | Medium | Hard | Expert — capitalised; lowercase 422s
    duration_min: 120,
  }), [domain, difficulty])

  // Run one scenario and expand its cascade on the engine.
  const run = useCallback(async () => {
    if (!scenarioId) return null
    setRunning(true); setError(null)
    try {
      const rg = await API.scenario.sim.runGraph(
        scenarioId, runConfig(effReadiness), environmentOverride())
      const g = mapRunGraph(rg)
      setGraph(g)
      setSelectedId(null)
      setPlayhead(cascadeEnd(g))   // land on the fully-expanded cascade
      setPlaying(false)
      rememberRun(g)
      log('scenario', 'simulate', `Simulated "${g.scenarioName}"`,
        `readiness ${g.readiness} · ${g.totals.total_nodes} nodes · ${g.totals.preventable_consequences} preventable`)
      return g
    } catch (e) {
      setError(e.message || 'Run failed')
      return null
    } finally {
      setRunning(false)
    }
  }, [scenarioId, effReadiness, runConfig, environmentOverride, log, rememberRun])

  // A second, real run at a different readiness — this is what "what-if" means here.
  // We do NOT synthesise an improved graph locally; the engine decides whether the
  // preventable branch still fires.
  const runAt = useCallback(async (targetReadiness) => {
    const rg = await API.scenario.sim.runGraph(
      scenarioId,
      runConfig(Math.max(0, Math.min(100, targetReadiness))),
      environmentOverride(),
    )
    return mapRunGraph(rg)
  }, [scenarioId, runConfig, environmentOverride])

  // ── playback loop ──
  const end = graph ? cascadeEnd(graph) : 1

  useEffect(() => {
    if (!playing || !graph) return
    let last = null
    const step = (ts) => {
      if (last == null) last = ts
      const dt = (ts - last) / 1000
      last = ts
      setPlayhead(p => {
        const next = p + dt * end / 8     // whole cascade in ~8s
        if (next >= end) { setPlaying(false); return end }
        return next
      })
      raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf.current)
  }, [playing, graph, end])

  const togglePlay = useCallback(() => {
    if (!graph) return
    setPlaying(p => {
      if (!p && playhead >= end) setPlayhead(0)   // replay from the top
      return !p
    })
  }, [graph, playhead, end])

  const restart = useCallback(() => {
    if (!graph) return
    setPlayhead(0); setPlaying(true)
  }, [graph])

  const seek = useCallback((t) => {
    setPlaying(false)
    setPlayhead(Math.max(0, Math.min(end, t)))
  }, [end])

  const value = useMemo(() => ({
    domain, meta, allDomains, pickDomain: setDomainOverride,
    scenarios, loadingScenarios, engineUp, refreshScenarios,
    scenarioId, setScenarioId, selectedScenario,
    readiness, setReadiness, effReadiness,
    conditions, toggleCondition,
    difficulty, setDifficulty,
    safeguards, toggleSafeguard, removedSafeguards,
    runConfig, environmentOverride,
    graph, running, error, run, runAt, openRun,
    selectedId, setSelectedId,
    history, refreshHistory,
    playhead, playing, end, togglePlay, restart, seek,
  }), [domain, meta, allDomains, scenarios, loadingScenarios, engineUp, refreshScenarios, scenarioId,
    selectedScenario, readiness, effReadiness, conditions, toggleCondition,
    difficulty, safeguards, toggleSafeguard, removedSafeguards, runConfig, environmentOverride,
    graph, running, error, run, runAt, openRun, selectedId, history, refreshHistory,
    playhead, playing, end, togglePlay, restart, seek])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
