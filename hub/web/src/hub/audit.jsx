// audit.jsx — a cross-cutting activity log. Every module pushes into it; the hub's
// Audit Trail reads it. It's the kind of surface that only makes sense at the hub
// level, above any single platform.
import React, { createContext, useContext, useMemo, useState } from 'react'

const AuditCtx = createContext(null)

let _seq = 0
export function AuditProvider({ children }) {
  const [entries, setEntries] = useState([])
  const api = useMemo(() => ({
    entries,
    log: (module, type, summary, detail) => setEntries(prev => [
      { id: `a${++_seq}`, ts: Date.now(), module, type, summary, detail: detail || '' },
      ...prev,
    ].slice(0, 200)),
    clear: () => setEntries([]),
  }), [entries])
  return <AuditCtx.Provider value={api}>{children}</AuditCtx.Provider>
}

export function useAudit() {
  return useContext(AuditCtx) || { entries: [], log: () => {}, clear: () => {} }
}
