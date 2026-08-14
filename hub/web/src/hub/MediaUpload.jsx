// MediaUpload.jsx — drag-and-drop upload with a live preview.
//
// One control for both images and video: `kind` decides what the picker accepts
// and how the result is previewed. It uploads immediately and hands the parent
// back a URL, so the surrounding form only ever stores a string — which is why
// the same control works for a local-disk deployment and an S3 one without
// knowing which is active.
import React, { useCallback, useRef, useState } from 'react'
import { Icon } from '../lib.jsx'
import API from '../api.js'

const ACCEPT = {
  image: 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml',
  video: 'video/mp4,video/webm,video/quicktime',
}

export default function MediaUpload({
  kind = 'image',        // 'image' | 'video'
  value,                 // current URL, or null
  onChange,              // (url|null) => void
  folder = 'misc',
  label,
  hint,
}) {
  const input = useRef(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [over, setOver] = useState(false)

  const upload = useCallback(async (file) => {
    if (!file) return
    setBusy(true); setErr(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('folder', folder)
      const res = await API.platform.upload(fd)
      onChange(res.url)
    } catch (e) {
      // The server's message is the useful part — wrong type, too large, S3
      // misconfigured. Showing it verbatim beats "upload failed".
      setErr(e.detail || e.message || 'Upload failed')
    } finally {
      setBusy(false)
    }
  }, [folder, onChange])

  const onDrop = (e) => {
    e.preventDefault(); setOver(false)
    upload(e.dataTransfer.files?.[0])
  }

  return (
    <div className="mu">
      {label && <span className="mu-label">{label}{hint && <em>{hint}</em>}</span>}

      <div className={`mu-drop ${over ? 'over' : ''} ${value ? 'filled' : ''}`}
        onDragOver={e => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        onClick={() => !busy && input.current?.click()}
        role="button" tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && input.current?.click()}>

        <input ref={input} type="file" accept={ACCEPT[kind]} hidden
          onChange={e => { upload(e.target.files?.[0]); e.target.value = '' }} />

        {busy ? (
          <div className="mu-state"><span className="st-spin" /><span>Uploading…</span></div>
        ) : value ? (
          kind === 'video'
            ? <video className="mu-preview" src={value} controls preload="metadata"
                onClick={e => e.stopPropagation()} />
            : <img className="mu-preview" src={value} alt="" />
        ) : (
          <div className="mu-state">
            <Icon n={kind === 'video' ? 'ti-video-plus' : 'ti-photo-plus'} />
            <span>Drop {kind === 'video' ? 'a video' : 'an image'} here, or click to choose</span>
          </div>
        )}
      </div>

      {err && <div className="mu-err">{err}</div>}

      {value && !busy && (
        <div className="mu-actions">
          <a href={value} target="_blank" rel="noreferrer" className="mu-link">{value}</a>
          <button type="button" className="btn btn-ghost danger"
            onClick={() => { onChange(null); setErr(null) }}>
            <Icon n="ti-trash" /> Remove
          </button>
        </div>
      )}
    </div>
  )
}
