"""
commerce_routes.py — the catalogue, the storefront and the money.

Three audiences:
  /api/public/*    unauthenticated. The marketing site's pricing page reads the
                   catalogue here and posts custom-quote enquiries.
  /api/store/*     a signed-in tenant: every microservice, flagged owned or
                   locked. Drives the marketplace cards and the sidebar.
  /api/platform/*  the platform owner: microservice CRUD, plans and pricing,
                   payment gateways, transactions, enquiry inbox, earnings.

Entitlement has ONE definition, in `owned_modules()`. The marketplace lock, the
sidebar and the gateway all call it, so a card can never say "owned" while the
menu it unlocks stays hidden.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from commerce_models import (ACTION_ENTERPRISE, SUB_ACTIVE, SUB_CANCELLED,
                             SUB_EXPIRED, SUB_TRIAL, Enquiry,
                             PaymentGateway, Plan, PlanPrice, Subscription,
                             Transaction)
from commerce_seed import ensure_gateways
from db import get_db
# Pushes commerce events into the satellite LMS apps (provisioning, plan
# catalogue). Imported as a module so the call sites read as what they are.
import lms_sync
from models import AuditLog, Organization, User
from rbac import Principal, get_principal, require_permission
from rbac_models import Module

logger = logging.getLogger("hub-backend")

router = APIRouter(prefix="/api", tags=["commerce"])


def _log(db: Session, p: Principal, action: str, detail: str = "") -> None:
    db.add(AuditLog(actor_id=p.user.id, actor_email=p.user.email,
                    org_id=p.user.org_id, action=action, detail=detail))
    db.commit()


# ══ Entitlement — the single definition ════════════════════════════════

def owned_modules(db: Session, org_id: str | None) -> set[str]:
    """
    Which microservice codes this tenant currently holds.

    A live Subscription is the real answer. `organizations.entitlements` is the
    older JSON list that the gateway still reads; it is unioned in so nothing
    that worked before this shipped silently loses access.
    """
    if not org_id:
        return set()

    subs = db.query(Subscription).filter(Subscription.org_id == org_id).all()
    owned = {s.module_code for s in subs if s.is_live}

    org = db.get(Organization, org_id)
    if org and org.entitlements:
        owned |= set(org.entitlements)
    return owned


def _sync_entitlements(db: Session, org: Organization) -> None:
    """
    Mirror live subscriptions into the legacy JSON list the gateway reads.

    Only modules this tenant actually HAS a subscription row for are governed
    here. Anything granted the old way and never subscribed is left untouched —
    otherwise selling a customer one new service would silently revoke every
    module they already had, because those grants predate the commerce tables.
    """
    subs = db.query(Subscription).filter(Subscription.org_id == org.id).all()
    live = {s.module_code for s in subs if s.is_live}
    managed = {s.module_code for s in subs}          # we own the answer for these
    legacy = set(org.entitlements or []) - managed   # not ours to revoke
    org.entitlements = sorted(live | legacy)
    db.flush()


# ══ /api/public — the marketing site ═══════════════════════════════════

@router.get("/public/catalog")
def public_catalog(country: str = "IN", db: Session = Depends(get_db)):
    """
    Every published microservice with its plans and prices.

    This replaces the hardcoded products.js catalogue: what the pricing page
    shows is now whatever the platform owner has created.
    """
    mods = (db.query(Module)
              .filter(Module.is_active.is_(True), Module.is_public.is_(True),
                      Module.deleted_at.is_(None))
              .order_by(Module.sort_order).all())
    # is_custom plans are quotes for one named enquiry — never catalogue them.
    plans = (db.query(Plan)
               .filter(Plan.is_active.is_(True), Plan.deleted_at.is_(None),
                       Plan.is_custom.is_(False))
               .order_by(Plan.sort_order).all())

    by_module: dict[str, list] = {}
    for pl in plans:
        by_module.setdefault(pl.module_id or "__bundle__", []).append(pl.to_public(country))

    return {
        "country": country,
        "modules": [{**m.to_public(), "plans": by_module.get(m.id, [])} for m in mods],
        "bundles": by_module.get("__bundle__", []),
    }


class EnquiryCreate(BaseModel):
    """A custom-quote request. Deliberately tolerant — a lead is worth more than a schema."""
    email: EmailStr
    company: str = ""
    contact_name: str = ""
    phone: str = ""
    country: str = ""
    module_codes: list[str] = []
    seats: int = 0
    message: str = ""
    source: str = "pricing"


@router.post("/public/enquiries", status_code=201)
def create_enquiry(body: EnquiryCreate, request: Request, db: Session = Depends(get_db)):
    """
    Raised when a visitor selects more than one service (or an enterprise tier).

    The row is written first and always. Emailing sales is attempted after, and
    a failure never loses the lead — `notified` simply stays false and the
    enquiry still appears in the owner's inbox.
    """
    e = Enquiry(
        email=str(body.email).strip().lower(), company=body.company.strip(),
        contact_name=body.contact_name.strip(), phone=body.phone.strip(),
        country=body.country.strip(), module_codes=body.module_codes,
        seats=body.seats, message=body.message.strip(), source=body.source,
        status="new",
    )
    db.add(e)
    db.commit()
    db.refresh(e)

    if _notify_sales(e):
        e.notified_at = datetime.utcnow()
        db.commit()

    logger.info("enquiry %s from %s for %s", e.id, e.email, e.module_codes)
    return {"ok": True, "enquiry": e.to_public()}


def _notify_sales(e: Enquiry) -> bool:
    """
    Email the sales manager, if the platform has SMTP configured.

    There is no SMTP module on this platform yet, so unless SMTP_HOST and
    SALES_EMAIL are set in the environment this returns False and the enquiry
    is flagged "not emailed" in the inbox. It does not pretend to have sent.
    """
    host = os.environ.get("SMTP_HOST", "").strip()
    to = os.environ.get("SALES_EMAIL", "").strip()
    if not host or not to:
        return False

    try:
        import smtplib
        from email.message import EmailMessage

        msg = EmailMessage()
        msg["Subject"] = f"New quote request — {e.company or e.email}"
        msg["From"] = os.environ.get("SMTP_FROM", to)
        msg["To"] = to
        msg.set_content(
            f"Company:  {e.company}\nContact:  {e.contact_name}\n"
            f"Email:    {e.email}\nPhone:    {e.phone}\nCountry:  {e.country}\n"
            f"Services: {', '.join(e.module_codes)}\nSeats:    {e.seats}\n\n{e.message}\n"
        )
        port = int(os.environ.get("SMTP_PORT", "587"))
        with smtplib.SMTP(host, port, timeout=10) as s:
            if os.environ.get("SMTP_TLS", "1") not in ("0", "false"):
                s.starttls()
            user, pwd = os.environ.get("SMTP_USER"), os.environ.get("SMTP_PASSWORD")
            if user and pwd:
                s.login(user, pwd)
            s.send_message(msg)
        return True
    except Exception as exc:                                   # noqa: BLE001
        logger.warning("enquiry %s: sales email failed (%s) — lead is still saved", e.id, exc)
        return False


# ══ /api/store — the tenant's marketplace ══════════════════════════════

@router.get("/store/catalog")
def store_catalog(country: str = "IN", p: Principal = Depends(get_principal),
                  db: Session = Depends(get_db)):
    """
    Every microservice, each flagged owned or locked, for the company dashboard.

    Locked entries still carry their plans, so "Preview" can show what the
    service is and what it would cost without a second round trip.
    """
    owned = owned_modules(db, p.org_id)
    mods = (db.query(Module)
              .filter(Module.is_active.is_(True), Module.deleted_at.is_(None))
              .order_by(Module.sort_order).all())
    plans = (db.query(Plan)
               .filter(Plan.is_active.is_(True), Plan.deleted_at.is_(None),
                       Plan.is_custom.is_(False))
               .order_by(Plan.sort_order).all())
    by_module: dict[str, list] = {}
    for pl in plans:
        if pl.module_id:
            by_module.setdefault(pl.module_id, []).append(pl.to_public(country))

    subs = {s.module_code: s for s in
            db.query(Subscription).filter(Subscription.org_id == p.org_id).all()} if p.org_id else {}

    out = []
    for m in mods:
        sub = subs.get(m.code)
        out.append({
            **m.to_public(),
            "owned": m.code in owned,
            "subscription": sub.to_public() if sub else None,
            "plans": by_module.get(m.id, []),
            "fromPrice": min((pl["price"]["amount"] for pl in by_module.get(m.id, [])
                              if pl.get("price")), default=None),
        })
    return {"modules": out, "owned": sorted(owned)}


@router.get("/store/subscriptions")
def my_subscriptions(p: Principal = Depends(require_permission(
        "company.subscription.view", "company.subscription.manage")),
        db: Session = Depends(get_db)):
    subs = db.query(Subscription).filter(Subscription.org_id == p.org_id).all()
    return {"subscriptions": [s.to_public() for s in subs]}


# ══ /api/platform — microservice CRUD ══════════════════════════════════

class ModuleWrite(BaseModel):
    code: Optional[str] = Field(default=None, min_length=2, max_length=64)
    name: str = Field(min_length=2, max_length=160)
    description: str = ""
    tagline: str = ""
    features: list[str] = []
    category: str = ""
    version: str = "1.0.0"
    icon: str = "ti-box"
    color: str = "#6d28d9"
    logo_url: Optional[str] = None
    banner_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    preview_video_url: Optional[str] = None
    redirect_url: Optional[str] = None
    login_url: Optional[str] = None
    status: str = "active"
    is_active: bool = True
    is_public: bool = True
    sort_order: int = 100


@router.get("/platform/modules")
def list_modules_admin(p: Principal = Depends(require_permission(
        "platform.modules.view", "platform.modules.manage")),
        db: Session = Depends(get_db)):
    """Every microservice including unpublished ones, each with its plan count."""
    mods = db.query(Module).filter(Module.deleted_at.is_(None)).order_by(Module.sort_order).all()
    counts = dict(db.query(Plan.module_id, func.count(Plan.id))
                    .filter(Plan.deleted_at.is_(None)).group_by(Plan.module_id).all())
    subs = dict(db.query(Subscription.module_code, func.count(Subscription.id))
                  .group_by(Subscription.module_code).all())
    return {"modules": [{**m.to_public(), "planCount": counts.get(m.id, 0),
                         "subscriberCount": subs.get(m.code, 0)} for m in mods]}


@router.post("/platform/modules", status_code=201)
def create_module(body: ModuleWrite,
                  p: Principal = Depends(require_permission("platform.modules.manage")),
                  db: Session = Depends(get_db)):
    code = (body.code or body.name).lower().strip()
    code = "".join(ch if ch.isalnum() else "-" for ch in code).strip("-")
    if db.query(Module).filter_by(code=code).first():
        raise HTTPException(409, f"A microservice with code '{code}' already exists")

    m = Module(code=code, **body.model_dump(exclude={"code"}))
    db.add(m)
    db.commit()
    db.refresh(m)
    _log(db, p, "module_create", f"Created microservice {m.name} ({m.code})")
    return {"module": m.to_public()}


@router.patch("/platform/modules/{module_id}")
def update_module(module_id: str, body: ModuleWrite,
                  p: Principal = Depends(require_permission("platform.modules.manage")),
                  db: Session = Depends(get_db)):
    m = db.get(Module, module_id)
    if not m or m.deleted_at:
        raise HTTPException(404, "Microservice not found")
    # Partial by design — see the note on update_plan.
    for k, v in body.model_dump(exclude={"code"}, exclude_unset=True).items():
        setattr(m, k, v)
    db.commit()
    db.refresh(m)
    _log(db, p, "module_update", f"Updated microservice {m.code}")
    return {"module": m.to_public()}


@router.delete("/platform/modules/{module_id}")
def delete_module(module_id: str,
                  p: Principal = Depends(require_permission("platform.modules.manage")),
                  db: Session = Depends(get_db)):
    m = db.get(Module, module_id)
    if not m or m.deleted_at:
        raise HTTPException(404, "Microservice not found")
    live = db.query(Subscription).filter(Subscription.module_code == m.code).count()
    if live:
        raise HTTPException(
            409, f"{live} tenant(s) still subscribe to this — unpublish it instead of deleting")
    m.deleted_at = datetime.utcnow()
    db.commit()
    _log(db, p, "module_delete", f"Deleted microservice {m.code}")
    return {"ok": True}


# ══ /api/platform — plans & pricing ════════════════════════════════════

class PriceWrite(BaseModel):
    country_code: str = "IN"
    currency: str = "INR"
    amount: float = 0
    period: str = "/yr"
    is_default: bool = False


class PlanWrite(BaseModel):
    module_id: Optional[str] = None
    code: str = Field(min_length=2, max_length=64)
    name: str = Field(min_length=2, max_length=120)
    description: str = ""
    features: list[str] = []
    excluded: list[str] = []
    limits: dict = {}
    billing_cycle: str = "yearly"
    scope: str = ""
    action: str = "signup"
    is_popular: bool = False
    is_active: bool = True
    sort_order: int = 0
    # A quote written for one enquiry: private, never catalogued.
    is_custom: bool = False
    enquiry_id: Optional[str] = None
    quoted_to: str = ""
    prices: list[PriceWrite] = []


@router.get("/platform/plans")
def list_plans(module_id: Optional[str] = None,
               p: Principal = Depends(require_permission(
                   "platform.plans.view", "platform.plans.manage")),
               db: Session = Depends(get_db)):
    q = db.query(Plan).filter(Plan.deleted_at.is_(None))
    if module_id:
        q = q.filter(Plan.module_id == module_id)
    return {"plans": [pl.to_public() for pl in q.order_by(Plan.sort_order).all()]}


def _free_custom_code(db: Session, module_id: str | None, code: str) -> str:
    """
    A custom plan's code is an internal handle, not a public URL, and two
    quotes for "Acme Corp" are entirely normal. Suffix rather than 409 —
    failing a quote because an earlier one shares a name helps nobody.
    """
    candidate, n = code, 1
    while db.query(Plan).filter_by(module_id=module_id, code=candidate).first():
        n += 1
        candidate = f"{code[:58]}-{n}"
    return candidate


@router.post("/platform/plans", status_code=201)
def create_plan(body: PlanWrite,
                p: Principal = Depends(require_permission("platform.plans.manage")),
                db: Session = Depends(get_db)):
    if body.module_id and not db.get(Module, body.module_id):
        raise HTTPException(404, "Microservice not found")

    enquiry = None
    if body.enquiry_id:
        enquiry = db.get(Enquiry, body.enquiry_id)
        if not enquiry:
            raise HTTPException(404, "Enquiry not found")

    data = body.model_dump(exclude={"prices"})
    if body.is_custom:
        data["code"] = _free_custom_code(db, body.module_id, body.code)
    elif db.query(Plan).filter_by(module_id=body.module_id, code=body.code).first():
        raise HTTPException(409, f"Plan '{body.code}' already exists for this microservice")

    plan = Plan(**data)
    db.add(plan)
    db.flush()
    _write_prices(db, plan, body.prices)

    # Pricing the request is what "quoted" means — record it here rather than
    # relying on whoever wrote the quote to also remember to move the status.
    if enquiry and enquiry.status in ("new", "contacted"):
        enquiry.status = "quoted"

    db.commit()
    db.refresh(plan)
    _log(db, p, "plan_create",
         f"Created {'custom ' if plan.is_custom else ''}plan {plan.name}"
         + (f" for enquiry {enquiry.email}" if enquiry else ""))

    # Mirror the catalogue down. The LMS enforces limits from its own `packages`
    # rows on every page load, so it needs the plan locally, not over HTTP.
    lms_sync.on_plan_changed(db, plan)

    return {"plan": plan.to_public()}


def _write_prices(db: Session, plan: Plan, prices: list[PriceWrite]) -> None:
    """Replace a plan's price list, guaranteeing exactly one default."""
    db.query(PlanPrice).filter_by(plan_id=plan.id).delete()
    rows = [PlanPrice(plan_id=plan.id, **pr.model_dump()) for pr in prices]
    if rows:
        defaults = [r for r in rows if r.is_default]
        if not defaults:
            rows[0].is_default = True     # a plan with prices always has a fallback
        elif len(defaults) > 1:
            first = defaults[0]
            for r in rows:
                r.is_default = (r is first)
    for r in rows:
        db.add(r)
    db.flush()


