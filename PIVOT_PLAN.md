# Pivot: Goalcert Hub → native micro-frontend composition (one source of truth per platform)

## Context — why we're doing this

Today we maintain the **same UI twice**: each platform (Digital Twin / NextXR, Scenario / Sim engine, Agentic / AutoMind) has its own frontend, and the hub has hand-ported *copies* of those same pages under `hub/web/src/modules/` (~17k lines: `modules/twin` ~5k, `modules/simulation` ~3k, `modules/hivemind` ~3.4k, `modules/agentbuilder` ~2.7k). Every platform change has to be re-ported into the hub, and the ports drift → recurring runtime bugs (the jitter, the "twin is not defined" crash, context-split breakage — all from maintaining a second copy).

**Goal:** the hub becomes a **native composition shell**. The *actual* pages that already live in each platform are rendered **natively inside the hub** (not iframes — the user explicitly rejected iframes as "not native"), with **one login through the hub**, **all data flowing through the hub gateway**, and a combined **"Workforce Intelligence"** workspace that fuses features from all three platforms. Users can also **open any platform standalone** (deep-link to its separate deployment). When a platform ships an update, the hub reflects it **without re-porting**.

Two hard facts the exploration surfaced that shape everything:
- **Scenario has no real frontend** — only a single static HTML placeholder the repo itself labels "not the real hub UI." Decision (user): **build a real Scenario frontend first**, then integrate it like the others.
- **Agentic is partly page-less** — AutoMind has real pages (Agent Builder, Executions, Templates…) *and* cross-cutting **action buttons** (AI drawer, co-pilot dock, one-tap actions, "Repair with AI" takeover). Pages get federated; the action layer stays a hub-native overlay wired to agent APIs.
- NextXR's current Docker/Render image **ships backend-only** (its React `dist/` isn't copied) — must be fixed before its UI can be served/federated.
- React versions diverge: hub **18**, NextXR **18**, AutoMind **19**. Federation needs a single shared React → version alignment is a prerequisite.

Target deployment is **AWS** (moving off Render).

---

## Composition mechanism — decision

**Recommended: Module Federation (Vite `@originjs/vite-plugin-federation`).** Each platform *exposes* its page components as remote modules; the hub is the **host shell** that mounts them natively under its own nav, injecting shared singletons (React, router, design tokens, auth context, API client). Because remotes load at runtime from a URL (`remoteEntry.js`), **updating a platform re-publishes its remote and the hub picks it up with no hub code change** — exactly the "update the twin, hub reflects it, without touching it" requirement, and it renders in the hub's own DOM so it feels native (no iframe).

- **Data through the hub:** federated pages call a **shared API client** (injected by the host) that hits the hub's own origin `/api/*`, which the gateway proxies to the platform backend with server-side keys + entitlement checks. The platform's page never talks to its backend directly.
- **Native look:** a shared **design-tokens package** (`@goalcert/ui-tokens`) gives federated pages the hub's theme/spacing/typography, so they visually belong.

**Alternative considered (fallback):** monorepo **shared component packages** (npm workspaces) — pages extracted to `@goalcert/twin-ui` etc., imported by both the platform app and the hub. Same single-source benefit, simpler and no runtime version-singleton risk, **but** propagating a platform update needs a hub rebuild (a CI trigger can make that automatic). If the React-alignment spike (Phase 0) shows federation is too costly across 18/19, fall back to this.

---

## Target architecture

```
                       ┌──────────────────────────────────────────────┐
   Browser  ───────────▶  HUB SHELL  (single origin, one login/JWT)     │
                       │   • nav skeleton + persona/entitlement gating   │
                       │   • Workforce Intelligence (combined) surface   │
                       │   • agentic action layer (drawer/dock/takeover) │
                       │   • shared: React, design tokens, API client    │
                       │                                                 │
                       │   mounts remotes natively (Module Federation):  │
                       │     twinRemote/*     ◀── NextXR remoteEntry.js   │
                       │     scenarioRemote/* ◀── Sim (new) remoteEntry   │
                       │     agenticRemote/*  ◀── AutoMind remoteEntry    │
                       └───────────────┬─────────────────────────────────┘
                                       │  all data calls → hub origin /api/*
                                       ▼
                       ┌──────────────────────────────────────────────┐
                       │  HUB GATEWAY (existing gateway.py, wildcard    │
                       │  /api/{twin|scenario|agents|agentbuilder}/*)   │
                       │  injects server-side keys, enforces org        │
                       │  entitlement + persona policy, forwards        │
                       │  X-Goalcert-User/Role/Org                      │
                       └───────┬───────────┬───────────┬────────────────┘
                               ▼           ▼           ▼
                          NextXR API   Sim API    AutoMind API
                        (twin backend) (scenario) (agentic backend)

  "Open standalone" → deep-links to the separately deployed platform app
                       (own subdomain), SSO-handoff so no second login.
```

