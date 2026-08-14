// PublicSite.jsx — everything a signed-out visitor sees.
//
//   /          the landing page (hero + platform story + closing CTA)
//   /products  the full product listing, every platform with its entry price
//   /pricing   the 4-step self-serve funnel (optionally ?product=<id>)
//
// The dashboard lives at /dashboard and is untouched by this file.
import React, { useEffect, useRef, useState } from 'react'
import ProdIcon from './ProdIcon.jsx'
import PricingFunnel from './PricingFunnel.jsx'
import API from '../api.js'
import { navigate, useRoute } from '../router.jsx'
import { Logo } from '../lib.jsx'
import './nxg.css'
import './landing.css'

/* Respect the OS "reduce motion" setting everywhere we animate. */
const reduceMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Fade/slide elements in as they scroll into view. Anything marked
 *  `data-reveal` participates; with reduced motion they simply start visible. */
function useReveal(deps = []) {
  useEffect(() => {
    const els = document.querySelectorAll('[data-reveal]:not(.in)')
    if (!els.length) return
    if (reduceMotion() || !('IntersectionObserver' in window)) {
      els.forEach(el => el.classList.add('in'))
      return
    }
    const io = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) }
      }),
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    )
    els.forEach(el => io.observe(el))
    return () => io.disconnect()
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
}

export default function PublicSite() {
  const { path, query } = useRoute()
  const page = path === '/pricing' ? 'pricing' : path === '/products' ? 'products' : 'home'
  // The microservices ARE the products: this catalogue is the only source the
  // public site renders from. There is deliberately no hardcoded fallback —
  // showing a stale product list when the API is down would advertise services
  // the platform no longer sells, so an unreachable catalogue says so instead.
  const [catalog, setCatalog] = useState(null)
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogError, setCatalogError] = useState(null)
  const [country, setCountry] = useState('IN')

  useEffect(() => {
    let active = true
    setCatalogLoading(true)
    setCatalogError(null)
    API.public.catalog(country)
      .then(res => { if (!active) return; setCatalog(res); setCatalogLoading(false) })
      .catch(err => { if (!active) return; setCatalog(null); setCatalogLoading(false); setCatalogError(err.detail || err.message || 'Unable to load pricing') })
    return () => { active = false }
  }, [country])

  const products = catalog && catalog.modules
    ? catalog.modules.map(m => ({
        id: m.code,
        name: m.name,
        icon: m.icon || 'ti-box',
        color: m.color || '#6d28d9',
        tag: m.tagline || m.category || '',
        desc: m.description || '',
        unit: m.plans?.[0]?.unit || 'seat',
        unitLbl: m.plans?.[0]?.unit || 'seat',
        minQty: [m.plans?.[0]?.minQty || 1, m.plans?.[0]?.minQty || 1, m.plans?.[0]?.minQty || 1, m.plans?.[0]?.minQty || 1],
        perMonth: m.plans?.[0]?.billingCycle === 'monthly',
        tiers: (m.plans || []).map(pl => ({
          name: pl.name,
          action: pl.action,
          popular: pl.isPopular,
          price: pl.price,
          period: pl.price?.period || '',
          scope: pl.scope,
          feats: pl.features || [],
          notincl: pl.excluded || [],
          priceLabel: pl.price?.amount == null ? 'Custom' : undefined,
        })),
      }))
    : []

  const catalogueNote = catalog && !catalogLoading ? `Prices shown for ${country}` : ''

  // Flag the document while these routes are mounted: the marketing pages are
  // long scrolling documents, so they unpin the height:100% the dashboard shell
  // sets on html/body/#root. Colours are the same light theme either way.
  useEffect(() => {
    document.documentElement.setAttribute('data-site', 'public')
    return () => document.documentElement.removeAttribute('data-site')
  }, [])

  return (
    <div className="nxg">
      <Header active={page} />
      <main id="main">
        {page === 'pricing' ? (
          <>
            <div className="hero">
              <div className="eyebrow">Pricing &amp; Plans — 2026</div>
              <h1>The right plan for<br /><span>every organisation</span></h1>
              <p>
                Self-serve plans activate instantly. Free trials available on professional and
                enterprise tiers. No hidden costs — all pricing is published.
              </p>
            </div>
            <PricingFunnel initialProduct={query.get('product')} products={products}
              country={country} onCountryChange={setCountry}
              catalogueNote={catalogueNote} />
          </>
        ) : page === 'products' ? (
          <Products products={products} loading={catalogLoading} error={catalogError} />
        ) : (
          <Landing />
        )}
      </main>
      <Footer />
    </div>
  )
}