class PlanUpdate(BaseModel):
    """Every field optional — a PATCH may carry just the prices."""
    name: Optional[str] = None
    description: Optional[str] = None
    features: Optional[list[str]] = None
    excluded: Optional[list[str]] = None
    limits: Optional[dict] = None
    billing_cycle: Optional[str] = None
    scope: Optional[str] = None
    action: Optional[str] = None
    quoted_to: Optional[str] = None
    is_popular: Optional[bool] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None
    prices: Optional[list[PriceWrite]] = None


@router.patch("/platform/plans/{plan_id}")
def update_plan(plan_id: str, body: PlanUpdate,
                p: Principal = Depends(require_permission("platform.plans.manage")),
                db: Session = Depends(get_db)):
    plan = db.get(Plan, plan_id)
    if not plan or plan.deleted_at:
        raise HTTPException(404, "Plan not found")

    # PATCH must be partial. exclude_unset means a field the client did not send
    # keeps its stored value — without it, omitting `features` would silently
    # blank the feature list to the schema default.
    changes = body.model_dump(exclude={"prices"}, exclude_unset=True)
    for k, v in changes.items():
        if v is not None:
            setattr(plan, k, v)
    if body.prices is not None:
        _write_prices(db, plan, body.prices)
    db.commit()
    db.refresh(plan)
    _log(db, p, "plan_update", f"Updated plan {plan.name}")

    lms_sync.on_plan_changed(db, plan)

    return {"plan": plan.to_public()}


