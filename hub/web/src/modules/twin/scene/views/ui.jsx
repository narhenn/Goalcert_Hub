// ui.jsx — the two tiny primitives the ported NextXR views expect (Card, Empty),
// rendered with the hub's own .card styling so they read as native hub surfaces.
import React from 'react'

export function Card({ title, action, className = '', style, children }) {
  return (
    <div className={`card ${className}`} style={style}>
      {(title || action) && (
        <div className="card-title" style={{ display: 'flex', alignItems: 'center' }}>
          {title}{action && <span style={{ marginLeft: 'auto' }}>{action}</span>}
        </div>
      )}
      {children}
    </div>
  )
}

export const Empty = ({ label, icon = 'ti-loader' }) => (
  <div className="empty" style={{ padding: '24px 10px' }}>
    <i className={`ti ${icon}`} style={{ marginRight: 6 }} />{label}
  </div>
)