function Header({ active }) {
  return (
    <header className="nxg-hdr">
      <a className="skip-link" href="#main">Skip to content</a>
      <div className="logo" onClick={() => navigate('/')} role="link" tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && navigate('/')}>
        {/* Same lockup component the admin shell uses, so the two never drift. */}
        <Logo size={36} />
      </div>
      <nav className="hdr-r" aria-label="Primary">
        <button className={`hdr-lk ${active === 'products' ? 'on' : ''}`} onClick={() => navigate('/products')}>Microservices</button>
        <button className={`hdr-lk ${active === 'pricing' ? 'on' : ''}`} onClick={() => navigate('/pricing')}>Pricing</button>
        <button className="hdr-signin" onClick={() => navigate('/login')}>
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
              d="M11 16l-4-4m0 0l4-4m-4 4h14m-5-9h2a3 3 0 013 3v12a3 3 0 01-3 3h-2" />
          </svg>
          Login
        </button>
        <button className="hdr-login" onClick={() => navigate('/pricing')}>
          Get Started
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </nav>
    </header>
  )
}

/* ══════════════════════════════════════════════════════════════════
   LANDING
══════════════════════════════════════════════════════════════════ */
function Landing() {
  useReveal()
  return (
    <>
      <Hero />
      <LogoStrip />
      <Pillars />
      <Ways />
    </>
  )
}