@router.delete("/platform/plans/{plan_id}")
def delete_plan(plan_id: str,
                p: Principal = Depends(require_permission("platform.plans.manage")),
                db: Session = Depends(get_db)):
    plan = db.get(Plan, plan_id)
    if not plan or plan.deleted_at:
        raise HTTPException(404, "Plan not found")
    plan.deleted_at = datetime.utcnow()
    db.commit()
    _log(db, p, "plan_delete", f"Deleted plan {plan.name}")

    # The LMS deactivates the mirrored package rather than deleting it —
    # `memberships` point at it, and a paying tenant must not lose its limits
    # mid-term because the plan was withdrawn from sale.
    lms_sync.on_plan_changed(db, plan)

    return {"ok": True}


# ══ /api/platform — payment gateways ═══════════════════════════════════

class GatewayWrite(BaseModel):
    is_enabled: Optional[bool] = None
    is_test_mode: Optional[bool] = None
    currencies: Optional[list[str]] = None
    # Only non-empty values are written, so submitting the form without
    # retyping a secret never blanks the stored one.
    config: Optional[dict] = None


@router.get("/platform/gateways")
def list_gateways(p: Principal = Depends(require_permission("platform.payments.manage")),
                  db: Session = Depends(get_db)):
    """
    Ensures a row exists for each known gateway, then returns them secret-free.

    Re-runs the environment bootstrap on every read, so a key added to the
    deploy's env appears on this screen without a restart or a manual step.
    """
    ensure_gateways(db)
    db.commit()
    rows = db.query(PaymentGateway).order_by(PaymentGateway.sort_order).all()
    return {"gateways": [g.to_public() for g in rows]}


