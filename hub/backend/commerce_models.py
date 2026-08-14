"""
commerce_models.py — catalogue, pricing, entitlement and money.

The chain this models, end to end:

    Module      what the platform sells (created by the platform owner)
      └─ Plan          a purchasable tier of that module
           └─ PlanPrice     what that tier costs, per country/currency
    Subscription   which tenant currently holds which module — the ONLY
                   answer to "is this unlocked", so the marketplace lock and
                   the sidebar can never disagree
    Transaction    money that moved
    Enquiry        a custom-quote request from the public pricing page

Design note on entitlement: `organizations.entitlements` (a JSON list) predates
this and still gates the gateway. Subscription is now the source of truth and
writes back into that list when it changes, so one concept has one home while
the older code path keeps working.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (JSON, Boolean, DateTime, ForeignKey, Integer, Numeric,
                        String, Text, UniqueConstraint)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db import Base
from rbac_models import TimestampMixin


def _uuid() -> str:
    return uuid.uuid4().hex


# What a tier's primary button does — mirrors the existing public funnel.
ACTION_SIGNUP = "signup"        # self-serve checkout
ACTION_TRIAL = "trial"          # 30-day trial form
ACTION_ENTERPRISE = "enterprise"  # guided sales / quote

SUB_ACTIVE = "active"
SUB_TRIAL = "trial"
SUB_EXPIRED = "expired"
SUB_CANCELLED = "cancelled"


class Plan(Base, TimestampMixin):
    """
    A purchasable tier. `module_id` NULL means a bundle spanning every module,
    which is how "buy the whole suite" is expressed without a special case.
    """
    __tablename__ = "plans"
    __table_args__ = (UniqueConstraint("module_id", "code", name="uq_plan_module_code"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    module_id: Mapped[str | None] = mapped_column(
        ForeignKey("modules.id", ondelete="CASCADE"), nullable=True, index=True)
    code: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")

    # What the buyer gets, and what this tier deliberately excludes. Both are
    # lists of strings so the pricing card renders straight from the row.
    features: Mapped[list] = mapped_column(JSON, default=list)
    excluded: Mapped[list] = mapped_column(JSON, default=list)
    limits: Mapped[dict] = mapped_column(JSON, default=dict)   # {seats: 8, twins: 5}

    billing_cycle: Mapped[str] = mapped_column(String(24), default="yearly")  # monthly|yearly|one_time
    scope: Mapped[str] = mapped_column(String(160), default="")   # "training centre · 4 plants"
    action: Mapped[str] = mapped_column(String(24), default=ACTION_SIGNUP)

    # Pricing is flat per billing period, not per seat. `unit` and `min_qty` are
    # the retired per-seat columns: kept so existing rows are not rewritten, no
    # longer written or published. Nothing reads them.
    unit: Mapped[str] = mapped_column(String(32), default="")
    min_qty: Mapped[int] = mapped_column(Integer, default=1)

    is_popular: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    # ── custom quotes ──
    # A custom plan is a quote written for one enquiry. It never appears on the
    # public pricing page or in the tenant marketplace: it exists so a bespoke
    # request can be priced, granted and invoiced through the same machinery as
    # a listed tier, without polluting the catalogue everyone else sees.
    is_custom: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    enquiry_id: Mapped[str | None] = mapped_column(
        ForeignKey("enquiries.id", ondelete="SET NULL"), nullable=True, index=True)
    quoted_to: Mapped[str] = mapped_column(String(200), default="")   # contact the quote went to

    module: Mapped["object"] = relationship("Module", lazy="joined")
    prices: Mapped[list["PlanPrice"]] = relationship(
        back_populates="plan", cascade="all, delete-orphan", lazy="selectin")

    def price_for(self, country: str = "IN") -> "PlanPrice | None":
        """Country price if one exists, else the plan's default."""
        exact = next((p for p in self.prices if p.country_code == country), None)
        return exact or next((p for p in self.prices if p.is_default), None) or \
            (self.prices[0] if self.prices else None)

    def to_public(self, country: str = "IN") -> dict:
        p = self.price_for(country)
        return {
            "id": self.id, "moduleId": self.module_id,
            "moduleCode": self.module.code if self.module else None,
            "code": self.code, "name": self.name, "description": self.description,
            "features": self.features or [], "excluded": self.excluded or [],
            "limits": self.limits or {}, "billingCycle": self.billing_cycle,
            "scope": self.scope, "action": self.action,
            "isPopular": self.is_popular,
            "isActive": self.is_active, "sortOrder": self.sort_order,
            "isCustom": self.is_custom, "enquiryId": self.enquiry_id,
            "quotedTo": self.quoted_to,
            "price": p.to_public() if p else None,
            "prices": [x.to_public() for x in self.prices],
        }


