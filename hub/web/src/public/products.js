// products.js — the NXG catalogue: 6 products × 4 tiers, verbatim from the
// NXG pricing docs. This is the single source of truth for the public site:
// the landing listing, the funnel's product grid and every tier card read it.
//
// Tier `action` drives which path the funnel takes:
//   signup     → instant self-serve checkout (step 4a)
//   trial      → 30-day free trial form (step 4c), with "or contact sales"
//   enterprise → guided POC / sales form (step 4b)
export const PRODS = {
  droneforce: {
    id: 'droneforce', name: 'DroneForce AI', icon: '🛸', color: '#16a34a',
    tag: 'VR Drone Training Simulator',
    desc: 'Immersive VR drone simulation for defence, paramilitary, and commercial drone training.',
    unit: 'seat', unitLbl: 'VR Headset Seats', minQty: [1, 2, 9, 33], perMonth: false,
    tiers: [
      {
        name: 'Solo Pilot', action: 'signup', popular: false,
        price: 14999, usd: 180, period: '/seat/yr',
        scope: '1 seat · Individual / DGCA prep',
        feats: ['All drone types & airframes', 'Standard terrain library (8 environments)', '13 pre-built training courses', 'All weather & time-of-day conditions', 'VR headset + desktop support', 'AI mission scoring'],
        notincl: ['Multiplayer (single-player only)', 'Basic analytics (no AAR export)', 'Instructor console'],
      },
      {
        name: 'Squad', action: 'signup', popular: false,
        price: 11999, usd: 145, period: '/seat/yr',
        scope: '2–8 seats · Unit / training centre',
        feats: ['Everything in Solo Pilot', 'Multiplayer up to 8 players', 'Instructor console & live dashboard', 'Live telemetry — all 5 required fields', 'AI scoring + Auto AAR (PDF)', 'Custom mission builder'],
        notincl: ['Full Agentic AI engine', 'AI adaptive difficulty (basic only)'],
      },
      {
        name: 'Battalion', action: 'trial', popular: true,
        price: 9499, usd: 115, period: '/seat/yr',
        scope: '9–32 seats · Organisation / defence unit',
        feats: ['Everything in Squad', 'Full Agentic AI Engine (11 modules)', 'Multiplayer up to 32 players', 'Predictive readiness & skill gap report', 'AI anomaly detection (<200ms alert)', 'Analytics portal — full cohort view', 'SCORM / xAPI LMS export', '1 custom terrain included'],
        notincl: [],
      },
      {
        name: 'Enterprise+', action: 'enterprise', popular: false,
        price: 7499, usd: 90, period: '/seat/yr',
        scope: '33+ seats · Multi-site / Govt / OEM',
        feats: ['Everything in Battalion', 'Unlimited seats across all sites', 'White-label / custom branding', 'Multi-site & multi-tenant deployment', '3 custom terrains included', 'Dedicated Customer Success Manager', 'API access for integration', 'SLA-backed support, 4hr response'],
        notincl: [],
      },
    ],
  },
  digitaltwin: {
    id: 'digitaltwin', name: 'Digital Twin', icon: '🏗', color: '#2563eb',
    tag: 'Real-time Asset & Infrastructure Replicas',
    desc: 'Live digital replicas of physical assets and infrastructure with AI anomaly detection.',
    unit: 'site', unitLbl: 'Sites / Facilities', minQty: [1, 1, 1, 1], perMonth: false,
    tiers: [
      {
        name: 'Starter', action: 'signup', popular: false,
        price: 150000, usd: 1800, period: '/site/yr',
        scope: '1 site · Up to 10 asset models',
        feats: ['Real-time asset status dashboard', '3D model viewer (web-based)', 'Sensor data integration (up to 20 data points)', 'Anomaly threshold alerts', 'Historical data log (90 days)', 'Standard API access'],
        notincl: ['Multi-site federation', 'AI predictive maintenance'],
      },
      {
        name: 'Professional', action: 'signup', popular: false,
        price: 450000, usd: 5400, period: '/year',
        scope: 'Up to 5 sites · 50 asset models each',
        feats: ['Everything in Starter', 'Multi-site federation & comparison', 'Unlimited sensor data points', 'Historical data log (2 years)', 'SCADA / BMS / IoT integration', 'Custom dashboard builder', 'AI anomaly detection'],
        notincl: ['AI predictive maintenance'],
      },
      {
        name: 'Enterprise', action: 'trial', popular: true,
        price: 900000, usd: 10800, period: '/year',
        scope: 'Unlimited sites · Unlimited assets',
        feats: ['Everything in Professional', 'AI predictive maintenance engine', 'Unlimited historical data', 'Full REST + Webhook API', 'SSO / LDAP & role-based access', 'White-label / custom branding', 'BIM / CAD / Revit model import', 'Dedicated Customer Success Manager'],
        notincl: [],
      },
      {
        name: 'Enterprise+', action: 'enterprise', popular: false,
        price: null, usd: null, period: '',
        priceLabel: 'Custom', usdLabel: 'From ₹20,00,000 perpetual',
        scope: 'On-premise · Air-gapped · Custom',
        feats: ['Everything in Enterprise', 'On-premise / air-gapped deployment', 'Classified data residency', 'MoD / defence security compliance', 'Source code escrow', 'Multi-agency federation', 'Custom SLA (99.9% uptime)', '18% AMC per year from Year 2'],
        notincl: [],
      },
    ],
  },
  lms: {
    id: 'lms', name: 'LMS', icon: '📖', color: '#0d9488',
    tag: 'Enterprise Learning Management System',
    desc: 'Manage, deliver, and track training for your entire organisation at scale.',
    unit: 'learner', unitLbl: 'Active Learners / year', minQty: [50, 201, 1001, 5001], perMonth: false,
    tiers: [
      {
        name: 'Starter', action: 'signup', popular: false,
        price: 900, usd: 11, period: '/learner/yr',
        scope: 'Up to 200 learners · min ₹60,000/yr',
        feats: ['Unlimited courses & modules', 'SCORM 1.2 & 2004 compliant', 'Basic learner progress tracking', 'Certificate generation', 'Email notifications', 'Standard branding (NXG co-branded)'],
        notincl: ['API / LRS integration', 'Advanced analytics & reports', 'AI-powered learning paths'],
      },
      {
        name: 'Growth', action: 'signup', popular: false,
        price: 650, usd: 8, period: '/learner/yr',
        scope: '201–1,000 learners',
        feats: ['Everything in Starter', 'Custom branding (fully white-label)', 'xAPI / TinCan LRS integration', 'Advanced analytics dashboard', 'Skills & competency mapping', 'Manager & team reporting', 'SSO integration (SAML 2.0)'],
        notincl: ['AI-powered learning paths'],
      },
      {
        name: 'Scale', action: 'trial', popular: true,
        price: 450, usd: 5.40, period: '/learner/yr',
        scope: '1,001–5,000 learners',
        feats: ['Everything in Growth', 'AI-powered personalised learning paths', 'Multi-language & localisation', 'Gamification & leaderboards', 'Compliance & audit trails', 'Blended learning (ILT + eLearning)', 'Full REST API access', 'Dedicated support (business hours)'],
        notincl: [],
      },
      {
        name: 'Enterprise+', action: 'enterprise', popular: false,
        price: 320, usd: 3.85, period: '/learner/yr',
        scope: '5,000+ learners · Unlimited users',
        feats: ['Everything in Scale', 'Unlimited admin users', 'Multi-tenant (divisions/subsidiaries)', 'SLA 99.9% uptime guarantee', 'Dedicated Customer Success Manager', 'On-premise option available', 'Custom integrations (SAP, Workday, Oracle)', '24/7 priority support'],
        notincl: [],
      },
    ],
  },
  xrlms: {
    id: 'xrlms', name: 'XR LMS', icon: '🥽', color: '#6d28d9',
    tag: 'Extended Reality Learning Management',
    desc: 'VR/AR-based immersive training with full LMS tracking, analytics, and AI.',
    unit: 'seat', unitLbl: 'XR Headset Seats', minQty: [1, 5, 25, 100], perMonth: false,
    tiers: [
      {
        name: 'Solo', action: 'signup', popular: false,
        price: 9999, usd: 120, period: '/seat/yr',
        scope: '1–4 seats · Individual or pilot',
        feats: ['VR & AR content delivery', 'SCORM / xAPI learning records', 'Headset enrolment & device management', 'Basic performance analytics', 'Pre-built immersive course templates', 'Single-player mode'],
        notincl: ['Instructor live monitoring', 'Multiplayer shared environments', 'AI adaptive learning'],
      },
      {
        name: 'Team', action: 'signup', popular: false,
        price: 7499, usd: 90, period: '/seat/yr',
        scope: '5–24 seats',
        feats: ['Everything in Solo', 'Instructor live dashboard (all seats)', 'Multiplayer shared VR environments', 'After-action report generation', 'Competency & skills tagging', 'SSO / organisational enrolment', 'Basic AI scoring'],
        notincl: ['Full Agentic AI engine'],
      },
      {
        name: 'Organisation', action: 'trial', popular: true,
        price: 5499, usd: 66, period: '/seat/yr',
        scope: '25–99 seats',
        feats: ['Everything in Team', 'Full Agentic AI Engine (11 modules)', 'AI adaptive difficulty per learner', 'Predictive readiness & certification forecast', 'Custom VR content upload & packaging', 'Multi-cohort analytics portal', 'SCORM / xAPI LMS bridge (connect to existing LMS)', '1 custom VR environment included'],
        notincl: [],
      },
      {
        name: 'Enterprise+', action: 'enterprise', popular: false,
        price: 3999, usd: 48, period: '/seat/yr',
        scope: '100+ seats · Multi-site',
        feats: ['Everything in Organisation', 'Unlimited seats across all sites', 'White-label headset & portal branding', '3 custom VR environments included', 'On-premise / air-gapped deployment', 'Full REST API + Webhook integration', 'Dedicated Customer Success Manager', 'SLA 99.9%, 4hr response support'],
        notincl: [],
      },
    ],
  },
  agentic: {
    id: 'agentic', name: 'Agentic Engine', icon: '🧠', color: '#d97706',
    tag: 'Autonomous AI Agent Platform',
    desc: 'Deploy AI agents that observe, reason, decide, and act across training and enterprise workflows.',
    unit: 'agent', unitLbl: 'Concurrent Agents', minQty: [1, 1, 1, 1], perMonth: true,
    tiers: [
      {
        name: 'Developer', action: 'signup', popular: false,
        price: 12000, usd: 145, period: '/month (₹1,44,000/yr)',
        scope: '3 agents · 25,000 calls/month',
        feats: ['Up to 3 autonomous agents', '25,000 inference calls/month', 'OODA loop engine', 'Pre-built agent templates (6 modules)', 'Webhook & REST trigger support', 'Basic analytics & call logs', 'Standard API access'],
        notincl: ['Custom model fine-tuning', 'Agent chain / swarm workflows'],
      },
      {
        name: 'Business', action: 'signup', popular: false,
        price: 40000, usd: 480, period: '/month (₹4,80,000/yr)',
        scope: '15 agents · 150,000 calls/month',
        feats: ['Everything in Developer', 'Up to 15 concurrent agents', '150,000 inference calls/month', 'Multi-step agent chain workflows', 'Agent-to-agent collaboration (swarm)', 'Custom knowledge base ingestion', 'Advanced analytics dashboard', 'Fine-tuning (1 model/year)'],
        notincl: [],
      },
      {
        name: 'Enterprise', action: 'trial', popular: true,
        price: 120000, usd: 1440, period: '/month (₹14,40,000/yr)',
        scope: 'Unlimited agents · 1,000,000 calls/month',
        feats: ['Everything in Business', 'Unlimited concurrent agents', '1,000,000 inference calls/month', 'Custom model fine-tuning (unlimited)', 'Private LLM deployment (on-prem option)', 'Real-time agent monitoring & audit', 'Enterprise SSO & RBAC', 'Dedicated ML engineer support'],
        notincl: [],
      },
      {
        name: 'Enterprise+', action: 'enterprise', popular: false,
        price: null, usd: null, period: '',
        priceLabel: 'Custom', usdLabel: 'From ₹20,00,000 perpetual',
        scope: 'On-premise · Air-gapped · Custom',
        feats: ['Everything in Enterprise', 'Air-gapped / on-premise deployment', 'Classified data — no cloud dependency', 'Custom LLM / model selection', 'DRDO / MoD compliance packaging', 'Source code access (escrow)', '18% AMC per year from Year 2', 'Dedicated integration team'],
        notincl: [],
      },
    ],
  },
  simengine: {
    id: 'simengine', name: 'Simulation Engine', icon: '⚡', color: '#e11d48',
    tag: 'High-Fidelity Real-time Simulation Platform',
    desc: 'Build training simulations, digital testing environments, and interactive scenarios at scale.',
    unit: 'dev seat', unitLbl: 'Developer Seats', minQty: [1, 4, 21, 100], perMonth: false,
    tiers: [
      {
        name: 'Indie', action: 'signup', popular: false,
        price: 60000, usd: 720, period: '/seat/yr',
        scope: '1–3 dev seats · Revenue <₹1Cr/yr',
        feats: ['Full simulation engine access', 'Physics (rigid body + fluid basics)', 'Standard terrain & environment toolset', 'VR / XR export (Meta, Pico, PCVR)', 'Community support & documentation', 'Royalty-free below ₹1Cr revenue'],
        notincl: ['Source code access', 'Advanced physics modules'],
      },
      {
        name: 'Studio', action: 'signup', popular: false,
        price: 40000, usd: 480, period: '/seat/yr',
        scope: '4–20 developer seats',
        feats: ['Everything in Indie', 'Advanced physics (fluid dynamics, soft body)', 'Multi-user / networked simulation', 'Procedural terrain generator', 'AI NPC behaviour engine', 'Performance profiler & optimisation tools', 'Email + ticketed support'],
        notincl: ['Hardware-in-the-loop (HIL)'],
      },
      {
        name: 'Professional', action: 'trial', popular: true,
        price: 28000, usd: 336, period: '/seat/yr',
        scope: '21–100 developer seats',
        feats: ['Everything in Studio', 'Hardware-in-the-loop (HIL) integration', 'Full Agentic AI integration', 'Sensor simulation (lidar, radar, camera)', 'Custom plugin & SDK access', 'CI/CD simulation pipeline support', 'SLA-backed technical support', 'Source code access (selected modules)'],
        notincl: [],
      },
      {
        name: 'Enterprise+', action: 'enterprise', popular: false,
        price: 20000, usd: 240, period: '/seat/yr',
        scope: '100+ seats · Unlimited runtime deployment',
        feats: ['Everything in Professional', 'Full source code access (escrow + build)', 'Unlimited royalty-free runtime deployment', 'White-label engine branding', 'Dedicated engineering support team', 'Custom physics module development', 'On-premise licence server', '18% AMC per year from Year 2'],
        notincl: [],
      },
    ],
  },
}

export const PROD_LIST = Object.values(PRODS)

// ── formatting helpers shared by the listing and the funnel ──────────
export const fmtINR = n => (n == null ? 'Custom' : '₹' + n.toLocaleString('en-IN'))
export const fmtMoney = (value) => {
  if (value == null) return 'Custom'
  if (typeof value === 'object') {
    const amount = value.amount
    if (amount == null) return 'Custom'
    const currency = value.currency || 'INR'
    if (currency === 'INR') return fmtINR(amount)
    return `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
  }
  return fmtINR(value)
}
export const genRef = () =>
  'NXG-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 5).toUpperCase()

// Cheapest published per-unit price for a product — the listing's "from" price.
// Enterprise+ tiers with price:null are quote-only and never the "from" anchor.
export function fromPrice(p) {
  const priced = p.tiers.filter(t => {
    const price = t.price
    if (price == null) return false
    const amount = typeof price === 'object' ? price.amount : price
    return amount != null
  })
  return priced.length ? Math.min(...priced.map(t => {
    const price = t.price
    return typeof price === 'object' ? price.amount : price
  })) : null
}