@router.patch("/platform/gateways/{code}")
def update_gateway(code: str, body: GatewayWrite,
                   p: Principal = Depends(require_permission("platform.payments.manage")),
                   db: Session = Depends(get_db)):
    g = db.query(PaymentGateway).filter_by(code=code).first()
    if not g:
        raise HTTPException(404, "Gateway not found")

    if body.is_enabled is not None:
        g.is_enabled = body.is_enabled
    if body.is_test_mode is not None:
        g.is_test_mode = body.is_test_mode
    if body.currencies is not None:
        g.currencies = body.currencies
    if body.config:
        merged = dict(g.config or {})
        for k, v in body.config.items():
            if v:                      # blank means "leave what's stored"
                merged[k] = v
        g.config = merged

    db.commit()
    db.refresh(g)
    _log(db, p, "gateway_update", f"Updated {g.code} (enabled={g.is_enabled})")
    return {"gateway": g.to_public()}


# ══ /api/platform — transactions & earnings ════════════════════════════

@router.get("/platform/transactions")
def list_transactions(limit: int = 50, offset: int = 0, status: Optional[str] = None,
                      p: Principal = Depends(require_permission(
                          "platform.transactions.view")),
                      db: Session = Depends(get_db)):
    q = db.query(Transaction)
    if status:
        q = q.filter(Transaction.status == status)
    total = q.count()
    rows = q.order_by(Transaction.created_at.desc()).offset(offset).limit(min(limit, 200)).all()
    names = dict(db.query(Organization.id, Organization.name).all())
    return {
        "transactions": [t.to_public(names.get(t.org_id)) for t in rows],
        "total": total, "limit": limit, "offset": offset,
    }


