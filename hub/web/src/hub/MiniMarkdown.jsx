// MiniMarkdown.jsx — a minimal markdown renderer for agent/stub text.
// Handles paragraphs, **bold**, `code`, and "- " / "* " bullet lists. Enough for
// the stub narratives; the real agents return the same shape.
import React from 'react'

function inline(text, key) {
  // split on **bold** and `code`
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
  return parts.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={i}>{p.slice(2, -2)}</strong>
    if (/^`[^`]+`$/.test(p)) return <code key={i} className="md-code">{p.slice(1, -1)}</code>
    return <React.Fragment key={i}>{p}</React.Fragment>
  })
}

export default function MiniMarkdown({ text = '' }) {
  const blocks = String(text).split(/\n{2,}/)
  return (
    <div className="md">
      {blocks.map((b, i) => {
        const lines = b.split('\n')
        const isList = lines.every(l => /^\s*[-*]\s+/.test(l) || l.trim() === '')
        if (isList) {
          return (
            <ul className="md-ul" key={i}>
              {lines.filter(l => l.trim()).map((l, j) => <li key={j}>{inline(l.replace(/^\s*[-*]\s+/, ''), j)}</li>)}
            </ul>
          )
        }
        return <p className="md-p" key={i}>{lines.map((l, j) => (
          <React.Fragment key={j}>{inline(l, j)}{j < lines.length - 1 && <br />}</React.Fragment>
        ))}</p>
      })}
    </div>
  )
}
