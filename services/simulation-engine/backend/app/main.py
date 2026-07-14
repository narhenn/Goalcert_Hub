"""App entrypoint. Loads all domain plugins and scenario definitions, then wires up
the API and WS routers.

Headless inside the Goalcert Hub. The engine used to also serve a standalone HTML UI
at "/" to prove itself end-to-end in a browser; that page was always described as a
placeholder for "the real UI ... once the three repos are merged". They are now merged:
the UI lives in the Hub as the Simulation module (hub/web/src/modules/simulation), and
this service is reached only through the Hub's authenticated gateway
(hub/backend/gateway.py -> /api/scenario/*). It therefore exposes no browser surface of
its own — there is exactly one application, and it is the Hub.
"""
from __future__ import annotations

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import catalog, dashboard, runs, scenarios
from .core.auth import verify_api_key
from .core.settings import settings
from .db.base import Base, engine
from .plugins.registry import load_all as load_plugins
from .scenarios.loader import load_all as load_scenarios
from .ws import runs as ws_runs

app = FastAPI(title=settings.app_name)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(bind=engine)  # auto-create tables (no Alembic yet)
    load_plugins()      # registers actor/resource types, actions, roles per domain
    load_scenarios()    # imports scenarios/definitions/** so they self-register


app.include_router(catalog.router, dependencies=[Depends(verify_api_key)])
app.include_router(scenarios.router, dependencies=[Depends(verify_api_key)])
app.include_router(runs.router, dependencies=[Depends(verify_api_key)])
app.include_router(dashboard.router, dependencies=[Depends(verify_api_key)])
app.include_router(ws_runs.router)


@app.get("/health")
def health():
    return {"status": "ok", "app": settings.app_name}