@router.get("/platform/stats")
def platform_stats(p: Principal = Depends(require_permission("platform.analytics.view")),
                   db: Session = Depends(get_db)):
    """
    The platform owner's dashboard numbers: earnings, tenants, users, enquiries.

    Earnings count only `status='paid'` — pending and failed rows are reported
    separately rather than inflating revenue.
    """
    paid = db.query(func.coalesce(func.sum(Transaction.amount), 0)) \
             .filter(Transaction.status == "paid").scalar()
    month_start = datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    mtd = db.query(func.coalesce(func.sum(Transaction.amount), 0)) \
            .filter(Transaction.status == "paid",
                    Transaction.created_at >= month_start).scalar()
    pending = db.query(func.coalesce(func.sum(Transaction.amount), 0)) \
                .filter(Transaction.status == "pending").scalar()

    by_module = db.query(Transaction.module_code,
                         func.coalesce(func.sum(Transaction.amount), 0)) \
                  .filter(Transaction.status == "paid") \
                  .group_by(Transaction.module_code).all()

    return {
        "earnings": {"total": float(paid or 0), "monthToDate": float(mtd or 0),
                     "pending": float(pending or 0), "currency": "INR"},
        "counts": {
            "organizations": db.query(Organization).count(),
            "users": db.query(User).count(),
            "modules": db.query(Module).filter(Module.deleted_at.is_(None)).count(),
            "plans": db.query(Plan).filter(Plan.deleted_at.is_(None)).count(),
            "subscriptions": db.query(Subscription).count(),
            "transactions": db.query(Transaction).count(),
            "enquiriesNew": db.query(Enquiry).filter(Enquiry.status == "new").count(),
        },
        "earningsByModule": [{"moduleCode": c or "unattributed", "amount": float(a or 0)}
                             for c, a in by_module],
    }