function Hero() {
  const visual = useRef(null)

  // Pointer parallax on the hero panel — rAF-throttled, pointer-devices only,
  // and skipped entirely under reduced motion.
  useEffect(() => {
    const el = visual.current
    if (!el || reduceMotion()) return
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
    let raf = 0, tx = 0, ty = 0
    const onMove = e => {
      const cx = window.innerWidth / 2, cy = window.innerHeight / 2
      tx = ((e.clientX - cx) / cx) * 6
      ty = ((e.clientY - cy) / cy) * 6
      if (!raf) raf = requestAnimationFrame(() => {
        raf = 0
        el.style.transform = `perspective(1200px) rotateY(${tx * 0.5}deg) rotateX(${-ty * 0.4}deg) translate3d(${tx}px,${ty}px,0)`
      })
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => { window.removeEventListener('pointermove', onMove); if (raf) cancelAnimationFrame(raf) }
  }, [])

  return (
    <section className="hx" aria-labelledby="hx-title">
      <div className="hx-aura" aria-hidden="true">
        <span className="hx-orb hx-orb-1" />
        <span className="hx-orb hx-orb-2" />
        <span className="hx-orb hx-orb-3" />
      </div>
      <div className="hx-mesh" aria-hidden="true" />

      <div className="hx-inner">
        <div className="hx-copy">
          <div className="hx-badge" data-reveal>
            <span className="hx-ping" aria-hidden="true"><i /></span>
            Six platforms · one intelligent hub
          </div>

          <h1 id="hx-title" data-reveal style={{ '--d': '.05s' }}>
            Train, simulate and operate
            <span className="hx-grad"> on one platform</span>
          </h1>

          <p className="hx-sub" data-reveal style={{ '--d': '.12s' }}>
            Immersive training, live digital twins and autonomous AI agents — built for defence,
            rail, energy and industry. Published pricing, instant activation, no sales call required.
          </p>

          <div className="hx-ctas" data-reveal style={{ '--d': '.18s' }}>
            <button className="hx-btn hx-primary" onClick={() => navigate('/pricing')}>
              Get Started
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <button className="hx-btn hx-outline" onClick={() => navigate('/products')}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                  d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
              Explore Products
            </button>
          </div>

          <div className="hx-ctas hx-ctas-sec" data-reveal style={{ '--d': '.24s' }}>
            <button className="hx-btn hx-ghost" onClick={() => navigate('/login')}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                  d="M11 16l-4-4m0 0l4-4m-4 4h14m-5-9h2a3 3 0 013 3v12a3 3 0 01-3 3h-2" />
              </svg>
              Login
            </button>
            <span className="hx-sep" aria-hidden="true" />
            <button className="hx-btn hx-ghost" onClick={() => navigate('/login?mode=signup')}>
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                  d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM20 8v6M23 11h-6" />
              </svg>
              Sign Up
            </button>
          </div>

          <ul className="hx-trust" data-reveal style={{ '--d': '.3s' }}>
            <li><Tick /> Activated in 2 hours</li>
            <li><Tick /> 30-day free trials</li>
            <li><Tick /> On-premise &amp; air-gapped</li>
          </ul>
        </div>

        <div className="hx-visual-wrap" data-reveal style={{ '--d': '.16s' }}>
          <div className="hx-visual" ref={visual} aria-hidden="true">
            <SignalMesh />
          </div>
        </div>
      </div>
    </section>
  )
}

const Tick = () => (
  <svg className="hx-tick" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
  </svg>
)

/* ── Hero visual: an interactive signal mesh ───────────────────────────
   Drifting nodes that link when they get close, three anchor points that
   reveal a reading on hover, and a cursor that bends the field around it.
   Purely decorative: it says "a live system", it does not name one. The whole
   rAF loop is skipped under reduced motion, which renders a single still frame. */

// Anchors sit at fractions of the canvas so they survive any resize.
const MESH_ANCHORS = [
  { x: .25, y: .30, c: '#6d28d9', k: 'Throughput', v: '4.2k / sec' },
  { x: .74, y: .27, c: '#2563eb', k: 'Latency', v: '38 ms' },
  { x: .55, y: .73, c: '#16a34a', k: 'Integrity', v: 'Verified' },
]

const LINK = 104   // px: nodes closer than this are drawn connected
const REACH = 132  // px: cursor influence radius

function SignalMesh() {
  const host = useRef(null)
  const cvs = useRef(null)
  const [tip, setTip] = useState(null)      // hovered anchor → floating chip
  const [live, setLive] = useState(false)   // cursor is over the panel

  useEffect(() => {
    const canvas = cvs.current, box = host.current
    if (!canvas || !box) return
    const ctx = canvas.getContext('2d')
    const still = reduceMotion()

    let w = 0, h = 0, raf = 0, t = 0
    const nodes = [], anchors = []
    const ptr = { x: -9e3, y: -9e3, on: false }

    const seed = () => {
      const r = box.getBoundingClientRect()
      if (!r.width || !r.height) return
      w = r.width; h = r.height
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // density scales with area so a phone doesn't render a hairball
      const n = Math.max(14, Math.min(34, Math.round((w * h) / 6800)))
      nodes.length = 0
      for (let i = 0; i < n; i++) {
        nodes.push({
          x: Math.random() * w, y: Math.random() * h,
          vx: (Math.random() - .5) * .24, vy: (Math.random() - .5) * .24,
          r: 1.3 + Math.random() * 1.5,
          ox: 0, oy: 0,            // cursor displacement, eased back to 0
        })
      }
      anchors.length = 0
      MESH_ANCHORS.forEach((a, i) =>
        anchors.push({ ...a, px: a.x * w, py: a.y * h, ph: i * 2.2 }))
    }

    const draw = () => {
      ctx.clearRect(0, 0, w, h)

      // node ↔ node links
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i]
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j]
          const dx = (a.x + a.ox) - (b.x + b.ox), dy = (a.y + a.oy) - (b.y + b.oy)
          const d = Math.hypot(dx, dy)
          if (d > LINK) continue
          ctx.strokeStyle = `rgba(109,40,217,${(1 - d / LINK) * .34})`
          ctx.lineWidth = 1
          ctx.beginPath()
          ctx.moveTo(a.x + a.ox, a.y + a.oy)
          ctx.lineTo(b.x + b.ox, b.y + b.oy)
          ctx.stroke()
        }
      }

      // anchor ↔ node links, tinted with the anchor's own colour
      anchors.forEach(an => {
        nodes.forEach(nd => {
          const d = Math.hypot(an.px - (nd.x + nd.ox), an.py - (nd.y + nd.oy))
          if (d > LINK * 1.25) return
          ctx.strokeStyle = hexA(an.c, (1 - d / (LINK * 1.25)) * .46)
          ctx.lineWidth = 1.1
          ctx.beginPath()
          ctx.moveTo(an.px, an.py)
          ctx.lineTo(nd.x + nd.ox, nd.y + nd.oy)
          ctx.stroke()
        })
      })

      // the cursor is a node too — it wires itself into whatever is near
      if (ptr.on) {
        nodes.forEach(nd => {
          const d = Math.hypot(ptr.x - (nd.x + nd.ox), ptr.y - (nd.y + nd.oy))
          if (d > REACH) return
          ctx.strokeStyle = `rgba(37,99,235,${(1 - d / REACH) * .45})`
          ctx.lineWidth = 1.15
          ctx.beginPath()
          ctx.moveTo(ptr.x, ptr.y)
          ctx.lineTo(nd.x + nd.ox, nd.y + nd.oy)
          ctx.stroke()
        })
      }

      // a packet running the anchor spine — the one thing that reads as "live"
      if (!still) {
        const leg = (t / 150) % anchors.length
        const i = Math.floor(leg), p = leg - i
        const from = anchors[i], to = anchors[(i + 1) % anchors.length]
        const px = from.px + (to.px - from.px) * p
        const py = from.py + (to.py - from.py) * p
        const g = ctx.createRadialGradient(px, py, 0, px, py, 9)
        g.addColorStop(0, hexA(to.c, .9))
        g.addColorStop(1, hexA(to.c, 0))
        ctx.fillStyle = g
        ctx.beginPath(); ctx.arc(px, py, 9, 0, 7); ctx.fill()
      }

      // drifting nodes
      nodes.forEach(nd => {
        ctx.fillStyle = 'rgba(109,40,217,.68)'
        ctx.beginPath()
        ctx.arc(nd.x + nd.ox, nd.y + nd.oy, nd.r, 0, 7)
        ctx.fill()
      })

      // anchors: a breathing halo + solid core
      anchors.forEach(an => {
        const pulse = still ? .5 : (Math.sin(t / 34 + an.ph) + 1) / 2
        const ring = 11 + pulse * 7
        ctx.fillStyle = hexA(an.c, .1 + pulse * .1)
        ctx.beginPath(); ctx.arc(an.px, an.py, ring, 0, 7); ctx.fill()
        ctx.strokeStyle = hexA(an.c, .5)
        ctx.lineWidth = 1.2
        ctx.beginPath(); ctx.arc(an.px, an.py, 10, 0, 7); ctx.stroke()
        ctx.fillStyle = an.c
        ctx.beginPath(); ctx.arc(an.px, an.py, 4.2, 0, 7); ctx.fill()
      })
    }

    const step = () => {
      t++
      nodes.forEach(nd => {
        nd.x += nd.vx; nd.y += nd.vy
        if (nd.x < 6 || nd.x > w - 6) nd.vx *= -1
        if (nd.y < 6 || nd.y > h - 6) nd.vy *= -1
        nd.x = Math.max(6, Math.min(w - 6, nd.x))
        nd.y = Math.max(6, Math.min(h - 6, nd.y))

        // pull toward the cursor, then ease home when it leaves
        let tx = 0, ty = 0
        if (ptr.on) {
          const dx = ptr.x - nd.x, dy = ptr.y - nd.y
          const d = Math.hypot(dx, dy)
          if (d < REACH && d > .5) {
            const f = (1 - d / REACH) * 16
            tx = (dx / d) * f; ty = (dy / d) * f
          }
        }
        nd.ox += (tx - nd.ox) * .08
        nd.oy += (ty - nd.oy) * .08
      })
      draw()
      raf = requestAnimationFrame(step)
    }

    seed()
    if (still) { draw(); return }
    raf = requestAnimationFrame(step)

    const onResize = () => { seed(); draw() }
    const ro = 'ResizeObserver' in window ? new ResizeObserver(onResize) : null
    ro?.observe(box)
    window.addEventListener('resize', onResize)

    // pointer: drives the field, the glare, and the anchor hover chip
    const onMove = e => {
      const r = box.getBoundingClientRect()
      ptr.x = e.clientX - r.left; ptr.y = e.clientY - r.top; ptr.on = true
      box.style.setProperty('--mx', `${ptr.x}px`)
      box.style.setProperty('--my', `${ptr.y}px`)
      const hit = anchors.find(a => Math.hypot(a.px - ptr.x, a.py - ptr.y) < 26)
      setTip(hit ? { x: hit.px, y: hit.py, k: hit.k, v: hit.v, c: hit.c } : null)
    }
    const onLeave = () => { ptr.on = false; ptr.x = ptr.y = -9e3; setTip(null); setLive(false) }
    const onEnter = () => setLive(true)
    box.addEventListener('pointermove', onMove)
    box.addEventListener('pointerenter', onEnter)
    box.addEventListener('pointerleave', onLeave)

    return () => {
      cancelAnimationFrame(raf)
      ro?.disconnect()
      window.removeEventListener('resize', onResize)
      box.removeEventListener('pointermove', onMove)
      box.removeEventListener('pointerenter', onEnter)
      box.removeEventListener('pointerleave', onLeave)
    }
  }, [])

  return (
    <div className={`sm ${live ? 'sm-live' : ''}`}>
      <div className="sm-bar">
        <span className="sm-dots"><i /><i /><i /></span>
        <span className="sm-title">System pulse</span>
        <span className="sm-badge"><i />LIVE</span>
      </div>

      <div className="sm-stage" ref={host}>
        <canvas ref={cvs} className="sm-canvas" />
        <span className="sm-glare" />
        <span className="sm-grid" />
        {tip && (
          <span className="sm-tip" style={{ left: tip.x, top: tip.y, '--tc': tip.c }}>
            <em>{tip.k}</em><b>{tip.v}</b>
          </span>
        )}
        <span className="sm-hint">Move your cursor across the field</span>
      </div>

      <div className="sm-foot">
        <Metric to={99.98} dp={2} suffix="%" label="Uptime" />
        <Metric to={200} dp={0} prefix="<" suffix="ms" label="Response" />
        <Metric text="24/7" label="Coverage" />
      </div>
    </div>
  )
}

