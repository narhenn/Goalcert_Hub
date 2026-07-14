// engine.js — the coordination engine that runs the hive brief.
//
// Prem's 8 agents: 2 Finance, 2 Marketing, 1 CEO, 1 Chief Strategy, 2 Sales.
// Coordination graph:
//   maya (research) → aisha (campaigns) + daniel (strategy)
//   sophia (finance analysis) runs in parallel
//   james (risk) waits for sophia
//   raj (pipeline) + nina (proposals) run in parallel
//   elena (CEO) receives ALL outputs and synthesizes the executive brief
//
// Falls back to rich local stubs when the agentic backend is unreachable.

import { PERSONA_MAP, triggersFor } from './personas.js'

const AGENTIC_BASE = '/api/agents'

// ── Brief presets ─────────────────────────────────────────────────────
export const BRIEF_PRESETS = [
  {
    id: 'full-suite',
    label: 'Full Business Review',
    icon: 'ti-crown',
    hint: 'All 8 agents',
    description: 'Market research, strategy, financials, risk, campaigns, pipeline, proposals — CEO synthesis.',
  },
  {
    id: 'strategy',
    label: 'Strategy Brief',
    icon: 'ti-chart-arrows',
    hint: 'Research + Strategy + Finance + CEO',
    description: 'Market landscape, competitive positioning, financial viability, strategic recommendation.',
  },
  {
    id: 'sales',
    label: 'Sales Package',
    icon: 'ti-chart-bar',
    hint: 'Research + Pipeline + Proposals + CEO',
    description: 'Market context, pipeline health, client proposal draft, executive summary.',
  },
  {
    id: 'marketing',
    label: 'Campaign Launch',
    icon: 'ti-speakerphone',
    hint: 'Research + Campaigns + CEO',
    description: 'Market trends, audience insights, campaign plan with content calendar.',
  },
]

// ── Stub deliverables (production-grade fallbacks) ─────────────────────

// vertical-aware case study & reference data for stub deliverables
const VERTICAL_REF = {
  aerospace:  { casestudy: 'Collins Aerospace', deal: 'Collins Aerospace (expand)', sector: 'aerospace MRO' },
  railway:    { casestudy: 'SMRT Corporation', deal: 'SMRT Corporation (expand)', sector: 'rail transit' },
  ev:         { casestudy: 'Charge+', deal: 'Charge+ Network (expand)', sector: 'EV charging' },
  hospital:   { casestudy: 'SingHealth', deal: 'SingHealth (expand)', sector: 'healthcare' },
  defence:    { casestudy: 'ST Engineering', deal: 'ST Engineering (expand)', sector: 'defence' },
}
function verticalRef(context) { return VERTICAL_REF[context.vertical] || VERTICAL_REF.aerospace }

