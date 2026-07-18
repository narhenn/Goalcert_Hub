// TwinRemoteHost.jsx — mounts the NextXR Digital Twin as a NATIVE federated
// remote (no iframe). The remote renders ITSELF into a host-provided <div> via its
// own react-dom root (see the remote's src/mount.jsx), so the twin subtree — three
// / @react-three / react-reconciler included — runs entirely on the remote's own
// React, isolated from the hub's React by a DOM boundary.
//
// Why a DOM boundary instead of rendering <TwinRemoteApp/> directly: under
// @originjs/vite-plugin-federation the host's react-dom rendering the remote's tree
// forced R3F's reconciler onto a different React copy than the component hooks →
// React #321 ("invalid hook call"), which blanked the 3-D canvas in the hub. Handing
// the remote a bare <div> to own removes that coupling. Data still flows through the
// hub gateway (/api/twin/* → auth + entitlement + server-side key → NextXR).
//
// Two bridges keep the hub and the remote in one mental model:
//   • router  — hub sidebar → the remote's internal react-router (via handle.update)
//   • twin    — the twin opened in the remote ⇒ the hub's own twinState, so the
//               topbar health chip / overview / agentic layer track it too.
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { authHeaders } from '../../api.js'
import { useTwin } from '../twinState.jsx'
import RemoteSlot from './RemoteSlot.jsx'

const REMOTE_URL = import.meta.env.VITE_TWIN_REMOTE || ''

// Configure the remote's runtime hooks BEFORE it loads its client.
if (typeof window !== 'undefined') {
  window.__NXR_API_BASE__ = '/api/twin'         // its data flows through the hub gateway
  window.__NXR_AUTH__ = () => authHeaders()      // inject the hub's auth on every call
}

// hub route id ⇄ the remote's internal path
const ROUTE_PATH = { twins: '/twins', dashboard: '/', build: '/build', predict: '/predict' }
const HUB_ROUTE = { '/twins': 'twins', '/': 'dashboard', '/build': 'build', '/predict': 'predict' }
const PAGE_FOR = { twins: 'twins', dashboard: 'dashboard', build: 'build', predict: 'predict' }

// Module Federation does NOT inject a remote's CSS into the host. The remote
// emits a stable assets/style.css beside remoteEntry.js (and is built with an
// absolute base), so derive the href from the remote URL and link it once.
function useRemoteCss(remoteEntryUrl) {
  useEffect(() => {
    if (!remoteEntryUrl) return
    const href = remoteEntryUrl.replace(/remoteEntry\.js(\?.*)?$/, 'style.css')
    if (href === remoteEntryUrl) return
    if (document.querySelector('link[data-nxr-remote-css]')) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    link.setAttribute('data-nxr-remote-css', '')
    document.head.appendChild(link)
  }, [remoteEntryUrl])
}

export default function TwinRemoteHost({ route, onNav }) {
  useRemoteCss(REMOTE_URL)
  const { openExisting } = useTwin()
  const path = ROUTE_PATH[route] || '/twins'

  const elRef = useRef(null)
  const handleRef = useRef(null)
  const [err, setErr] = useState(null)
  const [ready, setReady] = useState(false)

  // Keep the latest callbacks reachable from the mount closure without remounting.
  const onNavRef = useRef(onNav); onNavRef.current = onNav
  const openExistingRef = useRef(openExisting); openExistingRef.current = openExisting

  // remote navigated internally (e.g. Twins → Open) → move the hub's sidebar with it
  const handleNavigate = useCallback((p) => {
    const hubRoute = HUB_ROUTE[p]
    if (hubRoute && onNavRef.current) onNavRef.current(hubRoute)
  }, [])

  // remote's active twin changed → mirror it into the hub's twinState
  const handleTwinChange = useCallback((t) => {
    if (t?.tenant_id) openExistingRef.current(t.tenant_id, t.domain, t.name)
  }, [])

  // Load + mount the remote ONCE into our div. It owns its own React root.
  useEffect(() => {
    if (!REMOTE_URL) return
    let disposed = false
    let handle = null
    import('nextxrTwin/mount')
      .then(({ mount }) => {
        if (disposed || !elRef.current) return
        handle = mount(elRef.current, {
          initialPath: path,
          path,
          onNavigate: handleNavigate,
          onTwinChange: handleTwinChange,
        })
        handleRef.current = handle
        setReady(true)
      })
      .catch((e) => { if (!disposed) setErr(e) })
    return () => {
      disposed = true
      try { handle?.unmount() } catch { /* noop */ }
      handleRef.current = null
    }
    // mount once; route changes are pushed via the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // hub sidebar changed the route → push it into the already-mounted remote.
  // `ready` is a dep too: if the route changed while the remote was still importing
  // (handleRef null → the update was a no-op), re-running once mounted syncs the
  // remote to the CURRENT path instead of the stale one captured at mount time.
  useEffect(() => {
    handleRef.current?.update({ path })
  }, [path, ready])

  // Not configured → show the skeleton slot (no load attempt).
  if (!REMOTE_URL) {
    return <RemoteSlot platform="twin" page={PAGE_FOR[route] || 'twins'} accent="#0E9E97" remoteUrl=""
      pending="Digital Twin (NextXR) — set VITE_TWIN_REMOTE to mount the live remote" />
  }

  // Load failed → fall back to the skeleton slot instead of a blank panel.
  if (err) {
    return <RemoteSlot platform="twin" page={PAGE_FOR[route] || 'twins'} accent="#0E9E97" remoteUrl={REMOTE_URL}
      pending={`Digital Twin remote failed to load — is NextXR built + running on :8080? (${String(err.message || err)})`} />
  }

  return (
    <div style={{ position: 'relative', minHeight: '60vh' }}>
      {!ready && (
        <div className="panel"><div className="panel-header"><div>
          <div className="panel-title">Loading Digital Twin…</div>
          <div className="panel-subtitle">fetching the NextXR remote</div>
        </div></div></div>
      )}
      {/* the remote owns everything rendered inside this node */}
      <div ref={elRef} />
    </div>
  )
}