# ══ /api/platform — enquiry inbox ══════════════════════════════════════

class EnquiryUpdate(BaseModel):
    status: Optional[str] = None
    assigned_to: Optional[str] = None
    internal_note: Optional[str] = None


@router.get("/platform/enquiries")
def list_enquiries(status: Optional[str] = None, limit: int = 100,
                   p: Principal = Depends(require_permission(
                       "platform.companies.view", "platform.analytics.view")),
                   db: Session = Depends(get_db)):
    q = db.query(Enquiry)
    if status:
        q = q.filter(Enquiry.status == status)
    rows = q.order_by(Enquiry.created_at.desc()).limit(min(limit, 300)).all()
    counts = dict(db.query(Enquiry.status, func.count(Enquiry.id))
                    .group_by(Enquiry.status).all())

    # Attach the custom quotes written against these enquiries, so the inbox can
    # show "quoted at X" instead of just a status word. One query, not one each.
    quotes: dict[str, list] = {}
    if rows:
        for pl in (db.query(Plan)
                     .filter(Plan.enquiry_id.in_([e.id for e in rows]),
                             Plan.deleted_at.is_(None))
                     .order_by(Plan.created_at).all()):
            quotes.setdefault(pl.enquiry_id, []).append(pl.to_public())

    return {
        "enquiries": [{**e.to_public(), "customPlans": quotes.get(e.id, [])} for e in rows],
        "counts": counts,
    }


@router.patch("/platform/enquiries/{enquiry_id}")
def update_enquiry(enquiry_id: str, body: EnquiryUpdate,
                   p: Principal = Depends(require_permission("platform.companies.view")),
                   db: Session = Depends(get_db)):
    e = db.get(Enquiry, enquiry_id)
    if not e:
        raise HTTPException(404, "Enquiry not found")
    for field in ("status", "assigned_to", "internal_note"):
        v = getattr(body, field)
        if v is not None:
            setattr(e, field, v)
    db.commit()
    db.refresh(e)
    _log(db, p, "enquiry_update", f"Enquiry {e.email} -> {e.status}")
    return {"enquiry": e.to_public()}


@router.delete("/platform/enquiries/{enquiry_id}")
def delete_enquiry(enquiry_id: str,
                   p: Principal = Depends(require_permission("platform.companies.view")),
                   db: Session = Depends(get_db)):
    e = db.get(Enquiry, enquiry_id)
    if not e:
        raise HTTPException(404, "Enquiry not found")
    db.delete(e)
    db.commit()
    _log(db, p, "enquiry_delete", f"Deleted enquiry {e.email}")
    return {"ok": True}


# ══ Company detail + lifecycle ═════════════════════════════════════════

@router.get("/platform/companies/{org_id}")
def company_detail(org_id: str,
                   p: Principal = Depends(require_permission("platform.companies.view")),
                   db: Session = Depends(get_db)):
    """Everything the owner needs on one tenant: people, subscriptions, spend."""
    org = db.get(Organization, org_id)
    if not org:
        raise HTTPException(404, "Organisation not found")

    users = db.query(User).filter(User.org_id == org_id).order_by(User.created_at.desc()).all()
    subs = db.query(Subscription).filter(Subscription.org_id == org_id).all()
    txns = (db.query(Transaction).filter(Transaction.org_id == org_id)
              .order_by(Transaction.created_at.desc()).limit(20).all())
    spend = db.query(func.coalesce(func.sum(Transaction.amount), 0)) \
              .filter(Transaction.org_id == org_id, Transaction.status == "paid").scalar()

    return {
        "org": org.to_public(),
        "users": [u.to_public() for u in users],
        "subscriptions": [s.to_public() for s in subs],
        "transactions": [t.to_public(org.name) for t in txns],
        "totalSpend": float(spend or 0),
    }


