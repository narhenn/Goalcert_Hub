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
    # The guided Agent Builder (HiveMind's /api/v1/builder facade: templates, create,
    # tools, guardrails, test, deploy). The federated "Agent Builder" page drives this.
    #
    # module is "hivemind", NOT "agentbuilder": the builder is a HiveMind PAGE (nav id
    # hive-builder, module hivemind), not a separately-sold module. "agentbuilder" is in
    # neither DEFAULT_ENTITLEMENTS (models.py) nor MODULE_ORDER (registry.jsx), so it can
    # never be entitled — every call here 403'd "not entitled to agentbuilder" no matter
    # the user. Gating it on hivemind matches how the nav already groups it.
    "agentbuilder": {
        "base": os.environ.get("AGENTBUILDER_BASE_URL", ""),
        "key": os.environ.get("AGENTBUILDER_API_KEY", ""),
        "prefix": os.environ.get("AGENTBUILDER_PATH_PREFIX", "/api"),
        "header": os.environ.get("AGENTBUILDER_KEY_HEADER", "X-API-Key"),
        "module": "hivemind",
    },
    # HiveMind's per-user app API — what its federated UI calls.
    #
    # This is a DIFFERENT surface from the two facades above: `agents` and
    # `agentbuilder` are the auth-free hub facades (/api/v1/*) used by the hub's
    # native AI layer (the co-pilot buttons) and by other platforms. The federated
    # HiveMind pages drive the real, per-user, DB-backed API (/api/agents,
    # /api/dashboard, /api/executions, …), which authenticates via the
    # X-Goalcert-User identity this gateway injects.
    "hivemind": {
        "base": os.environ.get("HIVEMIND_BASE_URL", ""),
        "key": os.environ.get("HIVEMIND_API_KEY", ""),
        "prefix": os.environ.get("HIVEMIND_PATH_PREFIX", "/api"),
        "header": os.environ.get("HIVEMIND_KEY_HEADER", "X-API-Key"),
        "module": "hivemind",
    },
    # NOTE — there is deliberately NO "hive" service here.
    #
    # /api/hive/* is implemented by the HUB ITSELF (server.py: /api/hive/run, /brief,
    # /stream, /brand, /health — the AGENT_PROMPTS brief engine). A gateway entry for it
    # registered `/api/hive/{path:path}` at include time (line ~81 of server.py), which is
    # BEFORE those routes are defined (~line 279). FastAPI matches in registration order,
    # so the proxy shadowed the hub's own Hive completely and answered every call with
    # 503 "hive service not configured" — including /api/hive/health, which is what
    # services/integration.jsx probes as "Hub LLM Backend". That single shadow is why the
    # hub reported its LLM disconnected while holding a perfectly good key.
    #
    # If a standalone Hive service is ever split out, do NOT re-add it here as "hive" —
    # give it a distinct segment (e.g. "hiveremote") or move the hub's own routes above
    # the gateway include first.
}

# Headers we never forward upstream. `authorization` and `cookie` are stripped on
# purpose: the user's hub session (Bearer OR the HttpOnly gc_session cookie) must
# never leak to a platform — the gateway injects its own server-side key instead
# and passes identity via the X-Goalcert-* headers below.
_HOP_BY_HOP = {"host", "authorization", "cookie", "content-length", "connection",
               "keep-alive", "proxy-authorization", "te", "trailer",
               "transfer-encoding", "upgrade"}

# Headers the GATEWAY asserts and a client must never be able to supply.
#
# These are identity. Downstream services trust them precisely because they can only
# have come from here, after this gateway authenticated the session — the Scenario
# Engine scopes every scenario and run to X-Goalcert-Org (its core/tenancy.py), so a
# client that can set that header picks its own tenant and multi-tenancy is decoration.
#
# This is not hypothetical. `fwd_headers` starts as a copy of the CLIENT's headers, and
# X-Goalcert-Org was only overwritten `if user.org_id`. A super_admin has org_id NULL, so
# for that user the client's own header sailed straight through: sending
# `X-Goalcert-Org: <someone-else>` changed which tenant's runs the engine returned.
# Strip on the way IN, assert on the way OUT — an allow-list of one direction only.
_CLIENT_MUST_NOT_SEND = {
    "x-goalcert-org",
    "x-goalcert-user",
    "x-goalcert-role",
    # Downstream may provision a tenant row from this on first sighting, so a
    # client must not get to choose what that tenant ends up called.
    "x-goalcert-org-name",
}

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
    # Drop hop-by-hop headers, the identity headers only WE may assert, and the service
    # key header (a client must not be able to present its own key when we hold none).
    _drop = _HOP_BY_HOP | _CLIENT_MUST_NOT_SEND | {cfg["header"].lower()}
    fwd_headers = {k: v for k, v in request.headers.items() if k.lower() not in _drop}
    if cfg["key"]:
        fwd_headers[cfg["header"]] = cfg["key"]
    # The end-user identity, asserted from the authenticated session — services scope on
    # this (the Scenario Engine keys every scenario/run to the org).
    fwd_headers["X-Goalcert-User"] = user.email
    fwd_headers["X-Goalcert-Role"] = user.role
    if user.org_id:
        fwd_headers["X-Goalcert-Org"] = user.org_id
        # Display name, so a service provisioning this tenant for the first time
        # records something readable rather than a bare id. Read here alongside the
        # rest of the identity snapshot, never mid-stream.
        org_name = getattr(user.org, "name", None)
        if org_name:
            fwd_headers["X-Goalcert-Org-Name"] = org_name
    # No org (e.g. the platform owner) => send NO org header. Safe now that the inbound
    # one is stripped above: downstream reads "no tenant context" and shows only shared
    # data, rather than inheriting whatever the caller claimed.

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
