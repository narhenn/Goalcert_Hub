// HexAvatar.jsx — the hexagonal agent avatar with status glow and float animation.
// Hex shape is achieved with clip-path. Status changes the glow ring behaviour.
import React from 'react'

// clip-path for a regular hexagon
const HEX_CLIP = 'polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)'

export default function HexAvatar({ initials, color, glow, status = 'idle', size = 80 }) {
  const isWorking = status === 'working'
  const isDone = status === 'done'
  const isError = status === 'error'
  const isQueued = status === 'queued'

  const glowColor = isError ? 'rgba(225,29,72,.6)' : isDone ? 'rgba(22,163,74,.55)' : glow
  const ringColor = isError ? '#e11d48' : isDone ? '#16a34a' : color
  const fillColor = isError ? '#4b1217' : isQueued ? '#1a1a2e' : color

  const statusIcon = isDone ? '✓' : isError ? '✕' : isWorking ? null : null
  const showSpinner = isWorking

  return (
    <div
      className={`hex-avatar ${status}`}
      style={{
        width: size,
        height: size,
        position: 'relative',
        animation: status === 'idle' || status === 'queued' ? 'hexFloat 3.6s ease-in-out infinite' : 'none',
        '--hex-float-delay': `${Math.random() * 1.5}s`,
      }}
    >
      {/* outer glow ring */}
      <div
        className={`hex-ring ${isWorking ? 'hex-ring-pulse' : ''}`}
        style={{
          position: 'absolute',
          inset: -5,
          clipPath: HEX_CLIP,
          background: `radial-gradient(ellipse at 50% 50%, ${glowColor}, transparent 70%)`,
          opacity: (isWorking || isDone) ? 1 : 0.25,
          transition: 'opacity .4s',
          pointerEvents: 'none',
        }}
      />

      {/* main hex body */}
      <div
        style={{
          width: '100%',
          height: '100%',
          clipPath: HEX_CLIP,
          background: isQueued
            ? `linear-gradient(135deg, #1a1a2e, #0f0f1a)`
            : `linear-gradient(135deg, ${fillColor}, ${darken(fillColor, 0.3)})`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          overflow: 'hidden',
          transition: 'background .3s',
        }}
      >
        {/* honeycomb texture overlay */}
        <div className="hex-honeycomb" />

        {/* content: spinner or initials/check */}
        {showSpinner ? (
          <div className="hex-spinner" style={{ '--spin-color': '#fff' }} />
        ) : (
          <div style={{
            fontFamily: "'Poppins', sans-serif",
            fontSize: size * 0.25,
            fontWeight: 700,
            color: isQueued ? 'rgba(255,255,255,.3)' : '#fff',
            letterSpacing: '0.02em',
            zIndex: 1,
            transition: 'color .3s',
          }}>
            {statusIcon || initials}
          </div>
        )}

        {/* done flash overlay */}
        {isDone && (
          <div className="hex-done-flash" style={{ clipPath: HEX_CLIP }} />
        )}
      </div>

      {/* border ring */}
      <svg
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <polygon
          points="50,3 93,26 93,74 50,97 7,74 7,26"
          fill="none"
          stroke={ringColor}
          strokeWidth={isWorking ? 3 : isDone ? 2.5 : 1.5}
          strokeOpacity={isWorking ? 0.9 : isDone ? 1 : 0.4}
          style={{ transition: 'all .3s' }}
        />
      </svg>
    </div>
  )
}

// naive hex color darkener for gradient bottom stop
function darken(hex, amount = 0.2) {
  const n = parseInt(hex.replace('#', ''), 16)
  const r = Math.max(0, ((n >> 16) & 0xff) * (1 - amount))
  const g = Math.max(0, ((n >> 8) & 0xff) * (1 - amount))
  const b = Math.max(0, (n & 0xff) * (1 - amount))
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`
}
