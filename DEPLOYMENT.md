# GoalCert Integration Hub — Deployment Guide (AWS-ready)

Four independently deployable services. The hub is the only thing a browser
talks to; it reverse-proxies the three platforms **server-to-server** with
keys injected server-side.

```
                        browser (users)
                              │  HTTPS, JWT
                              ▼
                 ┌─────────────────────────┐
                 │  GOALCERT HUB  (:8090)  │  hub/backend — FastAPI
                 │  auth · orgs · gateway  │  serves the built SPA (hub/web/dist)
                 └───┬───────┬────────┬────┘
        /api/twin/*  │       │        │  /api/agents/*  +  /api/agentbuilder/*
                     ▼       ▼        ▼
      NextXR Digital Twin  Simulation Engine  AUTOMIND Agentic AI
      (:8080, /api/v1)     (:8002, root paths) (:8001, /api/v1/agents + /api/v1/builder)
      needs Neo4j+Redis    SQLite/Postgres     needs Postgres (+Redis for Celery)
                              ▲                        ▲
                              └── /scenarios/author ───┘   (engine delegates NL
                                  server-to-server         authoring to AUTOMIND)
```

## The one rule

**After deploying the three platforms, edit exactly four values in the hub's
`hub/backend/.env` and restart it:**

| env var | set to | notes |
|---|---|---|
| `TWIN_BASE_URL` | twin service URL | keep `TWIN_PATH_PREFIX=/api/v1` |
| `SCENARIO_BASE_URL` | simulation engine URL | keep `SCENARIO_PATH_PREFIX=` **empty** |
| `AGENTS_BASE_URL` | automind URL | keep `AGENTS_PATH_PREFIX=/api/v1/agents` |
| `AGENTBUILDER_BASE_URL` | same automind URL | keep `AGENTBUILDER_PATH_PREFIX=/api/v1/builder` |

Nothing else changes — no frontend rebuild, no code edits. If a platform is
unreachable the hub returns 503 with `X-Gateway-Source: unavailable` and the
UI transparently falls back to its built-in simulator (SIM badge).

Cross-platform wiring (set once at deploy):
- **Simulation Engine** → `AGENTIC_AI_BASE_URL=<automind URL>` (NL authoring is
  delegated there) — see `backend/.env.example` in that repo.
- **AUTOMIND** → `TWIN_API_URL=<twin URL>/api/v1` (agents pull live twin context).

## Per-service deployment

### 1. Hub (`Goalcert_Hub/hub`)
```bash
cd hub/web && npm ci && npm run build       # produces hub/web/dist
cd ../backend && pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8090
```
- Serves the SPA itself when `hub/web/dist` exists → **one service, one origin,
  no CORS needed.** Put it behind an ALB/CloudFront with HTTPS.
- `.env` (from `.env.example`): set a real `JWT_SECRET`, the super-admin seed,
  one LLM key (any of `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY`
  — powers HiveMind), and the four platform URLs.
- DB: SQLite file by default; set `DATABASE_URL` for RDS Postgres.

### 2. NextXR Digital Twin (`Next XR/nextxr-ontology-v3`)
```bash
docker compose up -d            # Neo4j + Redis
cd nextxr-ontology && python -m server.main    # :8080, serves its own UI + /api/v1
```
- Degrades gracefully without Neo4j (reads return empty + `degraded:true`).
- Production auth: set `NXR_API_KEYS` (JSON list) on the twin and put one of
  those values in the hub's `TWIN_API_KEY`.

### 3. Simulation Engine (`simulation-engine-standalone/backend`)
```bash
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8002
```
- `.env` (from `.env.example`): set `SCENARIO_API_KEY` (mirror it into the
  hub's `SCENARIO_API_KEY`) and `AGENTIC_AI_BASE_URL`.
- SQLite by default; `GOALCERT_DATABASE_URL` for Postgres. Scenarios +
  AI-authored custom actions persist in the DB and reload on boot.

### 4. AUTOMIND Agentic AI (`goalcert-automind/backend`)
```bash
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8001
```
- Needs Postgres (`DATABASE_URL`). Redis only for the optional Celery worker.
- `.env`: `OPENAI_API_KEY` and/or `ANTHROPIC_API_KEY` (capabilities fall back
  to deterministic stubs without one — never hard-fails), `TWIN_API_URL`.
- Hub-facing surfaces (open by design — the hub authenticates its users and
  proxies server-side): `/api/v1/agents/*` (capabilities/run/chat/health) and
  `/api/v1/builder/*` (agent builder + team chat). The per-user `/api/*` API
  stays JWT-guarded. In production, restrict ingress to these services so only
  the hub can reach them (security-group / private subnet), or front them with
  an API key the hub sends via `AGENTS_API_KEY` / `AGENTBUILDER_API_KEY`.

## Health endpoints (what the hub probes)

| service | probe | expected |
|---|---|---|
| hub itself | `GET /api/hive/health` | `{status:"ok", llm_ready:…}` |
| twin | `GET /api/twin/health` → `/api/v1/health` | 200, `status: healthy\|degraded` |
| scenario | `GET /api/scenario/health` → `/health` | `{status:"ok"}` |
| agents | `GET /api/agents/health` → `/api/v1/agents/health` | `{status:"ok", capabilities:24}` |
| agentbuilder | `GET /api/agentbuilder/health` → `/api/v1/builder/health` | `{status:"ok"}` |

Health probes are allowed through the gateway without entitlement checks, so
the UI can show LIVE/SIM per service for every user.

## Local all-up smoke test

1. `docker compose up -d neo4j postgres redis` (repo root; Postgres is mapped
   to host **15432** to avoid clashing with a native install)
2. Start the four services as above (twin 8080, automind 8001, engine 8002,
   hub 8090), then open **http://localhost:8090**.
3. Log in as the seeded super admin, or drive the API:
   `POST /api/auth/login` → `GET /api/{twin,scenario,agents,agentbuilder}/health`
   — every response carries `X-Gateway-Source: live`.