function stubFor(persona, brief, context) {
  const ts = new Date().toISOString().slice(0, 10)
  const company = context.facility || 'GoalCert'
  const industry = context.domain || 'enterprise technology'
  const vRef = verticalRef(context)

  switch (persona.role) {
    case 'ceo':
      return {
        type: 'executive_brief',
        title: `Executive Brief — ${company}`,
        content: `**EXECUTIVE SUMMARY — ${ts}**\n\n` +
          `Based on inputs from all specialist agents, here is the synthesized position:\n\n` +
          `**Strategic Position:** The ${industry} market presents a strong growth opportunity. ` +
          `Our competitive analysis shows clear differentiation on 4 of 6 evaluated capabilities.\n\n` +
          `**Financial Outlook:** Projected ROI of 3.2x within 18 months. Cash runway adequate for ` +
          `proposed initiatives. Key financial risk: customer concentration in top 3 accounts.\n\n` +
          `**Sales Pipeline:** Weighted pipeline at $2.4M with 68% close probability on top 5 deals. ` +
          `Two deals require executive sponsor engagement this week.\n\n` +
          `**Marketing:** Campaign plan targets 40% increase in qualified leads over 8 weeks. ` +
          `Content calendar ready for approval.\n\n` +
          `**DECISION REQUIRED:**\n` +
          `1. Approve Q3 campaign budget ($85K) — recommended\n` +
          `2. Approve enterprise pricing tier — requires board alignment\n` +
          `3. Proceed with partnership evaluation — schedule by ${ts}`,
      }
    case 'strategy':
      return {
        type: 'strategy_report',
        title: `Strategy Report — ${industry}`,
        content: `**STRATEGIC ANALYSIS**\n\n` +
          `**Market Sizing:**\n- TAM: $12.4B (2026)\n- SAM: $3.1B (addressable segments)\n- SOM: $180M (realistic 18-month target)\n\n` +
          `**Competitive Landscape:**\n` +
          `| Capability | Us | Competitor A | Competitor B |\n` +
          `|---|---|---|---|\n` +
          `| Core platform | Strong | Strong | Partial |\n` +
          `| AI/Agentic | Strong | Weak | None |\n` +
          `| Training sim | Strong | None | Partial |\n` +
          `| Multi-vertical | Strong | Partial | Single |\n\n` +
          `**SWOT Summary:**\n` +
          `- Strength: Unique 4-product integration no competitor matches\n` +
          `- Weakness: Small team, limited enterprise references\n` +
          `- Opportunity: 68% CAGR in healthcare digital twin, defence modernization budgets\n` +
          `- Threat: Siemens/PTC may acquire capabilities via M&A\n\n` +
          `**Recommended Strategy:** Land-and-expand via Railway + Hospital verticals (shortest sales cycles, government funding available). ` +
          `Defer Defence until security certifications complete.`,
      }
    case 'finance_analysis':
      return {
        type: 'financial_analysis',
        title: `Financial Analysis — ${company}`,
        content: `**P&L PROJECTION (Next 12 Months)**\n\n` +
          `| Line Item | Q3 | Q4 | Q1 | Q2 | Total |\n` +
          `|---|---|---|---|---|---|\n` +
          `| Revenue | $120K | $185K | $280K | $420K | $1,005K |\n` +
          `| COGS | $36K | $52K | $78K | $115K | $281K |\n` +
          `| Gross Margin | 70% | 72% | 72% | 73% | 72% |\n` +
          `| OpEx | $95K | $98K | $105K | $110K | $408K |\n` +
          `| EBITDA | -$11K | $35K | $97K | $195K | $316K |\n\n` +
          `**Unit Economics:**\n` +
          `- ACV: $48K (average contract value)\n` +
          `- CAC: $12K (customer acquisition cost)\n` +
          `- LTV/CAC: 4.0x (healthy)\n` +
          `- Payback: 3 months\n\n` +
          `**ROI for Customer:**\n` +
          `- Deployment cost: $85K (year 1)\n` +
          `- Estimated savings: $270K (reduced downtime + training efficiency)\n` +
          `- ROI: 3.2x in 18 months`,
      }
    case 'finance_risk':
      return {
        type: 'risk_assessment',
        title: `Risk Assessment — ${company}`,
        content: `**FINANCIAL RISK REGISTER**\n\n` +
          `| # | Risk | Probability | Impact | Score | Mitigation |\n` +
          `|---|---|---|---|---|---|\n` +
          `| 1 | Customer concentration (top 3 = 72% revenue) | High | Critical | 16 | Diversify pipeline across 5+ verticals |\n` +
          `| 2 | Cash runway if Q3 targets miss by >30% | Medium | High | 12 | Maintain 6-month reserve, defer non-critical hires |\n` +
          `| 3 | Currency exposure (AUD/SGD/USD) | Medium | Medium | 9 | Invoice in local currency, hedge >$100K contracts |\n` +
          `| 4 | Compliance gap for Defence vertical (ITAR) | Low | Critical | 8 | Begin certification process Q3, budget $25K |\n` +
          `| 5 | Key-person risk (Tejesh = sole twin engineer) | High | High | 15 | Document architecture, cross-train Nuvaan |\n\n` +
          `**Audit Readiness Score:** 72/100 — needs improvement on documentation and SOC2 compliance.\n\n` +
          `**Cash Flow Forecast:** Positive from Q4 under base case. Stress test (50% revenue slip): runway extends to May 2027 with current burn.`,
      }
    case 'marketing_campaign':
      return {
        type: 'campaign_plan',
        title: `Campaign Plan — ${industry}`,
        content: `**CAMPAIGN: "${company} for ${industry}" Launch**\n\n` +
          `**Target Audience:** VP Operations / CTO at mid-large enterprises in ${industry}\n` +
          `**Channels:** LinkedIn Ads + Webinar + Case Study + Direct Outreach\n\n` +
          `**Messaging Framework:**\n` +
          `- Hook: "The only platform that combines digital twin + AI agents + training + drones"\n` +
          `- Pain: "Your operators learn from mistakes. Ours learn from simulations."\n` +
          `- Proof: ${vRef.casestudy} case study (3 products integrated, 51 AI agents)\n` +
          `- CTA: "Book a 30-minute platform walkthrough"\n\n` +
          `**Content Calendar (4 weeks):**\n` +
          `| Week | Content | Channel | KPI |\n` +
          `|---|---|---|---|\n` +
          `| W1 | Launch blog + LinkedIn carousel | Organic + Paid | 500 impressions |\n` +
          `| W2 | 45-min webinar "Future of Industrial AI" | Webinar + Email | 80 registrations |\n` +
          `| W3 | Case study: ${vRef.casestudy} | Email + LinkedIn | 25 downloads |\n` +
          `| W4 | Direct outreach (top 50 targets) | Email + LinkedIn DM | 10 meetings |\n\n` +
          `**Budget:** $12K total · **Expected Pipeline:** $480K`,
      }
    case 'market_research':
      return {
        type: 'market_research',
        title: `Market Research — ${industry}`,
        content: `**MARKET LANDSCAPE**\n\n` +
          `**Market Size:** $50B digital twin market (2026), growing 20%+ CAGR\n` +
          `**Fastest Growth:** Healthcare (68% CAGR), Defence ($7B by 2030)\n\n` +
          `**Competitor Matrix:**\n` +
          `| Vendor | Twin | AI | Training | Drones | Verdict |\n` +
          `|---|---|---|---|---|---|\n` +
          `| Siemens | Yes | Partial | No | No | Strong twin, weak AI |\n` +
          `| Palantir | No | Yes | No | No | Data only, no physics |\n` +
          `| Anduril | No | Yes | No | Partial | Defence-only |\n` +
          `| PTC | Yes | No | No | No | PLM-focused |\n` +
          `| **GoalCert** | **Yes** | **Yes** | **Yes** | **Yes** | **Only full stack** |\n\n` +
          `**Buyer Personas:**\n` +
          `1. VP Operations (30-45, owns downtime KPI, budget $200K-$2M)\n` +
          `2. CTO (40-55, digital transformation mandate, board-level visibility)\n` +
          `3. Chief Safety Officer (training compliance, regulatory pressure)\n\n` +
          `**3 Actionable Insights:**\n` +
          `1. Hospital vertical has no credible competitor — first-mover advantage is real\n` +
          `2. Railway buyers (LTA Singapore, Network Rail UK) have active tenders for digital twin\n` +
          `3. Defence requires ITAR/CMMC certification — start early, 9-month process`,
      }
    case 'sales_pipeline':
      return {
        type: 'pipeline_report',
        title: `Pipeline Report — ${ts}`,
        content: `**SALES PIPELINE SUMMARY**\n\n` +
          `**Weighted Pipeline:** $2.4M\n` +
          `**Unweighted Pipeline:** $4.1M\n` +
          `**Avg Deal Size:** $68K ACV\n` +
          `**Win Rate (trailing 90d):** 34%\n\n` +
          `**Stage Breakdown:**\n` +
          `| Stage | Deals | Value | Weighted |\n` +
          `|---|---|---|---|\n` +
          `| Discovery | 12 | $1.2M | $120K |\n` +
          `| Evaluation | 8 | $980K | $294K |\n` +
          `| Proposal | 5 | $1.1M | $660K |\n` +
          `| Negotiation | 3 | $820K | $656K |\n` +
          `| Closed Won (MTD) | 2 | $136K | $136K |\n\n` +
          `**Top 5 Deals:**\n` +
          `1. ST Engineering — $180K — Proposal stage — 65% — Champion: VP Eng\n` +
          `2. SingHealth — $120K — Evaluation — 55% — Champion: CIO\n` +
          `3. LTA Singapore — $250K — Discovery — 30% — No champion yet (risk)\n` +
          `4. ${vRef.deal} — $95K — Negotiation — 80%\n` +
          `5. Changi Airport Group — $175K — Discovery — 25%\n\n` +
          `**At-Risk Deals:** LTA (no champion), Changi (competitor shortlisted)\n` +
          `**Action This Week:** Get exec sponsor meeting for LTA, send ${vRef.casestudy} case study to Changi`,
      }
    case 'sales_client':
      return {
        type: 'sales_proposal',
        title: `Client Proposal Draft`,
        content: `**PROPOSAL: GoalCert Digital Twin Platform**\n\n` +
          `**Prepared for:** [Client Name] · [Date]\n\n` +
          `**Executive Summary:**\n` +
          `GoalCert delivers the only platform combining physics-based digital twins, ` +
          `agentic AI, simulation-based training, and drone operations in a single composable suite. ` +
          `Your operators train on real scenarios. Your AI agents diagnose and act. Your compliance ` +
          `is auditable in one click.\n\n` +
          `**Solution Overview:**\n` +
          `- NextXR Digital Twin — live physics model of your facility\n` +
          `- AUTOMIND Agentic AI — 8 specialist agents that do real work\n` +
          `- GoalCert Simulation — training from real incidents\n` +
          `- DroneForce — automated inspection and delivery\n\n` +
          `**Pricing:**\n` +
          `| Tier | Annual | Includes |\n` +
          `|---|---|---|\n` +
          `| Starter | $48K | Twin + 1 vertical |\n` +
          `| Professional | $96K | Twin + AI + 3 verticals |\n` +
          `| Enterprise | $180K | Full suite + DroneForce + dedicated support |\n\n` +
          `**Implementation:** 4 weeks to first live twin. Full deployment in 12 weeks.\n\n` +
          `**ROI Projection:** 3.2x return in 18 months based on ${vRef.casestudy} benchmark.\n\n` +
          `**Next Steps:**\n` +
          `1. 30-minute technical walkthrough\n` +
          `2. 2-week pilot on your facility\n` +
          `3. Go-live with first vertical`,
      }
    default:
      return { type: 'text', title: `${persona.title} Output`, content: `Analysis complete for: ${brief}` }
  }
}

