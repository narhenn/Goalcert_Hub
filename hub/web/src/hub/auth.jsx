// auth.jsx — the authenticated session. Single source of truth for the logged-in
// user, their role (→ persona), their org and its entitlements/policy.
//
// The app is gated on this: no user → Login. The persona a user sees is decided by
// the role their admin assigned — not a free picker. Entitlements come from the org.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import API, { hasSession } from '../api.js'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(hasSession())
  const [error, setError] = useState(null)

  // Resume from the HttpOnly session cookie. We can't read it (by design), so we
  // use the readable CSRF cookie as the "there is a session" hint and confirm
  // with /me — the session cookie rides along automatically.
  useEffect(() => {
    if (!hasSession()) { setLoading(false); return }
    API.auth.me()
      .then(({ user }) => setUser(user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
  }, [])

  // a 401 anywhere clears the session
  useEffect(() => {
    const onExpired = () => setUser(null)
    window.addEventListener('auth:expired', onExpired)
    return () => window.removeEventListener('auth:expired', onExpired)
  }, [])

  const login = useCallback(async (email, password) => {
    setError(null)
    try {
      // login sets the HttpOnly session + CSRF cookies; the returned token is for
      // non-browser clients only and is deliberately NOT stored here.
      const { user } = await API.auth.login(email, password)
      setUser(user)
      return user
    } catch (e) {
      setError(e.detail || e.message || 'Login failed')
      throw e
    }
  }, [])

  const logout = useCallback(async () => {
    try { await API.auth.logout() } catch {}   // server clears the HttpOnly cookie
    setUser(null); setError(null)
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
