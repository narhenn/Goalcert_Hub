// history.js — persist HiveMind brief history to localStorage.
//
// Stores the last 20 briefs with their deliverables, agent config,
// timestamps, and token usage. Enables "what did the hive produce last
// time?" recall and cross-brief learning.

const KEY = 'gc_hivemind_history'
const MAX = 20

export function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]')
  } catch {
    return []
  }
}

export function saveToHistory(entry) {
  const history = loadHistory()
  const item = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    timestamp: new Date().toISOString(),
    brief: entry.brief || '',
    facility: entry.facility || '',
    domain: entry.domain || '',
    provider: entry.provider || 'claude',
    agentsUsed: entry.agentsUsed || [],
    deliverableSummaries: {},
    totalTokens: 0,
    liveCount: 0,
  }

  // Store just summaries (not full content — too large for localStorage)
  for (const [agentId, d] of Object.entries(entry.deliverables || {})) {
    item.deliverableSummaries[agentId] = {
      title: d?.title || '',
      type: d?.type || '',
      charCount: (d?.content || '').length,
      tokens: d?.tokens || 0,
      live: d?.live || false,
      preview: (d?.content || '').slice(0, 200),
    }
    item.totalTokens += d?.tokens || 0
    if (d?.live) item.liveCount++
  }

  history.unshift(item)
  const trimmed = history.slice(0, MAX)
  try {
    localStorage.setItem(KEY, JSON.stringify(trimmed))
  } catch {
    // localStorage full — trim more aggressively
    try {
      localStorage.setItem(KEY, JSON.stringify(trimmed.slice(0, 5)))
    } catch { /* give up */ }
  }
  return item.id
}

export function clearHistory() {
  try { localStorage.removeItem(KEY) } catch {}
}

export function getHistoryItem(id) {
  return loadHistory().find(h => h.id === id) || null
}
