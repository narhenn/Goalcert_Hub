// rbac.jsx — the frontend's single source of access truth.
//
// It holds NO permission logic. It fetches /api/me/bootstrap once per session
// and renders what the server says: which menus exist, which widgets exist,
// which permission codes the user holds. Adding a role or re-pointing a menu is
// a database change; this file never learns about it.
//
// The rule for every consumer: gate on a PERMISSION CODE, never on a role name.
//   can('company.users.create')     ✅ survives a customer inventing a role
//   role === 'admin'                ❌ breaks the moment they do
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import API from '../api.js'
import { useAuth } from './auth.jsx'

const RbacCtx = createContext(null)

const EMPTY = { permissions: [], navigation: [], dashboard: [], roles: [], entitlements: [] }

export function RbacProvider({ children }) {
  const { user } = useAuth()
  const [data, setData] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const load = useCallback(async () => {
    if (!user) { setData(EMPTY); setLoading(false); return }
    setLoading(true)
    try {
      const d = await API.me.bootstrap()
      setData({
        permissions: d.permissions || [],
        navigation: d.navigation || [],
        dashboard: d.dashboard || [],
        roles: d.roles || [],
        entitlements: d.entitlements || [],
        level: d.level,
        crossTenant: !!d.crossTenant,
      })
      setError(null)
    } catch (e) {
      // A failure here means an empty sidebar, which is the safe direction:
      // showing nothing beats showing menus the user may not open.
      setError(e.detail || e.message)
      setData(EMPTY)
    } finally {
      setLoading(false)
    }
  }, [user?.id])                                  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  const api = useMemo(() => {
    const held = new Set(data.permissions)

    // Mirrors the server's rule exactly (rbac.py::has_permission): an explicit
    // grant, or a `<scope>.<resource>.manage` that covers every action on it.
    // The UI hiding a button is a courtesy — the API is what actually enforces.
    const can = (code) => {
      if (!code) return true
      if (held.has(code)) return true
      const parts = code.split('.')
      parts.pop()
      return held.has(`${parts.join('.')}.manage`)
    }

    return {
      ...data,
      loading,
      error,
      reload: load,
      can,
      canAny: (...codes) => codes.some(can),
      canAll: (...codes) => codes.every(can),
      hasRole: (code) => data.roles.some(r => r.code === code),
      isPlatform: data.level === 'platform',
      // every route the sidebar exposes, flattened — used to validate the
      // active route and to pick a landing page
      routes: data.navigation.flatMap(m => [m.route, ...(m.children || []).map(c => c.route)])
        .filter(Boolean),
    }
  }, [data, loading, error, load])

  return <RbacCtx.Provider value={api}>{children}</RbacCtx.Provider>
}

export function useRbac() {
  const ctx = useContext(RbacCtx)
  if (!ctx) throw new Error('useRbac must be used within RbacProvider')
  return ctx
}

/** Render children only when the permission is held. */
export function Can({ permission, any, children, fallback = null }) {
  const rbac = useRbac()
  const ok = any ? rbac.canAny(...any) : rbac.can(permission)
  return ok ? <>{children}</> : fallback
}
