// verticalState.jsx — active vertical / industry domain context.
// Shared across the shell, agent builder, hivemind, and any future
// vertical-aware surfaces. Persists selection to localStorage.
import React, { createContext, useContext, useState } from 'react'

export const VERTICALS = [
  { id: 'aerospace', label: 'Aerospace', icon: 'ti-propeller',          color: '#0E9E97' },
  { id: 'railway',   label: 'Railway',   icon: 'ti-train',             color: '#2563EB' },
  { id: 'ev',        label: 'EV',        icon: 'ti-charging-pile',     color: '#16A34A' },
  { id: 'hospital',  label: 'Hospital',  icon: 'ti-building-hospital', color: '#E11D48' },
  { id: 'defence',   label: 'Defence',   icon: 'ti-shield-star',       color: '#6D28D9' },
]
export const VERTICAL_MAP = Object.fromEntries(VERTICALS.map(v => [v.id, v]))

// Bridge a Digital-Twin domain (lib.jsx DOMAINS key) to a vertical, so the top-left
// switcher follows whichever twin is opened. Twins with no matching vertical leave the
// switcher on the operator's last choice.
export const TWIN_DOMAIN_TO_VERTICAL = {
  'turbine-engine': 'aerospace',
  'tram-network': 'railway',
  'mrt-line': 'railway',
  'ev-network': 'ev',
  'hospital': 'hospital',
  'defence-base': 'defence',
}
export function verticalForTwin(twinDomain) {
  return TWIN_DOMAIN_TO_VERTICAL[twinDomain] || null
}

const VerticalCtx = createContext(null)

export function VerticalProvider({ children }) {
  const [vertical, setVertical] = useState(() => localStorage.getItem('gc_vertical') || 'aerospace')
  const api = {
    vertical,
    setVertical: (v) => { setVertical(v); localStorage.setItem('gc_vertical', v) },
  }
  return <VerticalCtx.Provider value={api}>{children}</VerticalCtx.Provider>
}

export function useVertical() {
  const ctx = useContext(VerticalCtx)
  if (!ctx) throw new Error('useVertical must be used within VerticalProvider')
  return ctx
}