// ── Coordination engine ──────────────────────────────────────────────

export async function runHiveBrief({ brief, agentIds, context, onAgentStart, onAgentDone, onAgentNarration, onAgentDelta }) {
  const results = {}
  const pending = new Set(agentIds)
  const running = new Set()

  function canRun(id) {
    const persona = PERSONA_MAP[id]
    if (!persona) return false
    // check if all agents this one needs have finished
    // needs are role-based, not id-based — find which agent fills each needed role
    for (const need of (persona.needs || [])) {
      if (need === 'brief' || need === 'industry' || need === 'market_data' ||
          need === 'revenue_data' || need === 'cost_data' || need === 'deal_data' ||
          need === 'client_info' || need === 'domain') continue
      // check if any finished agent produced this role's output
      const producer = agentIds.find(aid => PERSONA_MAP[aid]?.role === need)
      if (producer && !results[producer]) return false
    }
    return true
  }

  async function runAgent(id) {
    const persona = PERSONA_MAP[id]
    if (!persona) return
    running.add(id)
    if (onAgentStart) onAgentStart(id)

    // Build upstream context from finished agents
    const upstreamParts = Object.entries(results)
      .map(([aid, d]) => `[${PERSONA_MAP[aid]?.title || aid}]\n${(d.content || '').slice(0, 800)}`)
    const upstreamContext = upstreamParts.length > 0 ? upstreamParts.join('\n\n') : null

    // Build twin context string if present
    let twinContext = null
    if (context.diagnostics && Object.keys(context.diagnostics).length > 0) {
      const tw = context.diagnostics
      const parts = []
      if (tw.health != null) parts.push(`Health: ${Math.round(tw.health * 100)}%`)
      if (tw.latest && Object.keys(tw.latest).length > 0) {
        parts.push(`Sensor readings: ${Object.entries(tw.latest).slice(0, 8).map(([k, v]) => `${k}=${typeof v === 'number' ? v.toFixed(2) : v}`).join(', ')}`)
      }
      if (tw.findings && tw.findings.length > 0) {
        parts.push(`Active faults (${tw.findings.length}): ${tw.findings.slice(0, 3).map(f => f.displayName || f.id || f).join(', ')}`)
      }
      if (parts.length > 0) twinContext = parts.join('\n')
    }

    // try SSE streaming first, then regular API, then stub
    let deliverable
    try {
      // SSE streaming — output appears live
      const resp = await fetch('/api/hive/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: persona.role,
          brief,
          upstream_context: upstreamContext,
          facility: context.facility || null,
          domain: context.domain || null,
          provider: context.provider || 'claude',
          twin_context: twinContext,
        }),
      })
      if (resp.ok && resp.headers.get('content-type')?.includes('text/event-stream')) {
        // parse SSE stream
        const reader = resp.body.getReader()
        const decoder = new TextDecoder()
        let content = ''
        let tokens = 0
        let title = persona.deliverable.label
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() // keep incomplete line

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const evt = JSON.parse(line.slice(6))
              if (evt.type === 'meta') {
                if (evt.title) title = evt.title
              } else if (evt.type === 'narration') {
                if (onAgentNarration) onAgentNarration(id, evt.text)
              } else if (evt.type === 'delta') {
                content += evt.text
                if (onAgentDelta) onAgentDelta(id, content)
              } else if (evt.type === 'done') {
                tokens = evt.tokens || 0
              } else if (evt.type === 'error') {
                throw new Error(evt.message)
              }
            } catch (parseErr) {
              if (parseErr.message && !parseErr.message.includes('JSON')) throw parseErr
            }
          }
        }
        if (content) {
          deliverable = {
            type: persona.deliverable.type,
            title,
            content,
            provider: 'claude',
            tokens,
            live: true,
          }
        }
      }
    } catch {
      // SSE failed — try regular API
      try {
        const resp = await fetch('/api/hive/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role: persona.role, brief,
            upstream_context: upstreamContext,
            facility: context.facility || null,
            domain: context.domain || null,
            provider: context.provider || 'claude',
            twin_context: twinContext,
          }),
          signal: AbortSignal.timeout(30000),
        })
        if (resp.ok) {
          const data = await resp.json()
          deliverable = {
            type: persona.deliverable.type,
            title: data.title || persona.deliverable.label,
            content: data.content || '',
            provider: data.provider || 'claude',
            tokens: data.tokens_used || 0,
            live: true,
          }
        }
      } catch { /* fall through to stub */ }
    }

    if (!deliverable) {
      // stub mode — simulate thinking time
      await new Promise(r => setTimeout(r, 1500 + Math.random() * 2500))
      const stub = stubFor(persona, brief, context)
      deliverable = { ...stub, provider: 'stub', live: false }
    }

    results[id] = deliverable
    pending.delete(id)
    running.delete(id)
    if (onAgentDone) onAgentDone(id, deliverable)

    // trigger downstream agents
    const downstream = (persona.triggers || []).filter(tid => agentIds.includes(tid) && pending.has(tid))
    await Promise.all(downstream.map(tid => canRun(tid) ? runAgent(tid) : Promise.resolve()))
  }

  // find agents with no blocking dependencies — they run first
  const starters = agentIds.filter(id => {
    // CEO runs last (receives all outputs)
    if (PERSONA_MAP[id]?.role === 'ceo') return false
    return canRun(id)
  })

  // run starters in parallel
  await Promise.all(starters.map(id => runAgent(id)))

  // run any remaining agents (including CEO which waits for all others)
  while (pending.size > 0) {
    const ready = [...pending].filter(id => canRun(id))
    if (ready.length === 0) {
      // force-run remaining to avoid deadlock
      const forced = [...pending]
      await Promise.all(forced.map(id => runAgent(id)))
      break
    }
    await Promise.all(ready.map(id => runAgent(id)))
  }

  return results
}
