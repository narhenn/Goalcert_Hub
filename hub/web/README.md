# Goalcert · Integration Hub (shell)

The composition shell for the Goalcert platform. It authenticates a tenant, reads
their **entitlements** (which of the three platforms they've adopted), and assembles
exactly that UI — sidebar, panels and the AI layer are all gated by what's enabled.
Same Goalcert branding, logo and theme as every platform in the suite.

It runs **standalone with no backend**: telemetry, health, findings, prediction,
scenarios and the AI all run on the built-in frontend simulator (`src/lib.jsx`) and
the zero-token stub reasoners (`src/aiStubs.js`). When the real microservices land,
each module panel becomes a micro-frontend and its calls proxy to the owning service.

## Run

```bash
cd hub/web
npm install
npm run dev      # http://localhost:5180
```

First load shows the **onboarding** ("compose your platform"). Change the combination
any time from the **live switcher** in the topbar — the whole product recomposes.

## The three composable platforms

| Module | Accent | Sidebar surfaces | Notes |
|---|---|---|---|
| **Digital Twin** | teal | Twins, Live Dashboard, Build a Twin, Prediction | Base platform. Build-a-Twin uses AI but is a *twin* feature. |
| **Scenario Engine** | amber | Scenario & Faults, Train with AI | Fault injection + what-if + training/scoring. |
| **Agentic AI** | violet | *(no tabs)* | A **layer**: topbar AI drawer, always-on co-pilot dock, and the Repair-with-AI takeover. |

**Overview** and **Audit Trail** are hub-core (always present).

### Combinations to try (via the switcher)
- **Twin only** — monitoring: telemetry, health, findings, prediction. No AI, no scenarios.
- **Twin + Scenario** — add fault injection and what-if runs; no agents.
- **Twin + Agentic** — the AI layer *takes over*: co-pilot dock + one-tap agents + Repair-with-AI.
- **Scenario only / Agentic only** — each stands alone; picks an asset inline to act on.
- **Full Suite** — everything, the closed finding → agent → scenario loop.

## Structure

```
src/
  App.jsx                 shell: topbar, gated sidebar, routing, AI layer
  hub/
    registry.jsx          the 3 modules, NAV, entitlement context (persisted)
    twinState.jsx         shared active-twin + live simulator
    audit.jsx             cross-module activity log
    Onboarding.jsx        "compose your platform"
    Switcher.jsx          live module switcher (topbar)
    AILayer.jsx           co-pilot dock · AI drawer · Repair takeover
    MiniChart / MiniMarkdown / util
  modules/
    core/                 Overview · Audit
    twin/                 TwinsLibrary · LiveDashboard · BuildTwin · Prediction
    scenario/             Scenario · Trainer
    agentic/actions.js    one-tap agent actions
  lib.jsx  aiStubs.js  styles.css   (design system + simulator, shared with the demo)
```

Entitlements are the single mechanism: `registry.navFor(enabled)` gates the sidebar,
each route checks `useEntitlements().has(id)`, and the AI layer only mounts when
`agentic` is enabled. Swap the localStorage entitlement store for the real
`GET /me/entitlements` when the gateway is up.
