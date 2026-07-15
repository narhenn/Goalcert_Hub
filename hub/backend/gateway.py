"""
gateway.py — the secure server-side reverse proxy to the three platforms.

Design (production, AWS-ready):
  • The browser NEVER sees a service URL or key. It calls the hub with the user's
    JWT; the hub authenticates, authorises against org entitlements + persona policy,
    then forwards to the real service injecting a SERVER-SIDE credential.
  • Each service (Digital Twin, Scenario Engine, Agentic AI) is configured purely by
    env — drop in the URL + key you're given and the stub goes real, no code change.
  • If a service isn't configured or is unreachable, the hub replies 503 with
    `X-Gateway-Source: unavailable` so the frontend transparently falls back to its
    built-in simulator (the withFallback layer).

Env per service (TWIN / SCENARIO / AGENTS):
  {SVC}_BASE_URL     e.g. https://twin.internal.goalcert.io
  {SVC}_API_KEY      server-side credential, never exposed to the browser
  {SVC}_PATH_PREFIX  prepended after the /api/{svc} segment (default per service)
  {SVC}_KEY_HEADER   header to send the key in (default X-API-Key)
"""
from __future__ import annotations

import os

import httpx
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, Response, StreamingResponse

from deps import get_current_user
from models import DEFAULT_ENTITLEMENTS, DEFAULT_POLICY, User

# svc segment -> config + the entitlement module it maps to
SERVICES = {
    "twin": {
        "base": os.environ.get("TWIN_BASE_URL", ""),
        "key": os.environ.get("TWIN_API_KEY", ""),
        "prefix": os.environ.get("TWIN_PATH_PREFIX", "/api"),
        "header": os.environ.get("TWIN_KEY_HEADER", "X-API-Key"),
        "module": "twin",
    },
    "scenario": {
        "base": os.environ.get("SCENARIO_BASE_URL", ""),
        "key": os.environ.get("SCENARIO_API_KEY", ""),
        "prefix": os.environ.get("SCENARIO_PATH_PREFIX", ""),
        "header": os.environ.get("SCENARIO_KEY_HEADER", "X-API-Key"),
        "module": "scenario",
    },
    "agents": {
        "base": os.environ.get("AGENTS_BASE_URL", ""),
        "key": os.environ.get("AGENTS_API_KEY", ""),
        "prefix": os.environ.get("AGENTS_PATH_PREFIX", "/api"),
        "header": os.environ.get("AGENTS_KEY_HEADER", "X-API-Key"),
        "module": "agentic",
    },
    "agentbuilder": {
        "base": os.environ.get("AGENTBUILDER_BASE_URL", ""),
        "key": os.environ.get("AGENTBUILDER_API_KEY", ""),
        "prefix": os.environ.get("AGENTBUILDER_PATH_PREFIX", "/api"),
        "header": os.environ.get("AGENTBUILDER_KEY_HEADER", "X-API-Key"),
        "module": "agentbuilder",
    },
}

# headers we never forward upstream
_HOP_BY_HOP = {"host", "authorization", "content-length", "connection",
               "keep-alive", "proxy-authorization", "te", "trailer",
               "transfer-encoding", "upgrade"}

router = APIRouter(prefix="/api", tags=["gateway"])


def _entitled(user: User, module: str) -> bool:
    ent = (user.org.entitlements if user.org else DEFAULT_ENTITLEMENTS) or DEFAULT_ENTITLEMENTS
    if module not in ent:
        return False
    if user.role in ("super_admin", "admin"):
        return True
    policy = (user.org.policy if user.org else DEFAULT_POLICY) or DEFAULT_POLICY
    return module in policy.get(user.role, [])


def _unavailable(reason: str) -> JSONResponse:
    return JSONResponse(
        status_code=503,
        content={"gateway": "unavailable", "reason": reason},
        headers={"X-Gateway-Source": "unavailable"},
    )


async def _proxy(svc: str, path: str, request: Request, user: User):
    cfg = SERVICES[svc]

    # authorise against entitlements/policy (health probes are allowed through so
    # the frontend can detect live vs sim without tripping a 403)
    is_health = path.rstrip("/").endswith("health")
    if not is_health and not _entitled(user, cfg["module"]):
        return JSONResponse(status_code=403,
                            content={"detail": f"Your role/org is not entitled to {cfg['module']}"})

    if not cfg["base"]:
        return _unavailable(f"{svc} service not configured")

    # snapshot the identity we forward, so we don't touch the ORM during streaming
    upstream = cfg["base"].rstrip("/") + cfg["prefix"].rstrip("/") + "/" + path
    fwd_headers = {k: v for k, v in request.headers.items() if k.lower() not in _HOP_BY_HOP}
    if cfg["key"]:
        fwd_headers[cfg["header"]] = cfg["key"]
    # pass the end-user identity to the service (defence-in-depth; services may log/scope on it)
    fwd_headers["X-Goalcert-User"] = user.email
    fwd_headers["X-Goalcert-Role"] = user.role
    if user.org_id:
        fwd_headers["X-Goalcert-Org"] = user.org_id

    body = await request.body()
    query = request.url.query
    if query:
        upstream = f"{upstream}?{query}"

    # generous read timeout: agentic upstreams run LLM tool-loops that can take
    # a minute-plus; connect stays tight so a *down* service still 503s fast
    client = httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=30.0), verify=False)
    try:
        req = client.build_request(request.method, upstream, headers=fwd_headers, content=body)
        resp = await client.send(req, stream=True)
    except (httpx.ConnectError, httpx.ConnectTimeout, httpx.ReadTimeout):
        await client.aclose()
        return _unavailable(f"{svc} service unreachable")
    except Exception as e:  # noqa: BLE001
        await client.aclose()
        return _unavailable(f"{svc} proxy error: {e}")

    ctype = resp.headers.get("content-type", "")
    passthru = {k: v for k, v in resp.headers.items()
                if k.lower() not in ("content-length", "transfer-encoding", "connection")}
    passthru["X-Gateway-Source"] = "live"

    # stream SSE / event streams; buffer everything else
    if "text/event-stream" in ctype:
        async def gen():
            try:
                async for chunk in resp.aiter_raw():
                    yield chunk
            finally:
                await resp.aclose()
                await client.aclose()
        return StreamingResponse(gen(), status_code=resp.status_code,
                                 media_type="text/event-stream", headers=passthru)

    content = await resp.aread()
    await resp.aclose()
    await client.aclose()
    return Response(content=content, status_code=resp.status_code,
                    media_type=ctype or "application/octet-stream", headers=passthru)


def _register(svc: str) -> None:
    async def handler(path: str, request: Request, user: User = Depends(get_current_user), _svc=svc):
        return await _proxy(_svc, path, request, user)
    router.add_api_route(
        f"/{svc}/{{path:path}}", handler,
        methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        name=f"gateway_{svc}",
    )


for _svc in SERVICES:
    _register(_svc)


def gateway_status() -> dict:
    """Config snapshot for the admin observability panel (never returns keys)."""
    return {
        svc: {"configured": bool(cfg["base"]), "module": cfg["module"],
              "base": cfg["base"] or None, "hasKey": bool(cfg["key"])}
        for svc, cfg in SERVICES.items()
    }
