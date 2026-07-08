# Build Spec — Integration Hub

**Your role:** the single entry point. You authenticate once, decide which platforms a
customer has enabled, route each request to the platform that owns it, and assemble
exactly that API + UI. You own **no domain logic** — you're the connective tissue that
lets four independent teams ship independently and still feel like one product.

This is a **new repo**, built from scratch. It depends only on the four platforms'
public contracts (see [README.md](README.md)) — never their internals.

---

## 1. What the hub is (and isn't)

- **Is:** an API gateway + auth/tenancy layer + entitlement engine + a UI shell that
  composes each platform's surface by what's licensed.
- **Isn't:** a fifth place where features live. If you're tempted to put twin/agent/
  scenario logic in the hub, it belongs in a platform.

The demo's current orchestrator (`collins-demo/orchestrator/`) is the *seed* of the hub —
but strip it down: everything except routing, auth, health, and composition moves to a
platform. What remains (thin routing + the React shell) becomes the hub.

## 2. Core components

### (a) Gateway / router
One entry (e.g. `:8080`) that forwards by prefix to the owning platform:
```
/twin/*      -> Digital Twin service
/agents/*    -> Agentic AI service
/scenario/*  -> Scenario Engine service
/generate/*  -> 3D & BIM Generation service
```
Handle auth/tenancy once at the edge; inject the resolved `tenant` downstream. Return a
clean `503 {platform, reason}` when a platform is unreachable (the demo already does this
pattern in `main.py`) so a single down service never opaque-500s the whole product.

### (b) Capability manifest + entitlements — the heart of "pick what you want"
Each platform exposes `GET /capabilities`. The hub:
1. Polls every reachable platform's capabilities on startup + interval.
2. Reads the **tenant's entitlements** — the enabled module set:
   `["digital-twin", "agentic-ai", "scenario", "generation"]`.
3. Serves `GET /me/entitlements` and a **composed** `GET /capabilities` =
   *(what's reachable) ∩ (what's licensed)*.

This single intersection is the whole mechanism. The UI and the API both read it:
- Digital Twin only → only twin routes + panels are live.
- Digital Twin + Agentic AI → agent panels appear beside the twin.
- Any combination works because each platform is independent and the hub just gates.

Store entitlements per tenant (start with a JSON/DB table; later a billing system feeds it).

### (c) UI shell (composition)
Evolve `collins-demo/web/` into the shell (it's already a polished dashboard). Change:
- Nav items + panels become **entitlement-gated** — render a module's UI only if its
  capability is in the composed manifest.
- Each platform can ship its own front-end; the shell either (i) lazy-loads module panels
  it hosts, or (ii) mounts each platform's UI as a micro-frontend. Start with (i) — the
  demo's panels are already written; just gate them.
- One design system, one auth, one topbar — the four platforms feel like one product.

### (d) Cross-platform event loop (the differentiator)
Wire the closed loop so composition feels alive, not like four tabs:
```
Digital Twin finding (event bus)
   -> hub triggers Agentic AI (diagnose / work-order)
   -> Scenario Engine validates the fix (what-if run + KPI)
   -> result overlays back on the twin
```
Subscribe to the Twin's `/events/stream`; when a critical finding fires and both
Agentic AI + Scenario are entitled, orchestrate the chain. If they're not entitled, the
loop simply doesn't fire — same gating rule.

## 3. Contract the hub exposes

The **Integration Hub** block in [README.md](README.md#integration-hub--):
`GET /capabilities`, `GET /me/entitlements`, and the gateway prefixes. Plus a single
`GET /health` that aggregates every platform's health (the demo's concurrent-probe
`/health` is a good starting point).

## 4. Build order

| Step | Deliverable | Why first |
|---|---|---|
| 1 | Gateway routing + aggregated `/health` | proves the hub can reach all four platforms |
| 2 | Entitlement store + composed `/capabilities` | the backbone every gate reads |
| 3 | Shell gating (nav + panels by entitlement) | makes "pick what you want" visible |
| 4 | Auth/tenancy at the edge | multi-customer readiness |
| 5 | Event loop orchestration | the flagship cross-platform demo |

## 5. What each platform must give you (dependencies)

You are blocked only on each platform exposing:
- `GET /capabilities` (all four)
- their contract slice from [README.md](README.md)
- the Digital Twin's `/events/stream` (for the loop, step 5 only)

Until those exist, build against **mock platforms** that return canned capability
manifests + sample payloads — you never need the real services to build the hub skeleton.

## 6. Acceptance criteria

- [ ] A request to `/twin/...`, `/agents/...`, `/scenario/...`, `/generate/...` reaches the right service and returns its response.
- [ ] `GET /capabilities` returns *(reachable ∩ licensed)*; flipping a tenant's entitlement changes what's returned.
- [ ] The shell shows only the enabled modules' nav + panels; disabling a module degrades the UI cleanly (no dead buttons, no errors).
- [ ] One down platform yields a scoped `503`, not a whole-product failure.
- [ ] Auth is handled once at the edge; downstream calls carry the resolved tenant.
- [ ] (stretch) A critical twin finding triggers the agent→scenario→overlay loop when both are entitled.

**Recommended first PR:** gateway routing + aggregated health + a hard-coded entitlement
file, with the four platforms mocked. That's a running hub skeleton the platform teams can
target immediately.