@router.delete("/platform/companies/{org_id}")
def delete_company(org_id: str, confirm: str = "",
                   p: Principal = Depends(require_permission("platform.companies.delete")),
                   db: Session = Depends(get_db)):
    """
    Delete a tenant and everything scoped to it.

    Guarded by a typed confirmation of the slug, because the FK cascade takes
    the org's users, roles and subscriptions with it — this is not undoable and
    a mis-click on a row would be catastrophic.
    """
    org = db.get(Organization, org_id)
    if not org:
        raise HTTPException(404, "Organisation not found")
    if confirm != org.slug:
        raise HTTPException(
            400, f"Type the organisation slug '{org.slug}' to confirm deletion")

    name, users = org.name, len(org.users)
    db.delete(org)
    db.commit()
    _log(db, p, "org_delete", f"Deleted {name} ({users} user(s) removed)")
    return {"ok": True, "deleted": name, "usersRemoved": users}


# ══ Granting a subscription ════════════════════════════════════════════

class GrantSubscription(BaseModel):
    org_id: str
    module_code: str
    plan_id: Optional[str] = None
    seats: int = 1
    months: int = 12
    status: str = SUB_ACTIVE
    record_transaction: bool = True


@router.post("/platform/subscriptions", status_code=201)
def grant_subscription(body: GrantSubscription,
                       p: Principal = Depends(require_permission(
                           "platform.companies.update", "platform.plans.manage")),
                       db: Session = Depends(get_db)):
    """
    Activate a microservice for a tenant.

    This is the deliberate seam where a real gateway callback would land. Today
    it is an owner-initiated grant (and how a completed purchase is recorded);
    the money side is a Transaction row, not a live charge — see the note in
    the module docstring.
    """
    org = db.get(Organization, body.org_id)
    if not org:
        raise HTTPException(404, "Organisation not found")
    mod = db.query(Module).filter_by(code=body.module_code).first()
    if not mod:
        raise HTTPException(404, "Microservice not found")

    sub = (db.query(Subscription)
             .filter_by(org_id=org.id, module_code=body.module_code).first())
    expires = datetime.utcnow() + timedelta(days=30 * max(1, body.months))
    if sub:
        sub.status, sub.seats, sub.expires_at = body.status, body.seats, expires
        sub.plan_id = body.plan_id or sub.plan_id
    else:
        sub = Subscription(org_id=org.id, module_code=body.module_code,
                           plan_id=body.plan_id, seats=body.seats,
                           status=body.status, expires_at=expires)
        db.add(sub)
    db.flush()

    if body.record_transaction and body.plan_id:
        plan = db.get(Plan, body.plan_id)
        price = plan.price_for("IN") if plan else None
        if price:
            # Plans are priced flat per billing period, so the charge is the
            # price itself. It used to be multiplied by seats; with per-seat
            # pricing gone that would bill a 10-user grant ten times over.
            db.add(Transaction(
                org_id=org.id, plan_id=plan.id, module_code=body.module_code,
                gateway_code="manual", status="paid",
                amount=float(price.amount),
                currency=price.currency,
                description=f"{mod.name} · {plan.name}",
            ))

    _sync_entitlements(db, org)
    db.commit()
    db.refresh(sub)
    _log(db, p, "subscription_grant", f"{org.name} -> {body.module_code} ({body.status})")

    # The consequence of the sale: if this module is an LMS we integrate with,
    # the tenant must now exist over there with this plan's limits. Best-effort
    # and already-committed above — a briefly unreachable LMS must not undo a
    # completed purchase; `hub:sync-plans` or a re-grant reconciles.
    provisioning = lms_sync.on_subscription_changed(db, sub, org)

    return {"subscription": sub.to_public(), "provisioning": provisioning}


class SubscriptionEdit(BaseModel):
    """Manual adjustment of a live subscription. Every field optional."""
    plan_id: Optional[str] = None
    seats: Optional[int] = None
    status: Optional[str] = None
    auto_renew: Optional[bool] = None
    # Tenure: push the expiry out (or pull it in) by N months, or set a date
    # outright. extend_months is relative to whichever is later — today or the
    # current expiry — so extending an already-expired plan starts from now
    # rather than silently landing in the past.
    extend_months: Optional[int] = None
    expires_at: Optional[str] = None


@router.get("/platform/subscriptions")
def list_subscriptions(org_id: Optional[str] = None,
                       p: Principal = Depends(require_permission(
                           "platform.companies.view", "platform.plans.manage")),
                       db: Session = Depends(get_db)):
    q = db.query(Subscription)
    if org_id:
        q = q.filter(Subscription.org_id == org_id)
    rows = q.order_by(Subscription.created_at.desc()).all()
    names = dict(db.query(Organization.id, Organization.name).all())
    return {"subscriptions": [{**s.to_public(), "orgName": names.get(s.org_id)} for s in rows]}