class PlanPrice(Base, TimestampMixin):
    """Country pricing. One row per (plan, country); one is flagged default."""
    __tablename__ = "plan_prices"
    __table_args__ = (UniqueConstraint("plan_id", "country_code", name="uq_price_plan_country"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    plan_id: Mapped[str] = mapped_column(ForeignKey("plans.id", ondelete="CASCADE"), index=True)
    country_code: Mapped[str] = mapped_column(String(4), default="IN", index=True)
    currency: Mapped[str] = mapped_column(String(4), default="INR")
    # Numeric, never float — money that rounds is money that is wrong.
    amount: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    # Flat price per billing period: "/yr", "/mo", or "" for a one-time fee.
    period: Mapped[str] = mapped_column(String(32), default="/yr")
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)

    plan: Mapped["Plan"] = relationship(back_populates="prices")

    def to_public(self) -> dict:
        return {
            "id": self.id, "countryCode": self.country_code, "currency": self.currency,
            "amount": float(self.amount or 0), "period": self.period,
            "isDefault": self.is_default,
        }


class Subscription(Base, TimestampMixin):
    """
    What a tenant currently holds. The marketplace lock, the sidebar and the
    gateway all resolve through this — one question, one answer.
    """
    __tablename__ = "subscriptions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    org_id: Mapped[str] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True, nullable=False)
    module_code: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    plan_id: Mapped[str | None] = mapped_column(
        ForeignKey("plans.id", ondelete="SET NULL"), nullable=True)

    status: Mapped[str] = mapped_column(String(24), default=SUB_ACTIVE, index=True)
    seats: Mapped[int] = mapped_column(Integer, default=1)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    auto_renew: Mapped[bool] = mapped_column(Boolean, default=True)

    plan: Mapped["Plan | None"] = relationship(lazy="joined")

    @property
    def is_live(self) -> bool:
        if self.status not in (SUB_ACTIVE, SUB_TRIAL):
            return False
        return self.expires_at is None or self.expires_at > datetime.utcnow()

    def to_public(self) -> dict:
        return {
            "id": self.id, "orgId": self.org_id, "moduleCode": self.module_code,
            "planId": self.plan_id, "planName": self.plan.name if self.plan else None,
            "status": self.status, "seats": self.seats, "isLive": self.is_live,
            "startedAt": self.started_at.isoformat() if self.started_at else None,
            "expiresAt": self.expires_at.isoformat() if self.expires_at else None,
            "autoRenew": self.auto_renew,
        }


class PaymentGateway(Base, TimestampMixin):
    """
    Gateway configuration, owned by the platform.

    `config` holds credentials. to_public() NEVER returns it — the admin UI
    shows which keys are set, never their values, so an over-the-shoulder look
    at the settings screen cannot leak a live secret key.
    """
    __tablename__ = "payment_gateways"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True)  # stripe|razorpay|paypal
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    is_test_mode: Mapped[bool] = mapped_column(Boolean, default=True)
    currencies: Mapped[list] = mapped_column(JSON, default=list)
    config: Mapped[dict] = mapped_column(JSON, default=dict)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    def to_public(self) -> dict:
        cfg = self.config or {}
        return {
            "id": self.id, "code": self.code, "name": self.name,
            "isEnabled": self.is_enabled, "isTestMode": self.is_test_mode,
            "currencies": self.currencies or [],
            # which credentials exist — never what they are
            "configuredKeys": sorted(k for k, v in cfg.items() if v),
            "isConfigured": bool(cfg and any(cfg.values())),
            "sortOrder": self.sort_order,
        }


class Transaction(Base, TimestampMixin):
    """Money that moved. Also the source of the earnings figures on the dashboard."""
    __tablename__ = "transactions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    org_id: Mapped[str | None] = mapped_column(
        ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True, index=True)
    plan_id: Mapped[str | None] = mapped_column(
        ForeignKey("plans.id", ondelete="SET NULL"), nullable=True)
    module_code: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)

    gateway_code: Mapped[str] = mapped_column(String(32), default="manual", index=True)
    reference: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    amount: Mapped[float] = mapped_column(Numeric(12, 2), default=0)
    currency: Mapped[str] = mapped_column(String(4), default="INR")
    # pending | paid | failed | refunded
    status: Mapped[str] = mapped_column(String(24), default="pending", index=True)
    description: Mapped[str] = mapped_column(String(240), default="")
    meta: Mapped[dict] = mapped_column(JSON, default=dict)

    def to_public(self, org_name: str | None = None) -> dict:
        return {
            "id": self.id, "orgId": self.org_id, "orgName": org_name,
            "planId": self.plan_id, "moduleCode": self.module_code,
            "gateway": self.gateway_code, "reference": self.reference,
            "amount": float(self.amount or 0), "currency": self.currency,
            "status": self.status, "description": self.description,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }


class Enquiry(Base, TimestampMixin):
    """
    A custom-quote request raised from the public pricing page when a visitor
    picks more than one service (or lands on an enterprise tier).

    `notified_at` records whether the sales alert actually went out. It stays
    NULL when no SMTP is configured, so the inbox can show "not emailed" rather
    than implying someone was told.
    """
    __tablename__ = "enquiries"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    company: Mapped[str] = mapped_column(String(160), default="")
    contact_name: Mapped[str] = mapped_column(String(160), default="")
    email: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    phone: Mapped[str] = mapped_column(String(40), default="")
    country: Mapped[str] = mapped_column(String(80), default="")

    module_codes: Mapped[list] = mapped_column(JSON, default=list)
    seats: Mapped[int] = mapped_column(Integer, default=0)
    message: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[str] = mapped_column(String(40), default="pricing")

    # new | contacted | quoted | won | lost
    status: Mapped[str] = mapped_column(String(24), default="new", index=True)
    assigned_to: Mapped[str | None] = mapped_column(String(200), nullable=True)
    internal_note: Mapped[str] = mapped_column(Text, default="")
    notified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    def to_public(self) -> dict:
        return {
            "id": self.id, "company": self.company, "contactName": self.contact_name,
            "email": self.email, "phone": self.phone, "country": self.country,
            "moduleCodes": self.module_codes or [], "seats": self.seats,
            "message": self.message, "source": self.source, "status": self.status,
            "assignedTo": self.assigned_to, "internalNote": self.internal_note,
            "notified": self.notified_at is not None,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }
