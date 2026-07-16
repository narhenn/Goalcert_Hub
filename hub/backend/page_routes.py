"""
page_routes.py — the page-oriented API contract ("one API per page").

The pivot (see PIVOT_PLAN.md) collapses the old per-feature API sprawl into ONE
endpoint per navigation page: GET /api/pages/{platform}/{page}. Hub-native pages
(overview, persona workspaces) will grow real aggregations here; platform pages
(twin / scenario / agents) are served by their FEDERATED remote through the
gateway once integrated. Until a page is wired, its endpoint returns a structured
stub so the shell can render the slot and prove the frontend<->backend contract
end to end.

Note: kept under the dedicated /api/pages prefix so it never collides with the
gateway's wildcard platform routes (/api/{twin,scenario,agents,agentbuilder}/*).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from deps import get_current_user
from models import User

router = APIRouter(prefix="/api/pages", tags=["pages"])

# The hub skeleton's page catalog — the single source of truth for what the
# navigation is built against. source: "native" (built in the hub) |
# "fed:<platform>" (federated remote) | "build->fed" (build a real FE, then federate).
PAGES: dict[str, dict[str, dict]] = {
    "hub": {
        "overview":   {"label": "Workforce Intelligence", "source": "native"},
        "loop":       {"label": "The Loop", "source": "native"},
        "audit":      {"label": "Audit Trail", "source": "native"},
        "compliance": {"label": "Compliance", "source": "native"},
        "frontline":  {"label": "My Shift", "source": "native"},
        "supervisor": {"label": "Team Readiness", "source": "native"},
        "ops":        {"label": "Ops Readiness", "source": "native"},
        "studio":     {"label": "Content Studio", "source": "native"},
    },
    "twin": {
        "twins":     {"label": "Twins Library", "source": "fed:twin",
                      "buttons": ["create", "open", "delete", "build"]},
        "dashboard": {"label": "Live Dashboard", "source": "fed:twin",
                      "buttons": ["feed-start", "feed-stop", "simulate", "run-toggle"]},
        "build":     {"label": "Build a Twin", "source": "fed:twin",
                      "buttons": ["upload-plan", "pick-domain"]},
        "predict":   {"label": "Prediction", "source": "fed:twin", "buttons": ["forecast"]},
    },
    "scenario": {
        "catalog": {"label": "Scenario Browser", "source": "build->fed", "buttons": ["filter-domain"]},
        "author":  {"label": "Scenario Builder", "source": "build->fed", "buttons": ["author-nl", "save"]},
        "run":     {"label": "Run / Cascade", "source": "build->fed",
                    "buttons": ["run", "intervene", "safeguard"]},
        "runs":    {"label": "History / Runs", "source": "build->fed", "buttons": ["compare"]},
        "reports": {"label": "Reports", "source": "build->fed", "buttons": ["export"]},
    },
    "agents": {
        "list":         {"label": "Agents / Templates", "source": "fed:agentic",
                         "buttons": ["new", "use-template"]},
        "builder":      {"label": "Agent Builder", "source": "fed:agentic",
                         "buttons": ["generate-prompt", "upload-knowledge", "set-tools", "test", "deploy"]},
        "executions":   {"label": "Executions", "source": "fed:agentic"},
        "integrations": {"label": "Integrations", "source": "fed:agentic"},
        "analytics":    {"label": "Analytics", "source": "fed:agentic"},
        "reports":      {"label": "Reports", "source": "fed:agentic"},
        "teamchat":     {"label": "Team Chat / Hive", "source": "fed:agentic"},
    },
}


@router.get("/manifest")
def manifest(user: User = Depends(get_current_user)) -> dict:
    """The full page contract the hub skeleton is built against."""
    return {"pages": PAGES}


@router.get("/{platform}/{page}")
def page(platform: str, page: str, user: User = Depends(get_current_user)) -> dict:
    """Per-page load endpoint. Returns a structured stub until the page is wired."""
    meta = PAGES.get(platform, {}).get(page)
    if meta is None:
        raise HTTPException(status_code=404, detail=f"No such page: {platform}/{page}")
    source = str(meta.get("source"))
    federated = source.startswith(("fed", "build"))
    return {
        "platform": platform,
        "page": page,
        "implemented": False,
        "status": "stub",
        "source": source,
        "label": meta.get("label"),
        "buttons": meta.get("buttons", []),
        "message": (
            f"'{meta.get('label')}' — page contract reserved; "
            + ("federated remote not yet mounted." if federated else "native page pending.")
        ),
    }
