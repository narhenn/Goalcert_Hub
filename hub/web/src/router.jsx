// router.jsx — the hub's URL router.
//
// Deliberately tiny (no react-router dependency) because the app only needs a
// handful of top-level URLs; everything inside the dashboard keeps its own
// existing in-memory `route` state, untouched:
//
//   /            public landing — hero, platform story, closing CTA
//   /products    the full product listing (every platform + entry price)
//   /pricing     the self-serve pricing funnel
//   /dashboard   the Integration Hub app (auth-gated)
//   /login       the sign-in screen; ?mode=signup shows the account-creation path
//
// Deep links work in both deploys: Vite's dev server has SPA fallback, and the
// FastAPI backend already serves index.html for any non-/api path.
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'

const RouteCtx = createContext({ path: '/', query: new URLSearchParams() })

// Trailing slashes collapse so /pricing and /pricing/ are the same route.
const normalize = p => (p.length > 1 ? p.replace(/\/+$/, '') : p) || '/'

const read = () => ({
  path: normalize(window.location.pathname),
  search: window.location.search,
})

/** Push a new URL and re-render. Same-URL navigations are ignored. */
export function navigate(to, { replace = false } = {}) {
  const cur = window.location.pathname + window.location.search
  if (to === cur) return
  window.history[replace ? 'replaceState' : 'pushState']({}, '', to)
  window.dispatchEvent(new Event('hub:route'))
  window.scrollTo({ top: 0 })
}

export function RouteProvider({ children }) {
  const [loc, setLoc] = useState(read)

  useEffect(() => {
    const sync = () => setLoc(read())
    // popstate = back/forward button; hub:route = our own navigate()
    window.addEventListener('popstate', sync)
    window.addEventListener('hub:route', sync)
    return () => {
      window.removeEventListener('popstate', sync)
      window.removeEventListener('hub:route', sync)
    }
  }, [])

  const value = useMemo(
    () => ({ path: loc.path, query: new URLSearchParams(loc.search) }),
    [loc.path, loc.search],
  )
  return <RouteCtx.Provider value={value}>{children}</RouteCtx.Provider>
}

export const useRoute = () => useContext(RouteCtx)
