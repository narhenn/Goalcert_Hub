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

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
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
from deps import require_admin                  # noqa: E402

app = FastAPI(title="GoalCert Hub Backend", version="2.0.0")


@app.on_event("startup")
def _startup() -> None:
    init_db()
    seed_super_admin()
    seed_demo_orgs()


app.include_router(auth_routes.router)
app.include_router(admin_routes.router)
app.include_router(gateway.router)

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

class HiveBriefRequest(BaseModel):
    brief: str
    agents: list[str]                   # list of role keys to activate
    facility: Optional[str] = None
    domain: Optional[str] = None
    provider: str = "claude"


@app.post("/api/hive/brief")
async def run_full_brief(req: HiveBriefRequest):
    """Run multiple agents with coordination. Returns all deliverables."""
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
