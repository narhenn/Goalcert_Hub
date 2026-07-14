// Playbar.jsx — scrub the cascade clock. Drives both the DAG and the event timeline.
import React, { useCallback, useRef } from 'react'
import { Icon } from '../../../lib.jsx'
import { useSim } from '../simState.jsx'

export default function Playbar() {
  const { graph, playhead, playing, end, togglePlay, restart, seek } = useSim()
  const track = useRef(null)
  if (!graph) return null

  const pct = Math.max(0, Math.min(100, (playhead / end) * 100))

  const onSeek = useCallback((e) => {
    const r = track.current.getBoundingClientRect()
    seek(((e.clientX - r.left) / r.width) * end)
  }, [seek, end])

  return (
    <div className="sim-playbar">
      <button className="btn btn-primary sim-play" onClick={togglePlay}
        title={playing ? 'Pause' : 'Play the cascade'}>
        <Icon n={playing ? 'ti-player-pause-filled' : 'ti-player-play-filled'} />
      </button>
      <button className="btn btn-ghost" onClick={restart} title="Replay from t=0">
        <Icon n="ti-refresh" />
      </button>
      <div className="sim-scrub" ref={track} onClick={onSeek}>
        <div className="sim-scrub-fill" style={{ width: `${pct}%` }} />
        <div className="sim-scrub-knob" style={{ left: `${pct}%` }} />
      </div>
      <div className="mono sim-clock">+{Math.round(playhead)}m / {end}m</div>
    </div>
  )
}
