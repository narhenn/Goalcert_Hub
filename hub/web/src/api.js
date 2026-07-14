// api.js — Hub API client. Every call goes to the hub origin (/api/*); the hub
// authenticates the JWT and reverse-proxies twin/scenario/agents to the real
// services with server-side keys. The browser only ever holds the user's token.

// ── Auth token store (set by AuthProvider) ──
const TOKEN_KEY = 'gc_hub_token'
let _token = (() => { try { return localStorage.getItem(TOKEN_KEY) || null } catch { return null } })()
export function setAuthToken(t) {
  _token = t || null
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY) } catch {}
}
export function getAuthToken() { return _token }
export function authHeaders() { return _token ? { Authorization: `Bearer ${_token}` } : {} }

const API = {
  // ── Auth ──
  auth: {
    login: (email, password) => post('/api/auth/login', { email, password }),
    me: () => get('/api/auth/me'),
    changePassword: (current_password, new_password) =>
      post('/api/auth/change-password', { current_password, new_password }),
  },

  // ── Admin (super_admin + org admin) ──
  admin: {
    orgs: () => get('/api/admin/orgs'),
    createOrg: (body) => post('/api/admin/orgs', body),
    updateOrg: (id, body) => patch(`/api/admin/orgs/${id}`, body),
    users: () => get('/api/admin/users'),
    createUser: (body) => post('/api/admin/users', body),
    updateUser: (id, body) => patch(`/api/admin/users/${id}`, body),
    resetPassword: (id, body) => post(`/api/admin/users/${id}/reset-password`, body),
    deleteUser: (id) => del(`/api/admin/users/${id}`),
    audit: (limit = 50) => get(`/api/admin/audit?limit=${limit}`),
    platform: () => get('/api/admin/platform'),
  },

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
    // Forward trajectory + remaining-useful-life. Returns { kind, trajectory, rul, severity }.
    predict: (tenant, horizon_min = 360, points = 60) =>
      post('/api/twin/predict', { tenant, horizon_min, points }),
    // Versioned AR maintenance overlay for one asset. Returns { version, asset, steps, findings }.
    arOverlay: (assetId, tenant, version) =>
      get(`/api/twin/assets/${assetId}/ar-overlay?tenant=${tenant}${version ? `&version=${version}` : ''}`),
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

  // ── GoalCert Agent Builder (goalcert-platform :8097) ──
  // 6-stage guided agent creation + team chat. Gateway proxies /api/agentbuilder/*.
  agentbuilder: {
    health: () => get('/api/agentbuilder/health'),
    list: () => get('/api/agentbuilder/agents'),
    create: (agent) => post('/api/agentbuilder/agents/create', agent),
    update: (agentId, changes) => put(`/api/agentbuilder/agents/${agentId}`, changes),
    remove: (agentId) => del(`/api/agentbuilder/agents/${agentId}`),
    test: (agentId, input = {}) => post(`/api/agentbuilder/agents/${agentId}/test`, input),
    templates: () => get('/api/agentbuilder/templates'),
    tools: () => get('/api/agentbuilder/tools'),
    // SSE endpoints (POST + read the response body stream — see hivemind/engine.js).
    chatPath: (agentId) => `/api/agentbuilder/agents/${agentId}/chat`,
    teamChatPath: () => '/api/agentbuilder/team/chat',
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

  // ── Agent Builder ──
  agentbuilder: {
    agents: () => get('/api/agentbuilder/agents'),
    get: (id) => get(`/api/agentbuilder/agents/${id}`),
    create: (body) => post('/api/agentbuilder/agents/create', body),
    update: (id, body) => put(`/api/agentbuilder/agents/${id}`, body),
    remove: (id) => del(`/api/agentbuilder/agents/${id}`),
    generatePrompt: (id, body) => post(`/api/agentbuilder/agents/${id}/generate-prompt`, body),
    uploadKnowledge: (id, formData) => postForm(`/api/agentbuilder/agents/${id}/knowledge`, formData),
    removeKnowledge: (id, filename) => del(`/api/agentbuilder/agents/${id}/knowledge/${filename}`),
    setTools: (id, tools) => put(`/api/agentbuilder/agents/${id}/tools`, { tools }),
    setGuardrails: (id, guardrails) => put(`/api/agentbuilder/agents/${id}/guardrails`, { guardrails }),
    test: (id, message) => post(`/api/agentbuilder/agents/${id}/test`, { message }),
    eval: (id) => post(`/api/agentbuilder/agents/${id}/eval`, {}),
    deploy: (id, channels) => put(`/api/agentbuilder/agents/${id}/deploy`, { channels }),
    templates: () => get('/api/agentbuilder/templates'),
    tools: () => get('/api/agentbuilder/tools'),
    chat: (id, message, sessionId) => `/api/agentbuilder/agents/${id}/chat`,  // SSE endpoint, used directly
    teamChat: (message, sessionId) => `/api/agentbuilder/team/chat`,  // SSE endpoint
  },

  // ── Platform health (all services) ──
  healthCheck: async () => {
    const results = {}
    const checks = [
      ['twin', '/api/twin/health'],
      ['agents', '/api/agents/health'],
      ['scenario', '/api/scenario/health'],
      ['drone', '/api/drone/health'],
      ['agentbuilder', '/api/agentbuilder/health'],
    ]
    await Promise.allSettled(
      checks.map(async ([name, url]) => {
        try {
          const r = await fetch(url, { headers: authHeaders(), signal: AbortSignal.timeout(3000) })
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
// On 401 the token is stale/invalid → clear it and signal the app to re-auth.
function onUnauthorized() {
  setAuthToken(null)
  try { window.dispatchEvent(new CustomEvent('auth:expired')) } catch {}
}

// Throws an Error whose .status is the HTTP code and .detail is the API message.
async function request(method, url, body) {
  const opts = { method, headers: { ...authHeaders() } }
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  const r = await fetch(url, opts)
  if (r.status === 401) onUnauthorized()
  if (!r.ok) {
    let detail = `${method} ${url}: ${r.status}`
    try { const j = await r.json(); if (j?.detail) detail = j.detail } catch {}
    const err = new Error(detail); err.status = r.status; throw err
  }
  const ct = r.headers.get('content-type') || ''
  return ct.includes('application/json') ? r.json() : r.text()
}

const get = (url) => request('GET', url)
const post = (url, body) => request('POST', url, body ?? {})
const put = (url, body) => request('PUT', url, body ?? {})
const patch = (url, body) => request('PATCH', url, body ?? {})
const del = (url) => request('DELETE', url)

async function postForm(url, formData) {
  const opts = { method: 'POST', headers: { ...authHeaders() }, body: formData }
  const r = await fetch(url, opts)
  if (r.status === 401) onUnauthorized()
  if (!r.ok) {
    let detail = `POST ${url}: ${r.status}`
    try { const j = await r.json(); if (j?.detail) detail = j.detail } catch {}
    const err = new Error(detail); err.status = r.status; throw err
  }
  const ct = r.headers.get('content-type') || ''
  return ct.includes('application/json') ? r.json() : r.text()
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
