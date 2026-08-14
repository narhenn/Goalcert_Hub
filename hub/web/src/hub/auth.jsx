// auth.jsx — the authenticated session. Single source of truth for the logged-in
// user, their role (→ persona), their org and its entitlements/policy.
//
// The app is gated on this: no user → Login. The persona a user sees is decided by
// the role their admin assigned — not a free picker. Entitlements come from the org.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import API, { setAuthToken, getAuthToken } from '../api.js'
import { clearLaunched, clearPending } from './ssoAuto.js'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(!!getAuthToken())
  const [error, setError] = useState(null)

  // resume a session from a stored token
  useEffect(() => {
    if (!getAuthToken()) { setLoading(false); return }
    API.auth.me()
      .then(({ user }) => setUser(user))
      .catch(() => { setAuthToken(null); setUser(null) })
      .finally(() => setLoading(false))
  }, [])

  // a 401 anywhere clears the session
  useEffect(() => {
    const onExpired = () => setUser(null)
    window.addEventListener('auth:expired', onExpired)
    return () => window.removeEventListener('auth:expired', onExpired)
  }, [])

  // Resolves to { user, ssoAutoLaunch } rather than the user alone: the caller
  // is the sign-in click handler, and it needs the auto-launch decision without
  // a further await to keep the browser's user-activation window open.
  const login = useCallback(async (email, password) => {
    setError(null)
    try {
      const { token, user, ssoAutoLaunch = null } = await API.auth.login(email, password)
      setAuthToken(token)
      setUser(user)
      return { user, ssoAutoLaunch }
    } catch (e) {
      setError(e.detail || e.message || 'Login failed')
      throw e
    }
  }, [])

  const logout = useCallback(() => {
    setAuthToken(null); setUser(null); setError(null)
    // Without this a sign-out/sign-in cycle in the same tab would be treated as
    // "already launched" and would silently stop opening the satellite app.
    clearLaunched(); clearPending()
  }, [])

  const refresh = useCallback(async () => {
    try { const { user } = await API.auth.me(); setUser(user); return user } catch { return null }
  }, [])

  const changePassword = useCallback(async (current, next) => {
    const { user } = await API.auth.changePassword(current, next)
    setUser(user); return user
  }, [])

  const api = useMemo(() => ({
    user, loading, error,
    isAuthed: !!user,
    role: user?.role || null,
    org: user ? { id: user.orgId, name: user.orgName, entitlements: user.entitlements, policy: user.policy } : null,
    login, logout, refresh, changePassword, setError,
  }), [user, loading, error, login, logout, refresh, changePassword])

  return <AuthCtx.Provider value={api}>{children}</AuthCtx.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
