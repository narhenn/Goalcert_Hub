"""
models.py — the multi-tenant identity model.

Organisation (tenant) ─┬─ has many Users
                       ├─ has entitlements  (which of the 3 platforms it adopted)
                       └─ has a persona policy (which persona may use which platform)

Roles map to personas. super_admin is the platform owner and is NOT scoped to an
org; everyone else belongs to exactly one org.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db import Base

# ── Role model ────────────────────────────────────────────────────────
# super_admin  — platform owner: manages orgs, admins, entitlements (cross-org)
# admin        — org admin (HR/IT): manages users + roles within their org
# coo/compliance/lnd/supervisor/frontline — operational personas
ROLES = ["super_admin", "admin", "coo", "compliance", "lnd", "supervisor", "frontline"]
PERSONA_ROLES = ["admin", "coo", "compliance", "lnd", "supervisor", "frontline"]

# who may assign which roles
ASSIGNABLE_BY = {
    "super_admin": ["admin", "coo", "compliance", "lnd", "supervisor", "frontline"],
    "admin": ["coo", "compliance", "lnd", "supervisor", "frontline"],
}

# default org entitlements + persona policy (mirrors the frontend registry)
DEFAULT_ENTITLEMENTS = ["twin", "scenario", "agentic", "hivemind", "frontline", "supervisor"]
DEFAULT_POLICY = {
    "frontline": ["twin", "scenario", "agentic"],
    "supervisor": ["twin", "agentic"],
    "lnd": ["scenario", "agentic", "hivemind"],
    "compliance": ["twin", "scenario"],
    "coo": ["twin", "agentic", "hivemind"],
    "admin": ["twin", "scenario", "agentic", "hivemind"],
}

STATUSES = ["active", "pending", "disabled"]


def _uuid() -> str:
    return uuid.uuid4().hex


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    slug: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="active")
    # which of the 3 platforms (+ hive/frontline/supervisor modules) this tenant adopted
    entitlements: Mapped[list] = mapped_column(JSON, default=list)
    # persona -> [module ids] this tenant allows
    policy: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    users: Mapped[list["User"]] = relationship(back_populates="org", cascade="all, delete-orphan")

    def to_public(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "slug": self.slug,
            "status": self.status,
            "entitlements": self.entitlements or [],
            "policy": self.policy or {},
            "userCount": len(self.users),
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(200), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(160), default="")
    password_hash: Mapped[str] = mapped_column(String(200), nullable=False)
    role: Mapped[str] = mapped_column(String(24), nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="active")
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=True)

    org_id: Mapped[str | None] = mapped_column(ForeignKey("organizations.id"), nullable=True)
    org: Mapped["Organization | None"] = relationship(back_populates="users")

    created_by: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_login: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    def to_public(self) -> dict:
        return {
            "id": self.id,
            "email": self.email,
            "fullName": self.full_name,
            "role": self.role,
            "status": self.status,
            "mustChangePassword": self.must_change_password,
            "orgId": self.org_id,
            "orgName": self.org.name if self.org else None,
            "entitlements": (self.org.entitlements if self.org else DEFAULT_ENTITLEMENTS) or [],
            "policy": (self.org.policy if self.org else DEFAULT_POLICY) or {},
            "createdAt": self.created_at.isoformat() if self.created_at else None,
            "lastLogin": self.last_login.isoformat() if self.last_login else None,
        }


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    actor_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    actor_email: Mapped[str] = mapped_column(String(200), default="")
    org_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    action: Mapped[str] = mapped_column(String(64), default="")
    detail: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    def to_public(self) -> dict:
        return {
            "id": self.id,
            "actorEmail": self.actor_email,
            "orgId": self.org_id,
            "action": self.action,
            "detail": self.detail,
            "createdAt": self.created_at.isoformat() if self.created_at else None,
        }
