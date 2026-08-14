// ProdIcon.jsx — renders a product's icon whichever shape it arrives in.
//
// The public site has two catalogue sources and they disagree about what an
// icon is: the built-in fallback in products.js ships emoji ('🛸'), while the
// API catalogue ships Tabler webfont class names ('ti-cube'). Every call site
// used to interpolate the value straight into JSX, so anything from the API
// rendered as the literal text "ti-cube" next to the product name.
//
// The webfont itself is already loaded globally in index.html, so a class name
// only needs to reach an <i class="ti ti-cube">. Anything else — emoji, or a
// future single character — is passed through untouched.
import React from 'react'

// Tabler classes are the only string we reinterpret; matching the documented
// `ti-*` shape keeps a product whose icon is genuinely text from vanishing
// into an empty <i>.
const isIconClass = v => typeof v === 'string' && /^ti-[a-z0-9]+(-[a-z0-9]+)*$/.test(v.trim())

export default function ProdIcon({ icon }) {
  if (!icon) return null
  return isIconClass(icon) ? <i className={`ti ${icon.trim()}`} aria-hidden="true" /> : <>{icon}</>
}
