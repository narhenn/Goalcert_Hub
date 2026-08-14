"""
sso.py — the Hub as SSO provider for the two satellite LMS applications.

The Hub already issues a session JWT at login (security.create_access_token):
12 hours, HS256, no audience. That token is deliberately NOT what gets handed
to the LMS. Putting a long-lived, unscoped bearer token into a redirect URL
would leak it into browser history, Referer headers and every proxy log in
between, and a copy of it would be a 12-hour master key for the Hub API.

Instead this module mints a separate *ticket*: a different secret, a different
audience per relying party, ~60 seconds of life, and a `jti` the relying party
burns on first use. It authenticates a handoff and nothing else — it is not
accepted by the Hub's own API, and a ticket for the VR LMS is rejected by the
GoalCert LMS and vice versa.

Configuration is entirely by env; adding a fourth application is one entry in
the registry below plus two env vars.
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from db import get_db
from deps import get_current_user
from models import AuditLog, User

router = APIRouter(prefix="/api/sso", tags=["sso"])

# ── configuration ────────────────────────────────────────────────────

# Identifies this Hub in the `iss` claim. Must match HUB_SSO_ISSUER in the
# Laravel LMS .env character for character — neither side normalises it.
SSO_ISSUER = os.environ.get("SSO_ISSUER", "https://hub.goal-cert.com")

# Signing material for TICKETS ONLY. Keep this distinct from JWT_SECRET: that
# one signs Hub session tokens, and sharing it would let any relying party mint
# them. RS256 is the stronger option — see _signing_key().
SSO_ALGORITHM = os.environ.get("SSO_ALGORITHM", "HS256").upper()
SSO_SECRET = os.environ.get("SSO_SECRET", "")
SSO_PRIVATE_KEY = os.environ.get("SSO_PRIVATE_KEY", "")
SSO_PRIVATE_KEY_PATH = os.environ.get("SSO_PRIVATE_KEY_PATH", "")

# Seconds. Long enough to survive a slow redirect, short enough that a captured
# ticket is worthless by the time anyone reads the log it leaked into.
SSO_TICKET_TTL_SECONDS = int(os.environ.get("SSO_TICKET_TTL_SECONDS", "60"))


def _roles(env_name: str, default: str) -> list[str]:
    raw = os.environ.get(env_name, default)
    return [r.strip() for r in raw.split(",") if r.strip()]


# Relying parties. `audience` MUST match the target app's expected audience;
# it is what stops a ticket minted for one app opening a session in the other.
APPS: dict[str, dict] = {
    "lms": {
        "label": "GoalCert LMS",
        "audience": os.environ.get("SSO_LMS_AUDIENCE", "goalcert-lms"),
        "callback": os.environ.get("SSO_LMS_CALLBACK_URL", "https://goal-cert.com/sso/hub/callback"),
        "default_target": os.environ.get("SSO_LMS_DEFAULT_TARGET", "/admin/dashboard"),
        "roles": _roles("SSO_LMS_ROLES", "super_admin,admin"),
        # Roles that open this app the moment they sign in, with no click. A
        # SUBSET of `roles` — auto-launch grants nothing extra, it only skips
        # the button, so a role absent from `roles` can never auto-launch.
        "autolaunch_roles": _roles("SSO_LMS_AUTOLAUNCH_ROLES", "super_admin"),
        # The catalogue module this app IS, so the Microservices card for it can
        # offer the same one-click open the topbar does. Presentation only —
        # `roles` above is still the only thing that decides who may open it.
        "module_code": os.environ.get("LMS_MODULE_CODE", "lms"),
    },
    "vr": {
        "label": "VR LMS",
        "audience": os.environ.get("SSO_VR_AUDIENCE", "goalcert-vr"),
        "callback": os.environ.get("SSO_VR_CALLBACK_URL", "https://vr.goal-cert.com/sso/hub/callback"),
        "default_target": os.environ.get("SSO_VR_DEFAULT_TARGET", "/dashboard"),
        "roles": _roles("SSO_VR_ROLES", "super_admin,admin"),
        # Opening two tabs on one sign-in would be hostile. Off unless asked for.
        "autolaunch_roles": _roles("SSO_VR_AUTOLAUNCH_ROLES", ""),
        "module_code": os.environ.get("VR_MODULE_CODE", "xrlms"),
    },
}


def _may_open(user: User, cfg: dict) -> bool:
    return bool(cfg["callback"]) and (not cfg["roles"] or user.role in cfg["roles"])


def autolaunch_app_for(user: User) -> str | None:
    """
    The app this user should land in automatically on sign-in, if any.

    Answered here rather than in the browser so the rule sits beside the gate it
    depends on: a role must already be allowed to open an app before it can be
    dropped into it. Returns the first match — a sign-in opens at most one tab.
    """
    for key, cfg in APPS.items():
        if _may_open(user, cfg) and user.role in cfg["autolaunch_roles"]:
            return key
    return None


def _signing_key() -> str:
    """The key tickets are signed with, per the configured algorithm."""
    if SSO_ALGORITHM.startswith("HS"):
        if not SSO_SECRET:
            raise HTTPException(status_code=503, detail="SSO is not configured (SSO_SECRET unset)")
        # A short secret is brute-forceable offline from one captured ticket,
        # and forging a ticket means forging an admin session on the LMS.
        if len(SSO_SECRET) < 32:
            raise HTTPException(status_code=503, detail="SSO_SECRET must be at least 32 characters")
        return SSO_SECRET

    key = SSO_PRIVATE_KEY
    if not key and SSO_PRIVATE_KEY_PATH and os.path.exists(SSO_PRIVATE_KEY_PATH):
        with open(SSO_PRIVATE_KEY_PATH, "r", encoding="utf-8") as fh:
            key = fh.read()
    if not key.strip():
        raise HTTPException(status_code=503, detail="SSO is not configured (no private key)")
    return key


def _sanitise_target(target: str | None, fallback: str) -> str:
    """
    Only site-relative paths travel in the `rt` claim.

    The relying party validates this again against its own allow-list — this is
    the first of two gates, not the only one. `//host` and `/\\host` are
    protocol-relative URLs in every major browser, so both are rejected here.
    """
    if not target:
        return fallback
    target = target.strip()
    if not target.startswith("/") or target.startswith("//") or target.startswith("/\\"):
        return fallback
    return target


def create_sso_ticket(user: User, app_key: str, target: str | None = None) -> dict:
    """
    Mint a handoff ticket for `app_key` on behalf of `user`.

    Raises HTTPException if the app is unknown or the user's role may not open it.
    """
    app = APPS.get(app_key)
    if app is None:
        raise HTTPException(status_code=404, detail=f"Unknown SSO application '{app_key}'")

    if app["roles"] and user.role not in app["roles"]:
        raise HTTPException(status_code=403, detail=f"Your role cannot open {app['label']}")

    if not app["callback"]:
        raise HTTPException(status_code=503, detail=f"{app['label']} SSO callback URL is not configured")

    now = datetime.now(timezone.utc)

    claims = {
        "iss": SSO_ISSUER,
        "aud": app["audience"],
        "sub": user.id,
        "jti": uuid.uuid4().hex,
        "iat": int(now.timestamp()),
        "nbf": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=SSO_TICKET_TTL_SECONDS)).timestamp()),
        # Identity hints. The relying party uses these ONCE, to link a Hub
        # account to an account it already has; after that the link is keyed on
        # `sub`. None of these are authorisation inputs on the far side.
        "email": user.email,
        "username": user.username,
        "name": user.full_name,
        "role": user.role,
        "org_id": user.org_id,
        "rt": _sanitise_target(target, app["default_target"]),
    }

    token = jwt.encode(claims, _signing_key(), algorithm=SSO_ALGORITHM)

    return {
        "app": app_key,
        "label": app["label"],
        "url": app["callback"],
        "token": token,
        "expiresIn": SSO_TICKET_TTL_SECONDS,
    }


# ── routes ───────────────────────────────────────────────────────────

class TicketRequest(BaseModel):
    app: str
    target: str | None = None


@router.get("/apps")
def list_apps(user: User = Depends(get_current_user)):
    """
    Which satellite applications this user may open, for rendering the
    launcher buttons. Never returns URLs the caller isn't entitled to.
    """
    auto = autolaunch_app_for(user)
    return {
        "apps": [
            {"key": key, "label": cfg["label"], "autoLaunch": key == auto,
             "moduleCode": cfg.get("module_code")}
            for key, cfg in APPS.items()
            if _may_open(user, cfg)
        ],
        "autoLaunch": auto,
    }


@router.post("/ticket")
def issue_ticket(body: TicketRequest,
                 user: User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    """
    Exchange a live Hub session for a one-shot ticket into a satellite app.

    POST rather than GET on purpose: the response body carries the ticket, so
    it never lands in this server's access log as a query string.
    """
    ticket = create_sso_ticket(user, body.app, body.target)

    db.add(AuditLog(
        actor_id=user.id, actor_email=user.email, org_id=user.org_id,
        action="sso_ticket_issued",
        detail=f"{ticket['label']} (aud={APPS[body.app]['audience']}, target={body.target or 'default'})",
    ))
    db.commit()

    return ticket