@router.patch("/platform/subscriptions/{sub_id}")
def edit_subscription(sub_id: str, body: SubscriptionEdit,
                      p: Principal = Depends(require_permission(
                          "platform.companies.update", "platform.plans.manage")),
                      db: Session = Depends(get_db)):
    sub = db.get(Subscription, sub_id)
    if not sub:
        raise HTTPException(404, "Subscription not found")

    if body.plan_id is not None:
        if not db.get(Plan, body.plan_id):
            raise HTTPException(404, "Plan not found")
        sub.plan_id = body.plan_id
    if body.seats is not None:
        sub.seats = max(1, body.seats)
    if body.status is not None:
        sub.status = body.status
    if body.auto_renew is not None:
        sub.auto_renew = body.auto_renew

    if body.expires_at:
        try:
            sub.expires_at = datetime.fromisoformat(body.expires_at.replace("Z", ""))
        except ValueError:
            raise HTTPException(400, "expires_at must be ISO format (YYYY-MM-DD)")

    if body.extend_months:
        now = datetime.utcnow()
        base = sub.expires_at if (sub.expires_at and sub.expires_at > now) else now
        sub.expires_at = base + timedelta(days=30 * body.extend_months)
        # An extension implies the plan is live again; leaving it 'expired'
        # with a future date would be a contradiction the UI could not explain.
        if sub.status == SUB_EXPIRED and body.extend_months > 0:
            sub.status = SUB_ACTIVE

    org = db.get(Organization, sub.org_id)
    if org:
        _sync_entitlements(db, org)
    db.commit()
    db.refresh(sub)
    _log(db, p, "subscription_edit",
         f"{org.name if org else sub.org_id} · {sub.module_code} -> "
         f"{sub.status}, expires {sub.expires_at:%Y-%m-%d}" if sub.expires_at else sub.status)

    if org:
        lms_sync.on_subscription_changed(db, sub, org)

    return {"subscription": sub.to_public()}


@router.delete("/platform/subscriptions/{sub_id}")
def cancel_subscription(sub_id: str,
                        p: Principal = Depends(require_permission(
                            "platform.companies.update", "platform.plans.manage")),
                        db: Session = Depends(get_db)):
    """Cancel and revoke. The row is kept so billing history stays intact."""
    sub = db.get(Subscription, sub_id)
    if not sub:
        raise HTTPException(404, "Subscription not found")
    sub.status = SUB_CANCELLED
    org = db.get(Organization, sub.org_id)
    if org:
        _sync_entitlements(db, org)
    db.commit()
    _log(db, p, "subscription_cancel", f"{org.name if org else ''} · {sub.module_code}")

    # Expire the tenant's membership in the LMS so access ends in step with
    # billing. The tenant record and its content are kept — this is a
    # cancellation, not a deletion.
    if org:
        lms_sync.on_subscription_changed(db, sub, org)

    return {"ok": True, "subscription": sub.to_public()}


# Allow platform owners to update an existing subscription's expiry/seats/status
class SubscriptionUpdate(BaseModel):
    months: Optional[int] = None
    expires_at: Optional[datetime] = None
    seats: Optional[int] = None
    status: Optional[str] = None


@router.patch("/platform/subscriptions/{org_id}/{module_code}")
def update_subscription(org_id: str, module_code: str, body: SubscriptionUpdate,
                        p: Principal = Depends(require_permission("platform.companies.update", "platform.plans.manage")),
                        db: Session = Depends(get_db)):
    org = db.get(Organization, org_id)
    if not org:
        raise HTTPException(404, "Organisation not found")
    sub = db.query(Subscription).filter_by(org_id=org.id, module_code=module_code).first()
    if not sub:
        raise HTTPException(404, "Subscription not found")

    # Update seats/status
    if body.seats is not None:
        sub.seats = int(body.seats)
    if body.status is not None:
        sub.status = body.status

    # Update expiry: either explicit datetime or months offset
    if body.expires_at is not None:
        # accept naive ISO datetime strings via Pydantic; assign directly
        sub.expires_at = body.expires_at
    elif body.months is not None:
        months = max(1, int(body.months))
        sub.expires_at = datetime.utcnow() + timedelta(days=30 * months)

    db.flush()
    _sync_entitlements(db, org)
    db.commit()
    db.refresh(sub)
    _log(db, p, "subscription_update", f"Updated subscription {org.name} -> {module_code}")

    lms_sync.on_subscription_changed(db, sub, org)

    return {"subscription": sub.to_public()}