Keep: the hub's **auth/entitlement/persona** layer (`hub/backend/*`, `hub/web/src/hub/*`) and the **wildcard gateway** (`hub/backend/gateway.py`) — both are already exactly the substrate this needs. Retire: the ported `hub/web/src/modules/{twin,simulation,scenario,hivemind,agentbuilder}` once each platform's real pages are federated in.

---

## Part A — The hub skeleton (build this FIRST)

The skeleton = the navigation bar (pages) + the action buttons on each page (each needs an API). Build it as a **hollow but complete shell**: every nav route exists and renders a placeholder "slot" where a federated remote (or hub-native surface) will mount; every button is wired to a **page-level hub API** (stubbed to 501 until the platform is integrated). API principle: **one primary load-endpoint per page** + explicit action endpoints per button (not the current sprawl of ~30 granular twin calls).

Legend for **Source**: `native` = built in the hub; `fed:X` = federated from platform X; `build→fed` = must be built then federated.

### A1. Hub Core (native, always present)
| Nav page | Source | Buttons / actions → API |
|---|---|---|
| Home / **Workforce Intelligence** | native | load combined KPIs `GET /api/hub/overview`; jump-to-platform; "Ask AI" → agentic drawer |
| Loop Board | native | `GET/POST /api/hub/loop` (7-stage event bus) |
| Audit | native | `GET /api/hub/audit`, export `GET /api/hub/audit/export` |
| Compliance | native | `GET /api/hub/compliance` |
| Admin Console (org/policy) | native (admin) | `GET/PATCH /api/admin/orgs/{id}` (entitlements, persona policy) |
| User Management | native (admin) | `GET/POST/PATCH /api/admin/users`, reset pw |
| Super Admin Console | native (super_admin) | orgs+admins+entitlements CRUD |
| Settings / Account | native | `GET /api/auth/me`, change password, theme, **mode toggle: combined ↔ standalone** |

### A2. Digital Twin (fed:twin — has real pages)
| Nav page | Source | Buttons / actions → API (page-level) |
|---|---|---|
| Twins Library | fed:twin | load `GET /api/twin/page/twins`; **Create twin**, **Open**, **Delete**, **Build a Twin →** |
| Live Dashboard | fed:twin | load `GET /api/twin/page/dashboard?tenant=`; **Start/Stop feed**, **Simulate fault**, **Run toggle**, subscribe SSE `/api/twin/bus/stream`; machine + facility + per-domain views (railway/hospital/EV/defence) |
| Build a Twin | fed:twin | **Upload plan/photo** → async `POST /api/twin/build/start` + poll `/status/{id}`; **Pick domain** → `POST /api/twin/twins` |
| Prediction | fed:twin | **Run forecast/RUL** `POST /api/twin/predict`; diagnostics |
| Twin Health / Topology / Assets | fed:twin (sub-pages) | `GET /api/twin/page/health`, topology, `GET /api/twin/assets/{id}/ar-overlay` |

