// export.js — export agent deliverables as downloadable files.
//
// PDF: uses browser print-to-PDF via a styled hidden iframe
// DOCX: generates a simple HTML-to-blob download (opens in Word/Google Docs)
// JSON: raw deliverable data
// Markdown: raw content as .md file

import { PERSONA_MAP } from './personas.js'

// ── Markdown → simple HTML ──────────────────────────────────────────

function mdToHtml(md) {
  if (!md) return ''
  return md
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^\| (.+) \|$/gm, (match) => {
      const cells = match.slice(1, -1).split('|').map(c => c.trim())
      return '<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>'
    })
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`)
    .replace(/(<tr>.*<\/tr>\n?)+/g, (match) => `<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:12px">${match}</table>`)
    .replace(/^---$/gm, '<hr/>')
    .replace(/\n{2,}/g, '</p><p>')
    .replace(/\n/g, '<br/>')
}


// ── Export single deliverable ─────────────────────────────────────────

export function exportDeliverable(agentId, deliverable, format = 'pdf') {
  const persona = PERSONA_MAP[agentId]
  const title = deliverable?.title || persona?.deliverable?.label || 'Deliverable'
  const content = deliverable?.content || ''
  const ts = new Date().toISOString().slice(0, 10)

  switch (format) {
    case 'pdf':
    case 'html':
      return exportAsHtml(title, content, persona, ts)
    case 'md':
      return downloadBlob(`${title.replace(/\s+/g, '_')}_${ts}.md`, content, 'text/markdown')
    case 'json':
      return downloadBlob(`${title.replace(/\s+/g, '_')}_${ts}.json`,
        JSON.stringify({ agent: persona?.name, role: persona?.role, title, content, exported_at: ts, ...deliverable }, null, 2),
        'application/json')
    default:
      return exportAsHtml(title, content, persona, ts)
  }
}


// ── Export all deliverables as one document ──────────────────────────

export function exportAllDeliverables(deliverables, agentIds, format = 'pdf') {
  const ts = new Date().toISOString().slice(0, 10)
  const sections = []

  for (const id of agentIds) {
    const d = deliverables[id]
    if (!d) continue
    const persona = PERSONA_MAP[id]
    sections.push({
      title: d.title || persona?.deliverable?.label || id,
      agent: persona?.name || id,
      role: persona?.title || '',
      content: d.content || '',
      tokens: d.tokens || 0,
      live: d.live || false,
    })
  }

  if (format === 'json') {
    return downloadBlob(`GoalCert_HiveMind_Brief_${ts}.json`,
      JSON.stringify({ exported_at: ts, agent_count: sections.length, deliverables: sections }, null, 2),
      'application/json')
  }

  if (format === 'md') {
    const md = sections.map(s =>
      `# ${s.title}\n**Agent:** ${s.agent} — ${s.role}\n\n${s.content}\n\n---\n`
    ).join('\n')
    return downloadBlob(`GoalCert_HiveMind_Brief_${ts}.md`, md, 'text/markdown')
  }

  // HTML/PDF — full styled document
  const body = sections.map(s => `
    <div style="page-break-before:always;margin-top:32px">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding-bottom:12px;border-bottom:2px solid #7A5CF0">
        <div style="width:36px;height:36px;border-radius:8px;background:#7A5CF0;color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700">
          ${PERSONA_MAP[agentIds[sections.indexOf(s)]]?.initials || '??'}
        </div>
        <div>
          <div style="font-size:16px;font-weight:700;color:#1e1b2e">${s.title}</div>
          <div style="font-size:11px;color:#6b7280">${s.agent} — ${s.role}</div>
        </div>
        ${s.live ? '<span style="background:#dcfce7;color:#065f46;padding:2px 8px;border-radius:4px;font-size:9px;font-weight:700;margin-left:auto">LIVE</span>' : ''}
      </div>
      <div style="font-size:13px;line-height:1.7;color:#333">
        ${mdToHtml(s.content)}
      </div>
    </div>
  `).join('')

  const html = buildHtmlDoc('GoalCert HiveMind — Full Brief', body, ts, sections.length)
  return openPrintable(html)
}


// ── Helpers ──────────────────────────────────────────────────────────

function exportAsHtml(title, content, persona, ts) {
  const body = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:20px;padding-bottom:14px;border-bottom:2px solid ${persona?.color || '#7A5CF0'}">
      <div style="width:42px;height:42px;border-radius:10px;background:${persona?.color || '#7A5CF0'};color:#fff;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:700">
        ${persona?.initials || '??'}
      </div>
      <div>
        <div style="font-size:18px;font-weight:700;color:#1e1b2e">${title}</div>
        <div style="font-size:12px;color:#6b7280">${persona?.name || 'Agent'} — ${persona?.title || ''}</div>
      </div>
    </div>
    <div style="font-size:13px;line-height:1.7;color:#333">
      ${mdToHtml(content)}
    </div>
  `
  const html = buildHtmlDoc(title, body, ts, 1)
  return openPrintable(html)
}

function buildHtmlDoc(title, body, ts, count) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    @page { margin: 1.5cm; size: A4; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 24px 32px; color: #333; }
    h1 { font-size: 20px; color: #1e1b2e; margin: 20px 0 8px; }
    h2 { font-size: 16px; color: #1e1b2e; margin: 18px 0 6px; }
    h3 { font-size: 14px; color: #1e1b2e; margin: 14px 0 4px; }
    table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 12px; }
    td, th { border: 1px solid #ddd; padding: 6px 10px; text-align: left; }
    tr:nth-child(even) { background: #f9fafb; }
    tr:first-child { background: #f3f4f6; font-weight: 600; }
    ul { margin: 8px 0; padding-left: 20px; }
    li { margin: 3px 0; }
    code { background: #f3f4f6; padding: 1px 4px; border-radius: 3px; font-size: 12px; }
    hr { border: none; border-top: 1px solid #e5e7eb; margin: 20px 0; }
    .header { display: flex; align-items: center; gap: 14px; padding-bottom: 16px; border-bottom: 3px solid #7A5CF0; margin-bottom: 24px; }
    .logo { width: 40px; height: 40px; border-radius: 10px; background: linear-gradient(135deg, #7c3aed, #2563eb); display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 16px; }
    .meta { font-size: 10px; color: #9aa1ad; text-transform: uppercase; letter-spacing: .08em; }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">G</div>
    <div>
      <div style="font-size:20px;font-weight:700;color:#1e1b2e">${title}</div>
      <div class="meta">GoalCert Platform · ${ts} · ${count} deliverable${count > 1 ? 's' : ''}</div>
    </div>
  </div>
  ${body}
  <div style="margin-top:40px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:10px;color:#9aa1ad;text-align:center">
    Generated by GoalCert GoalCert HiveMind · ${new Date().toLocaleString()} · Confidential
  </div>
</body>
</html>`
}

function openPrintable(html) {
  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank')
  if (win) {
    win.onload = () => {
      setTimeout(() => win.print(), 500)
    }
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000)
}

function downloadBlob(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
