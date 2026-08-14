"""
lms_sync.py — bridges Hub commerce events onto the satellite LMS apps.

commerce_routes.py owns the money and the entitlement; this module owns the
consequence: when a tenant buys the LMS, a tenant must exist over there with the
right plan and the right expiry.

Split from lms_client.py on purpose — that one is a dumb signed HTTP client with
no ORM knowledge, this one knows what a Subscription means. Keeping them apart
means the transport can be tested without a database.

Every entry point here is best-effort. A purchase has already succeeded by the
time we run; failing it because the LMS was restarting would be the wrong
trade. Failures are logged, and either `php artisan hub:sync-plans` on the LMS
or a re-grant here reconciles.

Also exposes the PULL side: GET /api/integration/plans, which the LMS calls to
reconcile its catalogue if a push was ever missed.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
from datetime import datetime, timezone

from fastapi import APIRouter, Header, HTTPException, Query, Request
from sqlalchemy.orm import Session

import lms_client
from commerce_models import Plan, Subscription
from db import get_db
from models import Organization, User
from rbac_models import Module

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/integration", tags=["integration"])


# ── outbound: commerce event -> LMS ──────────────────────────────────

def _owner_for_org(db: Session, org: Organization) -> User | None:
    """
    Who the LMS should treat as the tenant's owner.

    The org's admin is the right answer — that persona buys and runs the tenant.
    Falls back to the oldest active member so a purchase never stalls on an org
    that has not appointed an admin yet.
    """
    q = db.query(User).filter(User.org_id == org.id, User.status == "active")

    admin = q.filter(User.role == "admin").order_by(User.created_at.asc()).first()
    if admin:
        return admin

    return q.order_by(User.created_at.asc()).first()


def _provision_payload(db: Session, sub: Subscription, org: Organization) -> dict | None:
    owner = _owner_for_org(db, org)
    if owner is None:
        log.warning("[lms-sync] org %s has no user to own the tenant; skipping", org.slug)
        return None

    plan = db.get(Plan, sub.plan_id) if sub.plan_id else None
    if plan is None:
        log.warning("[lms-sync] subscription %s has no plan; skipping", sub.id)
        return None

    price = plan.price_for("IN") if hasattr(plan, "price_for") else None

    return {
        "orgId": org.id,
        "orgName": org.name,
        "orgSlug": org.slug,
        "planId": plan.id,
        "moduleCode": sub.module_code,
        "subscriptionId": sub.id,
        "ownerEmail": owner.email,
        "ownerName": owner.full_name or "",
        "country": "",
        "currency": price.currency if price else "USD",
        "currencySymbol": "",
        "expiresAt": sub.expires_at.strftime("%Y-%m-%d") if sub.expires_at else None,
        "isTrial": sub.status == "trial",
        # The Hub prices the LMS per seat. The LMS records this but does not yet
        # enforce it — its limits live on the shared `packages` row, so writing
        # seats into student_limit would change the limit for every tenant on
        # the same plan. See the `seats` column note in hub_tenant_links.
        "seats": sub.seats,
    }


def on_subscription_changed(db: Session, sub: Subscription, org: Organization) -> dict:
    """
    Call after a subscription is created, granted, edited or cancelled.

    A live subscription provisions (idempotently — the LMS updates the tenant it
    already made). A dead one syncs the status across so the tenant's membership
    expires in step.
    """
    target = lms_client.target_for_module(sub.module_code)

    if target is None or not lms_client.is_configured(target):
        return {"ok": True, "skipped": True, "reason": "no configured target"}

    live = sub.status in ("active", "trial")

    if live:
        payload = _provision_payload(db, sub, org)
        if payload is None:
            return {"ok": False, "error": "incomplete_payload"}
        result = lms_client.provision_tenant(target, payload)
    else:
        result = lms_client.sync_subscription(target, {
            "orgId": org.id,
            "status": sub.status,
            "planId": sub.plan_id,
            "subscriptionId": sub.id,
            "expiresAt": sub.expires_at.strftime("%Y-%m-%d") if sub.expires_at else None,
        })

    log.info("[lms-sync] %s %s -> %s: %s",
             org.slug, sub.module_code, "provision" if live else "sync",
             "ok" if result.get("ok") else result.get("error"))

    return result


def _plans_for_module(db: Session, module_code: str) -> list[dict]:
    module = db.query(Module).filter_by(code=module_code).first()
    if module is None:
        return []

    # Soft-deleted plans are withdrawn from sale and must not be mirrored. They
    # simply vanish from the payload; because the push is full=True, the LMS
    # deactivates the corresponding package instead of deleting it.
    plans = (db.query(Plan)
               .filter(Plan.module_id == module.id, Plan.deleted_at.is_(None))
               .all())
    return [lms_client.plan_payload(p, module_code) for p in plans]


def push_catalogue(db: Session, module_code: str | None = None) -> dict:
    """
    Mirror the plan catalogue down.

    With no module_code, pushes every module that has a configured target — the
    right call after a bulk edit or on startup.
    """
    results = {}

    codes = [module_code] if module_code else [
        cfg["module_code"] for key, cfg in lms_client.targets().items()
        if lms_client.is_configured(key)
    ]

    for code in codes:
        target = lms_client.target_for_module(code)
        if target is None or not lms_client.is_configured(target):
            continue

        plans = _plans_for_module(db, code)
        # full=True: this IS the complete list for that module, so the LMS may
        # deactivate Hub-owned packages we no longer have.
        results[code] = lms_client.push_plans(target, plans, full=True)

    return results


def on_plan_changed(db: Session, plan: Plan) -> dict:
    """Call after a plan is created, updated or deleted."""
    module = db.get(Module, plan.module_id) if plan.module_id else None

    if module is None:
        # A bundle plan spans every module; refresh everything rather than guess.
        return push_catalogue(db)

    return push_catalogue(db, module.code)


# ── inbound: the LMS pulling the catalogue ───────────────────────────

def _verify_pull_signature(request: Request, timestamp: str, nonce: str, signature: str) -> str:
    """
    Same HMAC scheme as the outbound direction, so one shared secret per relying
    party covers both and there is no second credential to rotate.

    Returns the target key on success.
    """
    if not (timestamp and nonce and signature):
        raise HTTPException(401, "Missing signature headers")

    if not timestamp.isdigit():
        raise HTTPException(401, "Malformed timestamp")

    drift = abs(int(datetime.now(timezone.utc).timestamp()) - int(timestamp))
    tolerance = int(os.environ.get("LMS_API_TIMESTAMP_TOLERANCE", "300"))
    if drift > tolerance:
        raise HTTPException(401, "Timestamp outside tolerance")

    # A GET carries no body, so the signed string ends with an empty segment —
    # matching what the LMS command signs.
    signed = f"{timestamp}.{nonce}."

    for key, cfg in lms_client.targets().items():
        secret = cfg["secret"]
        if len(secret) < 32:
            continue
        expected = hmac.new(secret.encode("utf-8"), signed.encode("utf-8"), hashlib.sha256).hexdigest()
        if hmac.compare_digest(expected, signature):
            return key

    raise HTTPException(401, "Signature mismatch")


@router.get("/plans")
def pull_plans(request: Request,
               modules: str = Query(default="lms"),
               x_hub_timestamp: str = Header(default=""),
               x_hub_nonce: str = Header(default=""),
               x_hub_signature: str = Header(default="")):
    """
    The catalogue, for a relying party reconciling itself.

    Used by `php artisan hub:sync-plans` on the LMS — the pull-side safety net
    for a push that never landed because the LMS was down or mid-deploy.
    """
    _verify_pull_signature(request, x_hub_timestamp, x_hub_nonce, x_hub_signature)

    codes = [c.strip() for c in modules.split(",") if c.strip()]

    db: Session = next(get_db())
    try:
        plans: list[dict] = []
        for code in codes:
            plans.extend(_plans_for_module(db, code))
    finally:
        db.close()

    return {"plans": plans, "modules": codes}