### A3. Scenario Engine (build→fed — no real frontend yet; build it, then federate)
Build a real React+Vite Scenario frontend (spec mirrors the hub's existing `modules/simulation` panes, which already define the right surfaces).
| Nav page | Source | Buttons / actions → API |
|---|---|---|
| Scenario Browser | build→fed | load `GET /api/scenario/page/catalog` (domains/assets/techniques/roles); **Filter by domain** |
| Scenario Builder / Author | build→fed | **Author from NL** `POST /api/scenario/sim/author`; pick domain; save |
| Run / Cascade | build→fed | **Run** `POST /api/scenario/sim/run-graph`; cascade DAG, event timeline, **Interventions**, **Safeguards**, **Tripwire**; SSE run events |
| History / Runs | build→fed | `GET /api/scenario/page/runs`, run detail, **Compare runs** |
| Reports | build→fed | `GET /api/scenario/page/report/{run}`, **Export** |

### A4. Agentic AI (fed:agentic pages + native action layer)
| Nav page | Source | Buttons / actions → API |
|---|---|---|
| Agents / Templates | fed:agentic | load `GET /api/agents/page/list`; **New agent**, **Use template** |
| Agent Builder (workflow) | fed:agentic | 6-stage wizard; **Generate prompt**, **Upload knowledge**, **Set tools/guardrails**, **Test/Eval**, **Deploy** → `/api/agentbuilder/*` |
| Executions | fed:agentic | `GET /api/agents/page/executions`, execution detail |
| Integrations / Analytics / Reports | fed:agentic | `GET /api/agents/page/{integrations|analytics|reports}` |
| Team Chat / Hive Mind | fed:agentic (or native) | multi-agent SSE `/api/agentbuilder/agents/{id}/chat` |
| **Agentic action layer** (overlay, not a nav page) | **native** | topbar **AI drawer**, always-on **co-pilot dock**, **one-tap actions**, **"Repair with AI" takeover** → `POST /api/agents/run`, `/chat`, `/generate` |

### A5. Persona workspaces (native — cross-platform composition)
Frontline (Assigned to me, Flow), Supervisor, COO (Ops Readiness), L&D (Content Studio). These *aggregate* across platforms and stay hub-native, each backed by one page-load endpoint (e.g. `GET /api/hub/frontline`), calling agent/twin/scenario APIs underneath.

### A6. Mode toggle & entitlement gating
- **Workforce Intelligence (combined)** is the default; **Open standalone** deep-links to the platform's own deployment with an SSO handoff (no second login).
- Reuse existing `navFor(enabled)` / `useEntitlements().has(id)` / persona `allows()` so nav entries and remotes only mount for entitled orgs/personas.

---

## Part B — Per-platform integration (after skeleton exists)

### B0. Prerequisites (Phase 0)
1. **React-alignment spike** — pick one React (recommend align all three to **18**, or **19** if AutoMind's react-router v7 / `@xyflow/react` can't downgrade cheaply; a 1–2 day spike decides). Federation requires a shared React singleton.
2. **`@goalcert/ui-tokens`** shared design-system package (CSS vars/theme) consumed by hub + all remotes → native look.
3. **Shared API client package** (`@goalcert/api`) injected via federation `shared`, always calling hub-origin `/api/*`.
4. **SSO/session**: add a **cookie-based session** on the hub origin (today it's Bearer-in-localStorage; the gateway strips inbound `Authorization`). Same-origin cookie makes federated remotes + standalone handoff both authenticate cleanly. Standalone deep-links carry a **short-lived signed handoff token** the platform validates.

### B1. Digital Twin (NextXR) — first, it already has pages
- Fix the **Docker/Render→AWS build to include `frontend/dist`** (or expose remote build) — currently omitted.
- Add `@originjs/vite-plugin-federation` to NextXR; **expose** its page components (`panels/*`: Dashboard, BuildTwin, Twins, Predict, domain dashboards, 3-D viewer).
- Set NextXR API client to the injected shared client (it already uses relative `/api/v1` → maps to hub `/api/twin/*`).
- Hub: replace the `route==='twins'|'dashboard'|'build'|'predict'` branches in `hub/web/src/App.jsx` (lines ~318–368) with **mounts of the twin remote**; delete `hub/web/src/modules/twin/**` and the `three`/`@react-three`/`pdfjs` deps (they exist only for the port).
- Consolidate the ~30 granular `API.twin.*` calls into the **page-load endpoints** in A2.

### B2. Scenario (Sim) — build the frontend, then federate
- **Build** a real React+Vite Scenario SPA (delete dependence on the static HTML). Use the hub's `modules/simulation` panes (`BuilderPane`/`CascadePane`/`HistoryPane`/`ReportsPane`, `engine/*`) as the functional spec — port them **into the new Scenario app** as its canonical source (so they live in ONE place going forward).
- Add `SCENARIO_API_KEY` handling, `$PORT`, and a deploy artifact (the standalone repo has no Dockerfile/render.yaml today).
- Expose federation remotes; hub mounts `route==='scenario'` (and new browser/run/history/reports routes) from the scenario remote; delete `hub/web/src/modules/{simulation,scenario}`.

### B3. Agentic (AutoMind) — pages + action layer
- Add federation; **expose** page components (Dashboard, Templates, WorkflowBuilder, Executions, Integrations, Analytics, Reports).
- **Reconcile the login wall:** AutoMind does its own JWT login + hard `window.location='/login'` on 401. When federated, disable its standalone auth path and consume the **hub session/token**; the hub gateway already carries identity. (For standalone mode, accept the hub handoff token.)
- Keep the **agentic action layer hub-native** (drawer/dock/takeover) — it's cross-cutting overlay, not a page; wire its buttons to `/api/agents/*` and `/api/agentbuilder/*`.
- Delete `hub/web/src/modules/{agentbuilder,hivemind,agentic}` once federated equivalents are mounted.

---

## Part C — AWS deployment (replaces Render)

Design for **single origin** so federation + same-origin data + cookie SSO all work:

- **CloudFront (one distribution, the app domain)** with path-based behaviors:
  - `/` and hub assets → **S3** (hub shell static build)
  - `/remotes/twin/*`, `/remotes/scenario/*`, `/remotes/agentic/*` → **S3/CloudFront** hosting each platform's `remoteEntry.js` + chunks (this is where "publish platform → hub auto-picks-up" happens)
  - `/api/*` → **ALB → hub gateway** (ECS Fargate)
- **Backends on ECS Fargate** (or App Runner) behind the ALB: hub gateway, NextXR API, Scenario API, AutoMind API (+ Celery worker). Container images in **ECR**.
- **Data:** **RDS Postgres** (replaces Render Postgres; hub schema `hub`, automind `public`), **ElastiCache Redis** (replaces Render Redis), **Neo4j Aura** stays (or self-host on EC2). Twin registry/scene cache → move ephemeral SQLite to a persistent store (EFS or RDS) so twins survive restarts.
- **Secrets:** AWS **Secrets Manager / SSM Parameter Store** for all keys (`*_API_KEY`, `JWT_SECRET`, DB URLs, vision keys) — replaces Render `sync:false` env.
- **Standalone platform apps:** each also gets its own subdomain (e.g. `twin.goalcert…`) via CloudFront+S3 for the "open standalone" mode, sharing SSO with the hub.
- **CI/CD (GitHub Actions):** on push to a platform → build its federated remote → sync to its S3 prefix → CloudFront invalidate; on push to a backend → build image → ECR → ECS deploy. This makes "update the twin, hub reflects it" fully automatic and hands-off.
- Keep `verify=False`-style internal calls behind the VPC/ALB with real TLS at the edge; tighten the gateway's disabled TLS verify once services share a trusted CA.

---

## Suggested sequencing
0. **Phase 0** — React-alignment spike, `@goalcert/ui-tokens` + `@goalcert/api` packages, cookie SSO, single-origin CloudFront skeleton on AWS.
1. **Phase 1** — Build the **hub skeleton** (Part A): all nav routes + placeholder slots + page-level API contract stubbed. Ship it standing on its own.
2. **Phase 2** — Integrate **Digital Twin** (B1); retire `modules/twin`.
3. **Phase 3** — **Build + integrate Scenario** (B2); retire `modules/{simulation,scenario}`.
4. **Phase 4** — Integrate **Agentic** (B3); retire `modules/{agentbuilder,hivemind,agentic}`.
5. **Phase 5** — Full AWS cutover (Part C) + CI/CD; decommission Render.

## Verification (per phase)
- **Skeleton (P1):** every nav item routes to its slot; entitlement/persona gating still hides unentitled items; stubbed page APIs return 501 cleanly; one login lands on the persona's default route.
- **Each platform (P2–P4):** after federating, drive the real page end-to-end in the hub with Playwright (login → open the page → click each button → assert data comes back **through the hub gateway**, `X-Gateway-Source: live`); confirm **zero console errors** and no visual jitter (the ported-copy bugs must not reappear). Then push a trivial change to the *platform* and confirm the hub reflects it **with no hub deploy** (federation proof).
- **Combined (P5):** Workforce Intelligence surface shows KPIs fused from all three; "open standalone" hands off SSO with no second login; kill a platform backend and confirm the hub degrades gracefully (existing `withFallback`/503 path).

## Open decisions to confirm during Phase 0
- React target version (18 vs 19) — output of the spike.
- Federation vs monorepo-packages, if the spike shows federation is too costly across the current React split.
- Whether "Team Chat / Hive Mind" federates from AutoMind or stays a hub-native surface.