/* A footer figure that counts up once, then holds. */
function Metric({ to, dp = 0, prefix = '', suffix = '', text, label }) {
  const [n, setN] = useState(text ? null : 0)

  useEffect(() => {
    if (text == null && reduceMotion()) { setN(to); return }
    if (text != null) return
    const dur = 1100, t0 = performance.now()
    let raf = requestAnimationFrame(function tick(now) {
      const p = Math.min(1, (now - t0) / dur)
      // easeOutCubic — fast to start, settles gently on the real figure
      setN(to * (1 - Math.pow(1 - p, 3)))
      if (p < 1) raf = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(raf)
  }, [to, text])

  return (
    <div className="sm-stat">
      <b>{text ?? `${prefix}${n.toFixed(dp)}${suffix}`}</b>
      <span>{label}</span>
    </div>
  )
}

/* #rrggbb + alpha → rgba(). Keeps the palette in one place: the token hexes. */
function hexA(hex, a) {
  const v = parseInt(hex.slice(1), 16)
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`
}

function LogoStrip() {
  const sectors = ['Defence', 'Railways', 'Energy', 'Manufacturing', 'Aviation', 'Healthcare']
  return (
    <section className="ls" data-reveal aria-label="Sectors served">
      <div className="ls-cap">Deployed across</div>
      <div className="ls-row">
        {sectors.map(s => <span className="ls-item" key={s}>{s}</span>)}
      </div>
    </section>
  )
}

function Pillars() {
  const items = [
    {
      c: '#2563eb', t: 'Digital Twin',
      d: 'Live replicas of your assets and sites, with AI anomaly detection and predictive maintenance.',
      p: ['Real-time telemetry', 'Predictive alerts', 'BIM / CAD import'],
      icon: 'M4 7l8-4 8 4v10l-8 4-8-4V7z M12 3v18 M4 7l8 4 8-4',
    },
    {
      c: '#0d9488', t: 'Immersive Training',
      d: 'VR and XR simulation with instructor consoles, multiplayer scenarios and auto after-action reports.',
      p: ['Multiplayer VR', 'AI mission scoring', 'SCORM / xAPI'],
      icon: 'M21 12a9 9 0 11-18 0 9 9 0 0118 0z M12 8v4l3 2',
    },
    {
      c: '#6d28d9', t: 'Agentic AI',
      d: 'Autonomous agents that observe, reason and act across your training and operational workflows.',
      p: ['OODA loop engine', 'Agent swarms', 'Private LLM option'],
      icon: 'M12 3a4 4 0 014 4v1a4 4 0 010 8v1a4 4 0 01-8 0v-1a4 4 0 010-8V7a4 4 0 014-4z',
    },
  ]
  return (
    <section className="sec" aria-labelledby="pil-h">
      <div className="sec-head" data-reveal>
        <div className="sec-eyebrow">The platform</div>
        <h2 id="pil-h">Many engines. One hub.</h2>
        <p>Every product is built on the same spine, so what you train on is what you operate.</p>
      </div>
      <div className="pil-grid">
        {items.map((it, i) => (
          <article className="pil" key={it.t} data-reveal style={{ '--d': `${i * 0.08}s`, '--c': it.c }}>
            <div className="pil-ico">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.7" d={it.icon} />
              </svg>
            </div>
            <h3>{it.t}</h3>
            <p>{it.d}</p>
            <ul className="pil-pts">
              {it.p.map(x => <li key={x}><Tick /> {x}</li>)}
            </ul>
          </article>
        ))}
      </div>
    </section>
  )
}

// The "Six platforms, published pricing" teaser used to sit here on the home
// page. Removed by request — the catalogue still lives at /products and /pricing,
// which the header and the hero CTAs both link to.

function Ways() {
  const ways = [
    { c: '#6d28d9', n: '01', t: 'Sign Up & Use', d: 'Published price, card / UPI / net-banking checkout, activated within 2 hours.' },
    { c: '#d97706', n: '02', t: '30-Day Free Trial', d: 'On professional and enterprise tiers. No credit card. A Solutions Engineer helps you set up.' },
    { c: '#7c3aed', n: '03', t: 'Enterprise+', d: 'On-premise and air-gapped deployment, custom SLA, source-code escrow and a guided POC.' },
  ]
  return (
    <section className="sec" aria-labelledby="w-h">
      <div className="sec-head" data-reveal>
        <div className="sec-eyebrow">Getting started</div>
        <h2 id="w-h">Three ways to begin</h2>
        <p>Every tier is one of these — the badge on each plan tells you which.</p>
      </div>
      <div className="way-grid">
        {ways.map((w, i) => (
          <article className="way" key={w.t} data-reveal style={{ '--d': `${i * 0.08}s`, '--c': w.c }}>
            <span className="way-n">{w.n}</span>
            <h3>{w.t}</h3>
            <p>{w.d}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

/* ══════════════════════════════════════════════════════════════════
   PRODUCTS — the full listing, reached from "Explore Products"
══════════════════════════════════════════════════════════════════ */
// Spelled out so the headline reads as prose; beyond this the numeral is fine.
const WORD = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten']
const countWord = n => WORD[n] ?? String(n)
const plural = (n, one, many) => (n === 1 ? one : many)

function Products({ products, loading, error }) {
  // Re-run the reveal observer when the catalogue arrives: the cards do not
  // exist on first paint, so a one-shot pass would leave them faded out.
  useReveal([products.length, loading, error])
  const n = products.length
  return (
    <>
      <div className="hero">
        <div className="eyebrow">Microservices — 2026</div>
        <h1>
          {loading || error ? 'Every microservice.' : `${countWord(n)} ${plural(n, 'microservice', 'microservices')}.`}
          <br /><span>One integrated hub.</span>
        </h1>
        <p>
          Immersive training, live digital twins and autonomous AI agents. Pick a microservice to see
          every tier priced for your country, or bundle several for a combined quote.
        </p>
      </div>

      <div className="lwrap">
        <div className="lsec-head" data-reveal>
          <div>
            <h2>All microservices</h2>
            <p>
              {loading ? 'Loading the catalogue…'
                : error ? 'Catalogue unavailable'
                : `${n} ${plural(n, 'microservice', 'microservices')} · self-serve, trial or enterprise`}
            </p>
            <div className="hint" style={{ marginTop: 6 }}>
              Prices are set per country — choose yours on the plans page.
            </div>
          </div>
          <button className="btn bp" onClick={() => navigate('/pricing')}>
            Compare all plans
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* No hardcoded fallback stands behind this list, so each of these
            states has to be said out loud rather than papered over. */}
        {loading && <div className="lstate" data-reveal>Loading the microservice catalogue…</div>}

        {!loading && error && (
          <div className="lstate lstate-err" data-reveal>
            <strong>The catalogue is unavailable.</strong>
            <span>{error}</span>
            <button className="btn bo" onClick={() => window.location.reload()}>Try again</button>
          </div>
        )}

        {!loading && !error && n === 0 && (
          <div className="lstate" data-reveal>
            <strong>No microservices are published yet.</strong>
            <span>A platform owner publishes them from Microservices in the admin panel.</span>
          </div>
        )}

        <div className="lgrid">
          {products.map((p, i) => {
            return (
              <div key={p.id} className="lcard" data-reveal style={{ borderTop: `2px solid ${p.color}`, '--d': `${i * 0.06}s` }}
                onClick={() => navigate(`/pricing?product=${p.id}`)}>
                <div className="lcard-top">
                  <div className="lcard-ico" style={{ background: `${p.color}14`, color: p.color }}>
                    <ProdIcon icon={p.icon} />
                  </div>
                  <div>
                    <h3>{p.name}</h3>
                    <div className="lcard-tag">{p.tag}</div>
                  </div>
                </div>
                <div className="lcard-desc">{p.desc}</div>
                <div className="lcard-tiers">
                  {p.tiers.map(t => <span key={t.name} className="ltier">{t.name}</span>)}
                </div>
                <div className="lcard-foot">
                  <div>
                    <div className="lfrom">
                      {p.tiers.length ? `${p.tiers.length} plans · per ${p.unit}` : `Priced per ${p.unit}`}
                    </div>
                    <div className="lunit">Pricing varies by region</div>
                  </div>
                  <button className="lcta" style={{ background: p.color, color: '#fff' }}
                    onClick={e => { e.stopPropagation(); navigate(`/pricing?product=${p.id}`) }}>
                    View plans →
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        <div className="lcloser" data-reveal>
          <h2>Need more than one microservice?</h2>
          <p>
            Select several in the funnel and our team designs a combined bundle — one price,
            one contract, one point of contact.
          </p>
          <div className="lcloser-btns">
            <button className="btn bp blg" onClick={() => navigate('/pricing')}>Get pricing</button>
            <button className="btn bo blg" onClick={() => navigate('/login')}>Login to the Hub</button>
          </div>
        </div>
      </div>
    </>
  )
}

function Footer() {
  return (
    <footer className="nxg-foot">
      <div>© 2026 Next XR Group · All prices exclude applicable taxes</div>
      <div className="ffl">
        <button onClick={() => navigate('/products')}>Microservices</button>
        <button onClick={() => navigate('/pricing')}>Pricing</button>
        <button onClick={() => navigate('/login')}>Login</button>
        <button onClick={() => navigate('/login?mode=signup')}>Sign up</button>
      </div>
    </footer>
  )
}
