# Simulation Engine — a Goalcert Hub service

Domain-agnostic scenario/simulation engine. **This is an internal service, not an
application.** It has no UI and no browser surface: the browser never calls it directly.

Its UI lives in the Hub as the Simulation module — `hub/web/src/modules/simulation`,
surfaced under **Train with AI**. (It used to serve a standalone HTML page at `/`; that
page is gone. `app/main.py` always described it as a placeholder for "the real UI ...
once the three repos are merged". They are merged.)

```
browser ──► Hub JWT ──► /api/scenario/*  ──►  hub/backend/gateway.py  ──►  this service
                        (authenticated,                                    (internal only,
                         entitlement-checked)                               never exposed)
```

## Running it

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate           # Windows;  source .venv/bin/activate elsewhere
pip install -r requirements.txt
uvicorn app.main:app --port 8002 --reload
```

Then point the Hub at it, in `hub/backend/.env`:

```ini
SCENARIO_BASE_URL=http://127.0.0.1:8002
SCENARIO_PATH_PREFIX=
```

> **`SCENARIO_PATH_PREFIX` must be empty.** This engine mounts its routers at the **root**
> (`/scenarios`, `/runs`, `/catalog`, `/dashboard`, `/health`) — there is no `/api` prefix on
> it. The gateway's default prefix is `/api`, which would rewrite `/api/scenario/runs/graph`
> into `GET {base}/api/runs/graph` and 404 every single call. This is the one piece of
> configuration that is easy to get wrong.

Local dev is three processes:

| # | what                         | where                                | port |
|---|------------------------------|--------------------------------------|------|
| 1 | this engine                  | `services/simulation-engine/backend` | 8002 |
| 2 | hub backend (auth + gateway) | `hub/backend`                        | 8090 |
| 3 | hub web (Vite)               | `hub/web` → `npm run dev`            | 5180 |

Open http://localhost:5180 → sign in → **Train with AI**.

## What it does

- **4 domains** registered (Aerospace, Railway, Hospital, Defence), each with its own
  actors / resources / actions / roles. **Only Railway is wired into the Hub UI today** —
  see `hub/web/src/modules/simulation/engine/domains.js`; adding another domain is one
  entry in that file.
- A **deterministic run loop**: fault injection → prevention checks → detection latency →
  decision-gate scoring against operator readiness → response → world-state mutation →
  KPIs → objective evaluation → a `ClearanceRecord` with an evidence chain.
- The **Dynamic Scenario Graph** (`POST /runs/graph`, `engine/graph.py`): one fault is
  expanded into the entire cause→consequence cascade its triggers actually fire. Nothing in
  the graph is hand-placed. Each edge carries `preventable` — true when that consequence
  only fired *because the operator failed to contain the fault*. That single flag is what
  the Hub's whole "preventable consequences" analysis is built on.

Nothing is hardcoded: raise operator readiness and the *same* scenario produces a shorter,
milder cascade, because the `containment_rate < 1` trigger stops firing.

Read `docs/ARCHITECTURE.md` for the v1 scope decision and what is real vs. deferred.

## API (all reached through the Hub gateway)

| method | path                        | purpose |
|--------|-----------------------------|---------|
| GET    | `/scenarios?domain=railway` | scenario library. Only `node_kind: "fault"` entries are launchable — the `consequence` ones are what the cascade *spawns*. |
| POST   | `/runs/graph`               | run a fault and expand its cascade → `RunGraph` (nodes, edges, per-node events, KPIs, totals) |
| GET    | `/runs/graph/{id}`          | re-fetch a previously computed graph |
| POST   | `/runs`                     | run a single scenario, no cascade |
| GET    | `/health`                   | liveness |

`config.difficulty` is an enum and is **capitalised** (`"Medium"`) — lowercase 422s.

> Run graphs are held **in memory** (`_GRAPHS` in `app/services/run_manager.py`) — deliberately;
> see the note there. They don't survive a restart, and there is no "list graphs" endpoint.
> So the Hub keeps only the *index* of run ids client-side and re-fetches each graph from
> `GET /runs/graph/{id}`. Since the engine is deterministic, re-running reproduces an
> identical graph anyway.

## Layout

```
backend/app/
  engine/          the domain-agnostic core (world, scenario, resolver, run loop, graph)
  plugins/         domain plugins: aerospace, railway, hospital, defence
  scenarios/       declarative scenario definitions + loader
  services/        run_manager, runner, twin_client, agent_client
  api/             REST endpoints (mounted at the ROOT — see the prefix warning above)
  ws/              live run streaming (stub)
  db/              persistence (scenarios + single runs; graphs are in-memory)
  reports/         generic + plugin-extended reporting
  core/            settings, auth
docs/
  ARCHITECTURE.md  v1 scope decision, what's real vs. deferred, Dynamic Scenario Graph
```

## Next real work

1. Persist run **graphs** (they're the one thing still in-memory) — needs a schema decision;
   the note in `run_manager.py` explains why it wasn't done blind.
2. Wire the remaining domains into the Hub UI (one entry each in `engine/domains.js`).
3. Wire `services/twin_client.py` / `agent_client.py` to the Hub's Twin and Agentic services.
