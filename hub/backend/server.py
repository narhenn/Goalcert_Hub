"""
server.py — Hub backend that handles real LLM agent calls.

Each HiveMind agent persona hits POST /api/hive/run with its role,
brief, and upstream context. The server calls Claude (Anthropic) or
Gemini (Google) and returns the structured deliverable.

Run: uvicorn server:app --port 8090
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Optional

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from pathlib import Path
try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent / ".env")
except ImportError:
    pass

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("hub-backend")

# ── Identity + gateway wiring (auth, orgs/users/roles, secure proxy) ──
from db import init_db                          # noqa: E402
from seed import seed_super_admin               # noqa: E402
from seed_clients import seed_demo_orgs          # noqa: E402
import auth_routes                              # noqa: E402
import admin_routes                             # noqa: E402
import gateway                                  # noqa: E402
import page_routes                              # noqa: E402
from deps import require_admin                  # noqa: E402

app = FastAPI(title="GoalCert Hub Backend", version="2.0.0")


@app.on_event("startup")
def _startup() -> None:
    init_db()
    seed_super_admin()
    seed_demo_orgs()


from session import COOKIE_CSRF, COOKIE_SESSION  # noqa: E402

# Requests that may mutate state and are authenticated by the COOKIE session get a
# double-submit CSRF check: the readable gc_csrf cookie must match the X-CSRF-Token
# header. Requests authenticated by an `Authorization: Bearer` header instead are
# inherently CSRF-safe (a cross-site page cannot set a custom header), so they skip
# it — that keeps curl / server-to-server clients working.
_CSRF_EXEMPT = {"/api/auth/login"}
_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


@app.middleware("http")
async def csrf_guard(request: Request, call_next):
    path = request.url.path
    if (path.startswith("/api/")
            and request.method not in _SAFE_METHODS
            and path not in _CSRF_EXEMPT
            and request.cookies.get(COOKIE_SESSION)):
        sent = request.headers.get("X-CSRF-Token")
        expected = request.cookies.get(COOKIE_CSRF)
        if not sent or not expected or sent != expected:
            return JSONResponse(status_code=403,
                                content={"detail": "CSRF token missing or invalid"})
    return await call_next(request)


# ── Content-Security-Policy ─────────────────────────────────────────
#
# The hub is a Module-Federation HOST: it fetches remoteEntry.js and a stylesheet from each
# platform's own origin at runtime, and those remotes then call back for their chunks and
# .glb assets. A default CSP blocks all of that, so the policy MUST name the remote origins
# — and it must be derived from the SAME env that configures the remotes, or the two drift
# and federation dies silently in production while working locally.
#
# REMOTE_ORIGINS is a comma-separated list of ORIGINS (scheme://host), e.g.
#   REMOTE_ORIGINS=https://d111.cloudfront.net,https://twin.example.com
# Leave it unset locally: no CSP header is sent and nothing changes.
#
# 'unsafe-inline' for style-src is required — the remotes' 3-D views and the hub's own
# panels set inline styles. script-src does NOT include 'unsafe-inline'.
_REMOTE_ORIGINS = [o.strip().rstrip("/") for o in os.environ.get("REMOTE_ORIGINS", "").split(",") if o.strip()]


@app.middleware("http")
async def security_headers(request: Request, call_next):
    resp = await call_next(request)
    if _REMOTE_ORIGINS:
        remotes = " ".join(_REMOTE_ORIGINS)
        resp.headers.setdefault("Content-Security-Policy", "; ".join([
            "default-src 'self'",
            f"script-src 'self' {remotes}",
            f"style-src 'self' 'unsafe-inline' {remotes} https://fonts.googleapis.com https://cdn.jsdelivr.net",
            "font-src 'self' data: https://fonts.gstatic.com https://cdn.jsdelivr.net",
            f"img-src 'self' data: blob: {remotes}",
            # connect-src: remote chunk fetches + the hub's own /api. blob:/data: keep the
            # GLB loaders working (three.js parses model buffers via blob URLs).
            f"connect-src 'self' blob: data: {remotes}",
            f"worker-src 'self' blob:",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "object-src 'none'",
        ]))
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    resp.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    return resp


app.include_router(auth_routes.router)
app.include_router(admin_routes.router)
app.include_router(gateway.router)
app.include_router(page_routes.router)  # page-oriented BFF contract (/api/pages/*)

# ── Web search tool (DuckDuckGo, no API key needed) ────────────────

def web_search(query: str, max_results: int = 5) -> str:
    """Search the web for real-time data. Returns markdown-formatted results."""
    try:
        import httpx
        from urllib.parse import quote_plus
        import re as _re
        url = f"https://html.duckduckgo.com/html/?q={quote_plus(query)}"
        resp = httpx.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=8, verify=False, follow_redirects=True)
        html = resp.text
        # extract result snippets
        results = []
        for match in _re.finditer(r'class="result__a"[^>]*>(.*?)</a>.*?class="result__snippet"[^>]*>(.*?)</span>', html, _re.DOTALL):
            title = _re.sub(r'<[^>]+>', '', match.group(1)).strip()
            snippet = _re.sub(r'<[^>]+>', '', match.group(2)).strip()
            if title and snippet:
                results.append(f"- **{title}**: {snippet}")
            if len(results) >= max_results:
                break
        return "\n".join(results) if results else "No results found."
    except Exception as e:
        logger.warning("web_search failed: %s", e)
        return f"Web search unavailable: {e}"
# CORS — locked down in production. Set CORS_ORIGINS to a comma-separated allowlist
# (e.g. https://hub.goalcert.io). Defaults to the local dev frontend.
_origins = os.environ.get("CORS_ORIGINS", "http://localhost:5180,http://localhost:5173,http://127.0.0.1:5180")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins.split(",") if o.strip()],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/admin/platform")
def platform_status(_=Depends(require_admin)):
    """Gateway/service configuration for the admin observability panel (no secrets)."""
    return {"services": gateway.gateway_status()}

# ── LLM clients (lazy init) ────────────────────────────────────────

_anthropic_client = None
_gemini_model = None


def get_anthropic():
    global _anthropic_client
    if _anthropic_client is None:
        import anthropic
        _anthropic_client = anthropic.Anthropic(api_key=os.environ.get("ANTHROPIC_API_KEY", ""))
    return _anthropic_client


def get_gemini():
    global _gemini_model
    if _gemini_model is None:
        import google.generativeai as genai
        genai.configure(api_key=os.environ.get("GEMINI_API_KEY", ""))
        _gemini_model = genai.GenerativeModel("gemini-2.0-flash")
    return _gemini_model


# Placeholder values from .env templates must not count as "configured".
_PLACEHOLDERS = {"", "sk-ant-...", "AIza...", "sk-...", "sk-proj-..."}


def _key(name: str) -> str:
    v = os.environ.get(name, "").strip()
    return "" if v in _PLACEHOLDERS else v


def openai_complete(system_prompt: str, user_msg: str, max_tokens: int = 2000) -> tuple[str, int]:
    """OpenAI chat completion via plain httpx — no SDK dependency needed."""
    import httpx
    resp = httpx.post(
        "https://api.openai.com/v1/chat/completions",
        headers={"Authorization": f"Bearer {_key('OPENAI_API_KEY')}"},
        json={
            "model": os.environ.get("OPENAI_MODEL", "gpt-4o-mini"),
            "max_tokens": max_tokens,
            "messages": [{"role": "system", "content": system_prompt},
                         {"role": "user", "content": user_msg}],
        },
        timeout=90,
    )
    resp.raise_for_status()
    data = resp.json()
    text = (data["choices"][0]["message"]["content"] or "").strip()
    usage = data.get("usage", {})
    return text, (usage.get("prompt_tokens", 0) + usage.get("completion_tokens", 0))


# ── Agent system prompts (the real reasoning layer) ────────────────

AGENT_PROMPTS = {
    "ceo": (
        "You are Elena Voss, the CEO. You receive outputs from all specialist agents "
        "(strategy, finance, risk, marketing, sales) and synthesize them into a single "
        "executive brief. Your output must include:\n"
        "1. A 3-sentence strategic position summary\n"
        "2. Key financial outlook (1 paragraph)\n"
        "3. Sales pipeline status (1 paragraph)\n"
        "4. Marketing readiness (1 paragraph)\n"
        "5. TOP 3 decisions requiring sign-off, each with a clear recommendation\n"
        "Be decisive. Use specific numbers from the agent outputs. No fluff."
    ),
    "strategy": (
        "You are Daniel Mensah, Chief Strategy Officer. Given a business brief, produce:\n"
        "1. Market sizing (TAM/SAM/SOM with numbers)\n"
        "2. Competitive landscape table (us vs 3-4 competitors, 5 capabilities)\n"
        "3. SWOT analysis (1 bullet each)\n"
        "4. Three strategic options ranked by risk/reward\n"
        "5. Recommended execution roadmap (3 phases)\n"
        "Use real market data where possible. Be specific, not generic."
    ),
    "finance_analysis": (
        "You are Sophia Chen, Finance Manager — Analysis. Given a business brief, produce:\n"
        "1. P&L projection table (next 4 quarters: revenue, COGS, gross margin, OpEx, EBITDA)\n"
        "2. Unit economics (ACV, CAC, LTV/CAC ratio, payback period)\n"
        "3. ROI calculation for the customer with assumptions\n"
        "4. Sensitivity analysis (best/base/worst case)\n"
        "5. One-paragraph CFO-ready summary\n"
        "Use realistic numbers. Show your assumptions."
    ),
    "finance_risk": (
        "You are James Okoye, Finance Manager — Risk. Given a business brief and financial analysis, produce:\n"
        "1. Risk register table: top 5 financial risks with probability, impact, score, mitigation\n"
        "2. Cash flow stress test (what happens if revenue slips 30%/50%)\n"
        "3. Compliance checklist (relevant regulations for the industry)\n"
        "4. Audit readiness score (0-100) with gap list\n"
        "Be thorough and cautious. Flag risks others would miss."
    ),
    "marketing_campaign": (
        "You are Aisha Rahman, Marketing Lead — Campaigns. Given a brief and market research, produce:\n"
        "1. Target audience definition (demographics, psychographics, pain points)\n"
        "2. Messaging framework (hook, pain, proof, CTA)\n"
        "3. 4-week content calendar table (week, content type, channel, KPI target)\n"
        "4. Channel mix with budget allocation\n"
        "5. Expected pipeline generation and cost per lead\n"
        "Be creative but data-informed. Include specific budget numbers."
    ),
    "market_research": (
        "You are Maya Petrov, Marketing Lead — Research. Given a brief, produce:\n"
        "1. Market size and growth rate with sources\n"
        "2. Competitor matrix table (5 vendors, 5 capabilities, rated Yes/Partial/No)\n"
        "3. Three buyer personas (name, title, age, budget, pain points)\n"
        "4. Trend signals (3 things happening in this market right now)\n"
        "5. Three actionable insights (specific, not generic)\n"
        "Use real company names and real market data where possible."
    ),
    "sales_pipeline": (
        "You are Raj Kapoor, Sales Lead — Pipeline. Given a brief, produce:\n"
        "1. Pipeline summary (weighted and unweighted total, avg deal size, win rate)\n"
        "2. Stage breakdown table (stage, deal count, value, weighted value)\n"
        "3. Top 5 deals ranked by close probability (company, value, stage, probability, champion)\n"
        "4. At-risk deals with reasons and recommended actions\n"
        "5. This week's priority actions (3 specific things)\n"
        "Use realistic deal names relevant to the industry in the brief."
    ),
    "sales_client": (
        "You are Nina Torres, Sales Lead — Client Relations. Given a brief, produce:\n"
        "1. Executive summary (3 sentences, why the client should buy)\n"
        "2. Solution overview (what we deliver, mapped to their pain points)\n"
        "3. Pricing table (3 tiers: Starter, Professional, Enterprise)\n"
        "4. Implementation timeline (phases with durations)\n"
        "5. ROI projection (specific numbers based on their industry)\n"
        "6. Next steps (3 clear actions)\n"
        "Write in proposal language — persuasive but honest. No hype."
    ),
}


# ── Request / Response models ──────────────────────────────────────

class AgentRunRequest(BaseModel):
    role: str                           # agent role key from AGENT_PROMPTS
    brief: str                          # user's brief text
    upstream_context: Optional[str] = None  # outputs from upstream agents
    facility: Optional[str] = None      # company/facility name
    domain: Optional[str] = None        # industry vertical
    provider: str = "claude"            # "claude" or "gemini"
    twin_context: Optional[str] = None  # live digital twin telemetry


class AgentRunResponse(BaseModel):
    role: str
    title: str
    content: str
    provider: str
    tokens_used: int = 0


# ── The agent execution endpoint ──────────────────────────────────

@app.post("/api/hive/run", response_model=AgentRunResponse)
async def run_agent(req: AgentRunRequest):
    """Run a single HiveMind agent with real LLM reasoning."""
    system_prompt = AGENT_PROMPTS.get(req.role)
    if not system_prompt:
        raise HTTPException(400, f"Unknown agent role: {req.role}")

    # Build the user message
    user_msg = f"BRIEF: {req.brief}"
    if req.facility:
        user_msg += f"\nCOMPANY: {req.facility}"
    if req.domain:
        user_msg += f"\nINDUSTRY: {req.domain}"
    if req.twin_context:
        user_msg += f"\n\nLIVE DIGITAL TWIN DATA:\n{req.twin_context}"
    if req.upstream_context:
        user_msg += f"\n\nCONTEXT FROM OTHER AGENTS:\n{req.upstream_context}"
    # For research roles, do a live web search and inject results
    if req.role in ("market_research", "strategy", "sales_pipeline"):
        search_query = f"{req.domain} {req.brief[:80]} market 2026"
        search_results = web_search(search_query, max_results=5)
        if search_results and "unavailable" not in search_results:
            user_msg += f"\n\nLIVE WEB SEARCH RESULTS (use these for current data):\n{search_results}"

    user_msg += "\n\nProduce your deliverable now. Use markdown formatting. Be specific with numbers."

    tokens = 0
    content = ""

    # Provider chain: the requested provider first, then whatever has a key —
    # Claude → OpenAI → Gemini. The hub works with ANY one of the three keys.
    if req.provider == "gemini" and _key("GEMINI_API_KEY"):
        try:
            model = get_gemini()
            resp = model.generate_content(
                f"SYSTEM: {system_prompt}\n\nUSER: {user_msg}",
                generation_config={"max_output_tokens": 2000, "temperature": 0.7},
            )
            content = resp.text or ""
            tokens = resp.usage_metadata.total_token_count if hasattr(resp, 'usage_metadata') else 0
            req.provider = "gemini"
            logger.info("gemini: %s produced %d chars", req.role, len(content))
        except Exception as e:
            logger.warning("gemini failed for %s: %s — trying the next provider", req.role, e)

    if not content and _key("ANTHROPIC_API_KEY"):
        try:
            client = get_anthropic()
            resp = client.messages.create(
                model=os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-6"),
                max_tokens=2000,
                system=[{"type": "text", "text": system_prompt,
                         "cache_control": {"type": "ephemeral"}}],
                messages=[{"role": "user", "content": user_msg}],
            )
            content = "".join(b.text for b in resp.content if b.type == "text")
            tokens = (resp.usage.input_tokens or 0) + (resp.usage.output_tokens or 0)
            req.provider = "claude"
            logger.info("claude: %s produced %d chars, %d tokens", req.role, len(content), tokens)
        except Exception as e:
            logger.warning("claude failed for %s: %s — trying the next provider", req.role, e)

    if not content and _key("OPENAI_API_KEY"):
        try:
            content, tokens = openai_complete(system_prompt, user_msg)
            req.provider = "openai"
            logger.info("openai: %s produced %d chars, %d tokens", req.role, len(content), tokens)
        except Exception as e:
            logger.error("openai failed for %s: %s", req.role, e)

    if not content:
        raise HTTPException(
            500, "No LLM provider available — set ANTHROPIC_API_KEY, OPENAI_API_KEY "
                 "or GEMINI_API_KEY in hub/backend/.env")

    # Derive title from role
    titles = {
        "ceo": "Executive Brief", "strategy": "Strategy Report",
        "finance_analysis": "Financial Analysis", "finance_risk": "Risk Assessment",
        "marketing_campaign": "Campaign Plan", "market_research": "Market Research",
        "sales_pipeline": "Pipeline Report", "sales_client": "Client Proposal",
    }

    return AgentRunResponse(
        role=req.role,
        title=titles.get(req.role, f"{req.role} Output"),
        content=content.strip(),
        provider=req.provider,
        tokens_used=tokens,
    )


# ── Run all agents for a full brief (coordination on server) ──────

class HiveCompany(BaseModel):
    name: Optional[str] = None
    industry: Optional[str] = None
    description: Optional[str] = None


class HiveBriefRequest(BaseModel):
    brief: str
    agents: list[str]                   # list of role keys to activate
    facility: Optional[str] = None
    domain: Optional[str] = None
    provider: str = "claude"
    # The federated Hive page posts {brief, company:{name,industry}, agents:[...]}
    # rather than facility/domain. Accept both and normalise in `_facility`/`_domain`.
    company: Optional[HiveCompany] = None

    def _facility(self) -> Optional[str]:
        return self.facility or (self.company.name if self.company else None)

    def _domain(self) -> Optional[str]:
        return self.domain or (self.company.industry if self.company else None)


# Display metadata for the roles in AGENT_PROMPTS.
#
# The engine only needs a role KEY, but the Hive page renders a card per specialist and
# needs a name/tagline/initials/colour to do it. Keeping this beside AGENT_PROMPTS (rather
# than in the UI) means the roster has ONE source of truth: add a prompt + an entry here
# and the agent appears in the picker with no frontend change.
AGENT_META = {
    "market_research":   ("Maya",  "Market Research",   "#2563eb", ["Curious", "Data-led"],   ["web_search", "draft_document"]),
    "strategy":          ("Sana",  "Strategy",          "#7c3aed", ["Structured", "Decisive"], ["draft_document"]),
    "finance_analysis":  ("Farid", "Financial Analysis", "#0d9488", ["Precise", "Sceptical"],  ["calculate", "create_spreadsheet"]),
    "finance_risk":      ("Rhea",  "Risk & Compliance", "#e11d48", ["Cautious", "Thorough"],  ["calculate", "draft_document"]),
    "marketing_campaign": ("Milo", "Campaign Planning", "#d97706", ["Creative", "Punchy"],    ["draft_document", "create_email_sequence"]),
    "sales_pipeline":    ("Priya", "Pipeline & Forecast", "#16a34a", ["Numeric", "Direct"],   ["score_lead", "create_spreadsheet"]),
    "sales_client":      ("Cai",   "Client Proposals",  "#0891b2", ["Persuasive", "Warm"],    ["draft_document", "create_contact"]),
    "ceo":               ("Elena", "Executive Synthesis", "#312e81", ["Big-picture", "Blunt"], ["draft_document"]),
}


def _initials(name: str) -> str:
    parts = [p for p in name.split() if p]
    return ("".join(p[0] for p in parts[:2]) or name[:2]).upper()


@app.get("/api/hive/agents")
def hive_agents():
    """The Hive roster, in the shape the Hive page renders.

    The page needs this to show ANY specialists at all — without it the roster is empty
    and "Run the Hive" stays disabled, which is exactly what the federated Hive page did:
    it was asking HiveMind's per-user agent list (a different product surface, empty for a
    new user) because the hub exposed no roster of its own.
    """
    out = []
    for role, (name, tagline, color, traits, tools) in AGENT_META.items():
        if role not in AGENT_PROMPTS:
            continue
        out.append({
            "id": role, "name": name, "tagline": tagline, "initials": _initials(name),
            "color": color, "traits": list(traits), "tools": list(tools),
        })
    return {"agents": out}


@app.post("/api/hive/brief")
async def run_full_brief(req: HiveBriefRequest):
    """Run multiple agents with coordination, STREAMED as SSE.

    Emits the event vocabulary the Hive page consumes:
      agent_start {agent_id} → text {agent_id,text} → agent_done {agent_id,tokens,model}
      … then brief_done {total_tokens,cost}

    The three-phase coordination below is the point and is preserved: independents first,
    then the agents that need their output as upstream context, then the CEO synthesising
    everything. Streaming just reports each phase as it lands instead of making the
    operator stare at a spinner until all of it finishes.

    NOTE run_single() returns each agent's deliverable whole (the engine does not token-
    stream), so `text` arrives as one event per agent rather than character-by-character.
    The page appends it either way.
    """
    import asyncio
    import json as _json

    from fastapi.responses import StreamingResponse

    roles = [r for r in req.agents if r in AGENT_PROMPTS]
    facility, domain = req._facility(), req._domain()

    async def sse():
        results: dict[str, dict] = {}
        context_parts: list[str] = []
        total_tokens = 0

        async def phase(names: list[str], upstream: str | None):
            nonlocal total_tokens
            names = [n for n in names if n in roles]
            if not names:
                return
            for n in names:
                yield f"data: {_json.dumps({'type': 'agent_start', 'agent_id': n})}\n\n"
            done = await asyncio.gather(
                *[run_single(n, req.brief, upstream, facility, domain, req.provider) for n in names],
                return_exceptions=True,
            )
            for n, r in zip(names, done):
                if isinstance(r, Exception) or not isinstance(r, dict):
                    yield f"data: {_json.dumps({'type': 'agent_error', 'agent_id': n, 'message': str(r)})}\n\n"
                    continue
                results[n] = r
                context_parts.append(f"[{r.get('title', n)}]\n{(r.get('content') or '')[:800]}")
                total_tokens += r.get("tokens_used", 0) or 0
                yield f"data: {_json.dumps({'type': 'text', 'agent_id': n, 'text': r.get('content', '')})}\n\n"
                yield f"data: {_json.dumps({'type': 'agent_done', 'agent_id': n, 'tokens': r.get('tokens_used', 0), 'model': r.get('provider', '')})}\n\n"

        try:
            # Phase 1 — independents.
            async for ev in phase(["market_research", "finance_analysis", "sales_pipeline"], None):
                yield ev
            # Phase 2 — needs phase 1 as upstream context.
            async for ev in phase(["strategy", "finance_risk", "marketing_campaign", "sales_client"],
                                  "\n\n".join(context_parts)):
                yield ev
            # Phase 3 — the CEO synthesises everything above.
            async for ev in phase(["ceo"], "\n\n".join(context_parts)):
                yield ev
        except Exception as exc:  # noqa: BLE001
            logger.exception("hive brief failed")
            yield f"data: {_json.dumps({'type': 'agent_error', 'message': str(exc)})}\n\n"

        yield f"data: {_json.dumps({'type': 'brief_done', 'total_tokens': total_tokens, 'cost': round(total_tokens * 3e-6, 4)})}\n\n"

    return StreamingResponse(sse(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.post("/api/hive/brief-sync")
async def run_full_brief_sync(req: HiveBriefRequest):
    """The original non-streaming brief. Kept because /api/hive/brief changed shape to
    SSE for the Hive page; anything wanting one JSON blob should call this."""
    import asyncio

    results = {}
    context_parts = []

    # Phase 1: independent agents (no upstream deps)
    phase1 = [r for r in req.agents if r in ("market_research", "finance_analysis", "sales_pipeline")]
    phase1_tasks = []
    for role in phase1:
        if role in AGENT_PROMPTS:
            phase1_tasks.append(run_single(role, req.brief, None, req.facility, req.domain, req.provider))

    if phase1_tasks:
        phase1_results = await asyncio.gather(*phase1_tasks, return_exceptions=True)
        for r in phase1_results:
            if isinstance(r, dict):
                results[r["role"]] = r
                context_parts.append(f"[{r['title']}]\n{r['content'][:800]}")

    # Phase 2: agents that need phase 1 outputs
    upstream = "\n\n".join(context_parts)
    phase2 = [r for r in req.agents if r in ("strategy", "finance_risk", "marketing_campaign", "sales_client")]
    phase2_tasks = []
    for role in phase2:
        if role in AGENT_PROMPTS:
            phase2_tasks.append(run_single(role, req.brief, upstream, req.facility, req.domain, req.provider))

    if phase2_tasks:
        phase2_results = await asyncio.gather(*phase2_tasks, return_exceptions=True)
        for r in phase2_results:
            if isinstance(r, dict):
                results[r["role"]] = r
                context_parts.append(f"[{r['title']}]\n{r['content'][:800]}")

    # Phase 3: CEO synthesizes everything
    if "ceo" in req.agents or "elena" in req.agents:
        all_context = "\n\n".join(context_parts)
        ceo_result = await run_single("ceo", req.brief, all_context, req.facility, req.domain, req.provider)
        if isinstance(ceo_result, dict):
            results["ceo"] = ceo_result

    total_tokens = sum(r.get("tokens_used", 0) for r in results.values())
    return {
        "brief": req.brief,
        "agents_run": list(results.keys()),
        "deliverables": results,
        "total_tokens": total_tokens,
    }


async def run_single(role, brief, upstream, facility, domain, provider):
    """Run a single agent — async wrapper."""
    try:
        req = AgentRunRequest(
            role=role, brief=brief, upstream_context=upstream,
            facility=facility, domain=domain, provider=provider,
        )
        resp = await run_agent(req)
        return resp.model_dump()
    except Exception as e:
        logger.warning("agent %s failed: %s", role, e)
        return {"role": role, "title": f"{role} (failed)", "content": str(e), "provider": "error", "tokens_used": 0}


# ── Health ────────────────────────────────────────────────────────

# ── SSE streaming agent endpoint ───────────────────────────────────

@app.post("/api/hive/stream")
async def stream_agent(req: AgentRunRequest):
    """Run a single agent with SSE streaming — output appears character by character."""
    system_prompt = AGENT_PROMPTS.get(req.role)
    if not system_prompt:
        raise HTTPException(400, f"Unknown agent role: {req.role}")

    user_msg = f"BRIEF: {req.brief}"
    if req.facility:
        user_msg += f"\nCOMPANY: {req.facility}"
    if req.domain:
        user_msg += f"\nINDUSTRY: {req.domain}"
    if req.twin_context:
        user_msg += f"\n\nLIVE DIGITAL TWIN DATA:\n{req.twin_context}"
    if req.upstream_context:
        user_msg += f"\n\nCONTEXT FROM OTHER AGENTS:\n{req.upstream_context}"

    # Web search for research agents
    if req.role in ("market_research", "strategy", "sales_pipeline"):
        search_query = f"{req.domain} {req.brief[:80]} market 2026"
        search_results = web_search(search_query, max_results=5)
        if search_results and "unavailable" not in search_results:
            user_msg += f"\n\nLIVE WEB SEARCH RESULTS:\n{search_results}"

    user_msg += "\n\nProduce your deliverable now. Use markdown formatting. Be specific with numbers."

    titles = {
        "ceo": "Executive Brief", "strategy": "Strategy Report",
        "finance_analysis": "Financial Analysis", "finance_risk": "Risk Assessment",
        "marketing_campaign": "Campaign Plan", "market_research": "Market Research",
        "sales_pipeline": "Pipeline Report", "sales_client": "Client Proposal",
    }
    title = titles.get(req.role, f"{req.role} Output")

    async def event_stream():
        import json as _json
        # Send metadata first
        yield f"data: {_json.dumps({'type': 'meta', 'role': req.role, 'title': title, 'status': 'thinking'})}\n\n"

        # Send narration events
        narrations = {
            "market_research": ["Scanning web for market data...", "Analyzing competitor landscape...", "Building buyer personas...", "Calculating TAM/SAM..."],
            "strategy": ["Evaluating strategic options...", "Building SWOT matrix...", "Ranking growth vectors...", "Drafting execution roadmap..."],
            "finance_analysis": ["Projecting P&L...", "Computing unit economics...", "Running sensitivity analysis...", "Preparing CFO summary..."],
            "finance_risk": ["Building risk register...", "Stress-testing cash flow...", "Checking compliance gaps...", "Scoring audit readiness..."],
            "marketing_campaign": ["Defining target audience...", "Crafting messaging framework...", "Building content calendar...", "Allocating channel budget..."],
            "sales_pipeline": ["Scoring active deals...", "Computing weighted forecast...", "Flagging at-risk deals...", "Prioritizing weekly actions..."],
            "sales_client": ["Drafting executive summary...", "Mapping solution to pain points...", "Building pricing table...", "Projecting client ROI..."],
            "ceo": ["Synthesizing all agent outputs...", "Identifying decision points...", "Ranking strategic priorities...", "Drafting executive recommendation..."],
        }
        for narr in narrations.get(req.role, ["Processing..."]):
            yield f"data: {_json.dumps({'type': 'narration', 'text': narr})}\n\n"
            import asyncio
            await asyncio.sleep(0.3)

        yield f"data: {_json.dumps({'type': 'meta', 'status': 'streaming'})}\n\n"

        # Stream from Claude when we have its key; otherwise OpenAI (chunked).
        try:
            if _key("ANTHROPIC_API_KEY"):
                client = get_anthropic()
                total_tokens = 0
                with client.messages.stream(
                    model=os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-6"),
                    max_tokens=2000,
                    system=[{"type": "text", "text": system_prompt,
                             "cache_control": {"type": "ephemeral"}}],
                    messages=[{"role": "user", "content": user_msg}],
                ) as stream:
                    for text in stream.text_stream:
                        yield f"data: {_json.dumps({'type': 'delta', 'text': text})}\n\n"
                    response = stream.get_final_message()
                    total_tokens = (response.usage.input_tokens or 0) + (response.usage.output_tokens or 0)
                yield f"data: {_json.dumps({'type': 'done', 'tokens': total_tokens, 'provider': 'claude'})}\n\n"
            elif _key("OPENAI_API_KEY"):
                content, total_tokens = await asyncio.to_thread(
                    openai_complete, system_prompt, user_msg)
                for i in range(0, len(content), 120):
                    yield f"data: {_json.dumps({'type': 'delta', 'text': content[i:i+120]})}\n\n"
                    await asyncio.sleep(0.02)
                yield f"data: {_json.dumps({'type': 'done', 'tokens': total_tokens, 'provider': 'openai'})}\n\n"
            else:
                yield f"data: {_json.dumps({'type': 'error', 'message': 'No LLM API key configured on the hub.'})}\n\n"
        except Exception as e:
            yield f"data: {_json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream",
                            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ── Brand memory (persistent company context) ─────────────────────

_brand_memory: dict[str, dict] = {}

class BrandMemory(BaseModel):
    facility: str
    industry: str
    description: str = ""
    tone: str = "professional"
    key_products: list[str] = []
    target_markets: list[str] = []
    competitors: list[str] = []
    values: list[str] = []

@app.post("/api/hive/brand")
async def save_brand(brand: BrandMemory):
    """Save brand memory — agents recall this in every brief."""
    _brand_memory[brand.facility] = brand.model_dump()
    logger.info("brand: saved memory for %s", brand.facility)
    return {"saved": True, "facility": brand.facility}

@app.get("/api/hive/brand/{facility}")
async def get_brand(facility: str):
    """Recall saved brand memory for a facility."""
    mem = _brand_memory.get(facility)
    if not mem:
        return {"found": False}
    return {"found": True, **mem}


@app.get("/api/hive/health")
def health():
    return {
        "status": "ok",
        "claude": {"available": bool(_key("ANTHROPIC_API_KEY")),
                   "model": os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-6")},
        "openai": {"available": bool(_key("OPENAI_API_KEY")),
                   "model": os.environ.get("OPENAI_MODEL", "gpt-4o-mini")},
        "gemini": {"available": bool(_key("GEMINI_API_KEY"))},
        "llm_ready": any(_key(k) for k in ("ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY")),
        "agents": list(AGENT_PROMPTS.keys()),
    }


# ── Health (load balancer target) ───────────────────────────────────
#
# MUST be declared BEFORE the SPA catch-all below, and must be able to FAIL.
#
# Before this existed, /health and /healthz fell through to the catch-all and returned
# index.html with a 200 — for any path, under any condition. An ALB/ECS health check
# pointed there could never go unhealthy: the task could have lost its database entirely
# and still reported "healthy" forever, so ECS would never replace it. A health check that
# cannot fail is worse than no health check, because it buys false confidence.
#
# So this actually touches the DB. 200 = this task can serve real traffic; 503 = replace it.
@app.get("/api/health", include_in_schema=True)
def api_health():
    from sqlalchemy import text as _text

    from db import SessionLocal

    db_ok, db_err = True, None
    try:
        s = SessionLocal()
        try:
            s.execute(_text("SELECT 1"))
        finally:
            s.close()
    except Exception as exc:  # noqa: BLE001
        db_ok, db_err = False, str(exc)[:200]

    body = {
        "status": "ok" if db_ok else "degraded",
        "service": "goalcert-hub",
        "db": {"ok": db_ok, **({"error": db_err} if db_err else {})},
        # Informational only — a missing LLM key must NOT fail the health check, or one
        # expired key would roll the whole fleet.
        "llm": {"anthropic": bool(_key("ANTHROPIC_API_KEY")), "openai": bool(_key("OPENAI_API_KEY"))},
        # Which upstreams this task believes it can reach (config only, not a live probe —
        # health must not fan out to four services on every ALB check).
        "gateway": gateway.gateway_status(),
    }
    return JSONResponse(status_code=200 if db_ok else 503, content=body)


# ── Serve the built SPA (single-origin production deploy) ───────────
# `npm run build` in hub/web produces hub/web/dist; when it exists the hub
# backend serves it, so ONE service (this one) is the whole deployable unit:
# same origin for the app and /api/* — no CORS, no separate static host needed.

_DIST = Path(__file__).resolve().parent.parent / "web" / "dist"

if _DIST.exists():
    from fastapi.responses import FileResponse
    from fastapi.staticfiles import StaticFiles

    app.mount("/assets", StaticFiles(directory=_DIST / "assets"), name="spa-assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        # /api/* is handled by the routers above; an unknown /api path is a real
        # 404, never the SPA shell. Anything else falls through to index.html.
        if full_path.startswith("api/"):
            raise HTTPException(404, "Unknown API route")
        target = _DIST / full_path
        if full_path and target.is_file():
            return FileResponse(target)
        return FileResponse(_DIST / "index.html")
