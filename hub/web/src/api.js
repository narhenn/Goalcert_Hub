// api.js — Hub API client for all 4 backend services

const API = {
  // ── NextXR Digital Twin ──
  twin: {
    health: () => get('/api/twin/health'),
    templates: () => get('/api/twin/twins/templates'),
    list: () => get('/api/twin/twins'),
    create: (name, domain) => post('/api/twin/twins', { name, domain, actor: 'hub' }),
    state: (tenant) => get(`/api/twin/twins/${tenant}`),
    topology: (tenant) => get(`/api/twin/topology?tenant=${tenant}`),
    findings: (tenant, limit = 20) => get(`/api/twin/findings?tenant=${tenant}&limit=${limit}`),
    stats: (tenant) => get(`/api/twin/stats?tenant=${tenant}`),
    feedStart: (tenant, mode = 'dynamics') => post(`/api/twin/feed/start?tenant=${tenant}&mode=${mode}`),
    feedStop: () => post('/api/twin/feed/stop'),
    feedStatus: () => get('/api/twin/feed/status'),
    streamUrl: (tenant) => `/api/twin/bus/stream?tenant=${tenant}`,
  },

  // ── AUTOMIND Agentic AI ──
  agents: {
    health: () => get('/api/agents/health'),
    list: () => get('/api/agents/agents'),
    generate: (description) => post('/api/agents/agents/generate', { description }),
    execute: (agentId, variables = {}) => post(`/api/agents/agents/${agentId}/execute`, { variables }),
    executionStatus: (execId) => get(`/api/agents/executions/${execId}`),
    executionLogs: (execId) => get(`/api/agents/executions/${execId}/logs`),
    streamUrl: (execId) => `/api/agents/executions/${execId}/stream`,
    templates: () => get('/api/agents/templates'),
    dashboard: () => get('/api/agents/dashboard/stats'),
    chat: (agentId, message) => post(`/api/agents/agents/${agentId}/chat`, { message }),
  },

  // ── GoalCert Simulation Engine ──
  scenario: {
    health: () => get('/api/scenario/health'),
    catalog: {
      assets: () => get('/api/scenario/catalog/assets'),
      techniques: () => get('/api/scenario/catalog/techniques'),
      roles: () => get('/api/scenario/catalog/roles'),
    },
    list: () => get('/api/scenario/scenarios'),
    get: (id) => get(`/api/scenario/scenarios/${id}`),
    run: (scenarioId, config = {}) => post('/api/scenario/runs', { scenario_id: scenarioId, ...config }),
    runs: (limit = 20) => get(`/api/scenario/runs?limit=${limit}`),
    runDetail: (runId) => get(`/api/scenario/runs/${runId}`),
    runEvents: (runId) => get(`/api/scenario/runs/${runId}/events`),
    dashboard: () => get('/api/scenario/dashboard'),
    guided: () => get('/api/scenario/live/guided'),
    guidedDetail: (id) => get(`/api/scenario/live/guided/${id}`),
    // Tripwire
    tripwire: {
      scenarios: () => get('/api/scenario/tripwire/scenarios'),
      startSession: (name, mode, scenarioId) => post('/api/scenario/tripwire/sessions', { learner_name: name, mode, scenario_id: scenarioId }),
      session: (id) => get(`/api/scenario/tripwire/sessions/${id}`),
      certificate: (id) => get(`/api/scenario/tripwire/sessions/${id}/certificate`),
    },
    // Studio
    studio: {
      domains: () => get('/api/scenario/studio/domains'),
      faults: (domain) => get(`/api/scenario/studio/faults?domain=${domain}`),
      author: (description, domain) => post('/api/scenario/studio/scenarios/author', { description, domain }),
      run: (spec) => post('/api/scenario/studio/runs', spec),
    },
    // Jilla AI
    jilla: {
      event: (data) => post('/api/scenario/jilla/event', data),
      chat: (data) => post('/api/scenario/jilla/chat', data),
      hint: (data) => post('/api/scenario/jilla/hint', data),
    },
  },

  // ── DroneForce ──
  drone: {
    health: () => get('/api/drone/health'),
    fleet: () => get('/api/drone/trainees'),
    sessionStart: (token) => postAuth('/api/drone/session/start', {}, token),
    sessionStop: (token) => postAuth('/api/drone/session/stop', {}, token),
    assign: (droneIds, mission, token) => postAuth('/api/drone/assign', { droneIds, mission }, token),
    command: (droneId, action, token) => postAuth('/api/drone/command', { droneId, action }, token),
    frame: (droneId) => `/api/drone/frame/${droneId}`,
    stream: (droneId) => `/api/drone/stream/${droneId}`,
    report: (token) => getAuth('/api/drone/report', token),
    login: (username, password) => post('/api/drone/login', { username, password }),
    wsUrl: () => `ws://${location.host}/api/drone/ws`,
  },

  // ── Platform health (all services) ──
  healthCheck: async () => {
    const results = {}
    const checks = [
      ['twin', '/api/twin/health'],
      ['agents', '/api/agents/health'],
      ['scenario', '/api/scenario/health'],
      ['drone', '/api/drone/health'],
    ]
    await Promise.allSettled(
      checks.map(async ([name, url]) => {
        try {
          const r = await fetch(url, { signal: AbortSignal.timeout(3000) })
          results[name] = { ok: r.ok, status: r.status }
        } catch {
          results[name] = { ok: false, error: 'unreachable' }
        }
      })
    )
    return results
  },
}

// ── HTTP helpers ──
async function get(url) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`GET ${url}: ${r.status}`)
  return r.json()
}

async function post(url, body) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`POST ${url}: ${r.status}`)
  return r.json()
}

async function getAuth(url, token) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!r.ok) throw new Error(`GET ${url}: ${r.status}`)
  return r.json()
}

async function postAuth(url, body, token) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`POST ${url}: ${r.status}`)
  return r.json()
}

export default API
