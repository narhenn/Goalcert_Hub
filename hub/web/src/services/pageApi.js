// pageApi.js — the page-oriented API client ("one API per page").
//
// The pivot skeleton talks to ONE hub endpoint per navigation page
// (/api/pages/<platform>/<page>) instead of the old per-feature sprawl in api.js.
// Until a platform is federated in, these return a structured stub the RemoteSlot
// renders. Reuses api.js's auth header so the JWT rides every call.
import { authHeaders } from '../api.js'

async function pageGet(path) {
  const r = await fetch(`/api/pages${path}`, { headers: { ...authHeaders() } })
  if (!r.ok) {
    let detail = `GET /api/pages${path}: ${r.status}`
    try { const j = await r.json(); if (j?.detail) detail = j.detail } catch {}
    const err = new Error(detail); err.status = r.status; throw err
  }
  return r.json()
}

export const PageAPI = {
  // the whole page contract (what the skeleton is built against)
  manifest: () => pageGet('/manifest'),
  // load one page's data (stub until the platform is integrated)
  load: (platform, page) => pageGet(`/${platform}/${page}`),
}

export default PageAPI
