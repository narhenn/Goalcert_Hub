"""
lms_client.py — the Hub's outbound channel into the satellite LMS apps.

The Hub is the commerce authority: modules, plans, pricing, subscriptions and
money all live here. The LMS executes — it hosts courses and enforces the limits
a plan grants. This module is the seam between the two.

Three things get pushed:

  push_plans(...)          the plan catalogue, so the LMS can mirror it into its
                           own `packages` table and enforce limits locally
                           (a live HTTP call on every page load is not an option)
  provision_tenant(...)    a completed purchase -> create/update the LMS tenant
  sync_subscription(...)   renewal, upgrade, expiry, cancellation

Authentication is HMAC-SHA256 over "{timestamp}.{nonce}.{body}" with a shared
secret. Signing the BODY (not just headers) is what stops a captured signature
being reattached to different content.

Everything here is best-effort by design: a purchase must never fail because
the LMS was briefly unreachable. Failures are logged and the Hub's own state
stays authoritative, so `hub:sync-plans` on the LMS or a re-grant here will
reconcile. The money side already succeeded before we get called.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import uuid
from datetime import datetime, timezone

import httpx

log = logging.getLogger(__name__)

# Which env vars configure each relying party. Blank base URL = integration off
# for that app; every call becomes a logged no-op rather than an error.
_TARGET_ENV: dict[str, dict] = {
    "lms": {"base_url": "LMS_API_BASE_URL", "secret": "LMS_API_SECRET",
            "module_code": ("LMS_MODULE_CODE", "lms")},
    "vr": {"base_url": "VR_API_BASE_URL", "secret": "VR_API_SECRET",
           "module_code": ("VR_MODULE_CODE", "xrlms")},
}


def targets() -> dict[str, dict]:
    """
    Current configuration, read from the environment on every call.

    Deliberately NOT captured at import time. This module can be imported before
    whatever loads the .env has run, and a config snapshot taken a moment too
    early silently disables the integration — the failure then looks like a
    missing secret rather than an import-order problem. Resolving lazily makes
    the order irrelevant.
    """
    out = {}
    for key, spec in _TARGET_ENV.items():
        mod_var, mod_default = spec["module_code"]
        out[key] = {
            "base_url": os.environ.get(spec["base_url"], ""),
            "secret": os.environ.get(spec["secret"], ""),
            "module_code": os.environ.get(mod_var, mod_default),
        }
    return out


def _timeout() -> float:
    return float(os.environ.get("LMS_API_TIMEOUT", "20"))


def target_for_module(module_code: str) -> str | None:
    """Which relying party owns this module code, if any."""
    for key, cfg in targets().items():
        if cfg["module_code"] == module_code:
            return key
    return None


def is_configured(target: str) -> bool:
    cfg = targets().get(target)
    return bool(cfg and cfg["base_url"] and len(cfg["secret"]) >= 32)


def _signed_headers(secret: str, body: str) -> dict:
    ts = str(int(datetime.now(timezone.utc).timestamp()))
    nonce = uuid.uuid4().hex
    sig = hmac.new(
        secret.encode("utf-8"),
        f"{ts}.{nonce}.{body}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return {
        "X-Hub-Timestamp": ts,
        "X-Hub-Nonce": nonce,
        "X-Hub-Signature": sig,
        "Content-Type": "application/json",
        "Accept": "application/json",
    }


def _call(target: str, method: str, path: str, payload: dict | None = None) -> dict:
    """
    One signed request. Never raises — returns {"ok": False, "error": ...} so a
    caller in the middle of recording a purchase cannot be derailed by it.
    """
    cfg = targets().get(target)
    if not cfg:
        return {"ok": False, "error": f"unknown target '{target}'"}

    if not cfg["base_url"]:
        log.info("[lms-client] %s not configured; skipping %s", target, path)
        return {"ok": False, "error": "not_configured", "skipped": True}

    if len(cfg["secret"]) < 32:
        log.error("[lms-client] %s secret missing or shorter than 32 chars", target)
        return {"ok": False, "error": "secret_misconfigured"}

    # json.dumps must produce EXACTLY the bytes we sign and send, or the far
    # side recomputes a different HMAC over a different body.
    body = json.dumps(payload, separators=(",", ":"), sort_keys=True) if payload is not None else ""
    url = cfg["base_url"].rstrip("/") + path

    try:
        with httpx.Client(timeout=_timeout()) as client:
            resp = client.request(
                method, url,
                headers=_signed_headers(cfg["secret"], body),
                content=body.encode("utf-8") if body else None,
            )
    except Exception as e:  # noqa: BLE001 — network faults must not raise upward
        log.warning("[lms-client] %s %s unreachable: %s", target, path, e)
        return {"ok": False, "error": "unreachable", "detail": str(e)}

    if resp.status_code >= 400:
        log.warning("[lms-client] %s %s -> HTTP %s: %s",
                    target, path, resp.status_code, resp.text[:400])
        return {"ok": False, "error": f"http_{resp.status_code}", "detail": resp.text[:400]}

    try:
        return resp.json()
    except Exception:  # noqa: BLE001
        return {"ok": True, "raw": resp.text[:400]}


# ── plan catalogue ───────────────────────────────────────────────────

def plan_payload(plan, module_code: str, country: str = "IN") -> dict:
    """
    One plan in the shape the LMS expects.

    `limits` travels as-is; the LMS maps its keys onto its own limit columns
    (config/hub.php `limit_map`). Keeping the mapping on the receiving side means
    adding an LMS-specific limit needs no change here.
    """
    price = plan.price_for(country) if hasattr(plan, "price_for") else None

    return {
        "id": plan.id,
        "code": plan.code,
        "name": plan.name,
        "description": plan.description or "",
        "moduleCode": module_code,
        "features": plan.features or [],
        "limits": plan.limits or {},
        "billingCycle": plan.billing_cycle,
        "action": plan.action,
        "isActive": bool(plan.is_active),
        "isPopular": bool(plan.is_popular),
        "sortOrder": plan.sort_order,
        "amount": float(price.amount) if price else 0.0,
        "currency": price.currency if price else "USD",
    }


def push_plans(target: str, plans: list[dict], full: bool = False) -> dict:
    """
    Mirror the catalogue into the LMS.

    `full=True` means "this is the complete list" and lets the LMS deactivate
    Hub-owned packages no longer present. Only pass it when you really are
    sending everything, or a partial push would deactivate live plans.
    """
    if not plans and not full:
        return {"ok": True, "skipped": True}

    return _call(target, "POST", "/api/hub/plans/sync", {"plans": plans, "full": full})


# ── provisioning ─────────────────────────────────────────────────────

def provision_tenant(target: str, payload: dict) -> dict:
    """A purchase completed — create or update the tenant in the LMS."""
    return _call(target, "POST", "/api/hub/tenants/provision", payload)


def sync_subscription(target: str, payload: dict) -> dict:
    """A subscription changed — renewed, upgraded, cancelled, expired."""
    return _call(target, "POST", "/api/hub/subscriptions/sync", payload)


def tenant_status(target: str, org_id: str) -> dict:
    """What the LMS believes about one organisation. Read-only."""
    return _call(target, "GET", f"/api/hub/tenants/{org_id}")


def health(target: str) -> dict:
    """Connectivity + shared-secret check, for the admin panel."""
    return _call(target, "GET", "/api/hub/health")


def integration_status() -> dict:
    """Config snapshot for the observability panel. Never returns secrets."""
    return {
        key: {
            "configured": is_configured(key),
            "baseUrl": cfg["base_url"] or None,
            "moduleCode": cfg["module_code"],
            "hasSecret": bool(cfg["secret"]),
        }
        for key, cfg in targets().items()
    }
