// TwinsLibrary.jsx — the Digital Twin module's entry surface.
import React from 'react'
import { Icon } from '../../lib.jsx'
import AssetPicker from '../AssetPicker.jsx'

export default function TwinsLibrary({ onOpen, active, onBuild, canBuild }) {
  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <div className="panel-title">Twins</div>
          <div className="panel-subtitle">Open a live digital twin, or build a new one from a 2-D image.</div>
        </div>
        {canBuild && (
          <div className="panel-actions">
            <button className="btn btn-primary" onClick={onBuild}><Icon n="ti-sparkles" /> Build from image</button>
          </div>
        )}
      </div>
      <AssetPicker onOpen={onOpen} active={active} />
      <div className="cta-band" style={{ marginTop: 18 }}>
        <h3>One backbone, any twin</h3>
        <p>Every twin runs on the same ontology + behaviour engine: live telemetry, a 3-tier findings
          pipeline and predictive RUL. Add the Scenario Engine to drill it, or the Agentic AI layer to
          reason over it — the hub composes exactly what you've enabled.</p>
      </div>
    </div>
  )
}
