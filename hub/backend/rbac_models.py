"""
rbac_models.py — the database-driven access-control model.

Nothing in this file encodes *which* roles or permissions exist. It encodes the
shape they take. The catalogue itself is rows, seeded by rbac_seed.py and
editable at runtime, so adding a role or re-pointing a menu is an INSERT, never
a deploy.

Two administrative levels, one mechanism
────────────────────────────────────────
    level='platform'   the SaaS operator. Not a member of any tenant
                       (org_id IS NULL). Sees and administers everything.
    level='company'    a tenant's own people. Every grant is bounded by org_id.

A role with org_id IS NULL and is_template=1 is a *blueprint*: the catalogue of
company roles the platform ships. Provisioning a tenant clones the blueprints
into that tenant, so a company can then edit its own copy without touching
anyone else's — the model Salesforce/ServiceNow use for out-of-the-box roles.

Authorisation is a permission check, never a role check
───────────────────────────────────────────────────────
Code asks `require_permission("company.users.create")`. It never asks "is this
user an admin". Roles are only a way to bundle permissions for humans to
administer, which is what keeps them editable without touching code.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (JSON, Boolean, DateTime, ForeignKey, Integer, String,
                        Text, UniqueConstraint)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from db import Base


def _uuid() -> str:
    return uuid.uuid4().hex


# The two administrative planes. Stored as a short string rather than a native
# ENUM so adding a plane later is a data change, not an ALTER on every dialect.
LEVEL_PLATFORM = "platform"
LEVEL_COMPANY = "company"


class TimestampMixin:
    """created/updated/deleted on every governed table — the audit floor."""
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)


# ══ Permission catalogue ═══════════════════════════════════════════════

class PermissionGroup(Base, TimestampMixin):
    """A drawer in the role editor — 'User Management', 'Billing', 'Platform'."""
    __tablename__ = "permission_groups"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    level: Mapped[str] = mapped_column(String(16), default=LEVEL_COMPANY, index=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    permissions: Mapped[list["Permission"]] = relationship(
        back_populates="group", order_by="Permission.sort_order")

    def to_public(self) -> dict:
        return {
            "id": self.id, "code": self.code, "name": self.name,
            "description": self.description, "level": self.level,
            "sortOrder": self.sort_order,
        }


class Permission(Base, TimestampMixin):
    """
    One atomic capability, addressed as `<scope>.<resource>.<action>`
    (e.g. `company.users.create`). Code is the contract the backend asserts on
    and the frontend gates with; everything else is presentation.
    """
    __tablename__ = "permissions"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    code: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")

    # Which plane may ever hold it. A company role can never be granted a
    # 'platform' permission — enforced when permissions are attached to a role.
    level: Mapped[str] = mapped_column(String(16), default=LEVEL_COMPANY, index=True)
    resource: Mapped[str] = mapped_column(String(64), default="", index=True)
    action: Mapped[str] = mapped_column(String(32), default="", index=True)

    group_id: Mapped[str | None] = mapped_column(
        ForeignKey("permission_groups.id", ondelete="SET NULL"), nullable=True, index=True)
    group: Mapped["PermissionGroup | None"] = relationship(back_populates="permissions")

    # System permissions are shipped by the platform and cannot be deleted;
    # a tenant may still choose not to grant them.
    is_system: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    def to_public(self) -> dict:
        return {
            "id": self.id, "code": self.code, "name": self.name,
            "description": self.description, "level": self.level,
            "resource": self.resource, "action": self.action,
            "groupId": self.group_id, "isSystem": self.is_system,
        }


# ══ Roles ══════════════════════════════════════════════════════════════

class Role(Base, TimestampMixin):
    """
    A named bundle of permissions.

    org_id IS NULL + is_template=1 → a blueprint shipped by the platform.
    org_id IS NULL + is_template=0 → a platform-operator role.
    org_id = <tenant>              → that tenant's own role, editable by them.
    """
    __tablename__ = "roles"
    __table_args__ = (UniqueConstraint("org_id", "code", name="uq_roles_org_code"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    code: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")

    level: Mapped[str] = mapped_column(String(16), default=LEVEL_COMPANY, index=True)
    org_id: Mapped[str | None] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True, index=True)

    is_template: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    # Shipped roles: renamable and re-permissionable, but never deletable —
    # otherwise a tenant can strip its own last administrator.
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    # Handed to new members of the tenant when no role is specified.
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)
    # A read-only role: the API refuses every non-view permission on it.
    is_readonly: Mapped[bool] = mapped_column(Boolean, default=False)

    icon: Mapped[str] = mapped_column(String(64), default="ti-user")
    color: Mapped[str] = mapped_column(String(16), default="#6d28d9")
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    permissions: Mapped[list["RolePermission"]] = relationship(
        back_populates="role", cascade="all, delete-orphan")
    assignments: Mapped[list["UserRole"]] = relationship(
        back_populates="role", cascade="all, delete-orphan")

    def permission_codes(self) -> list[str]:
        return sorted(rp.permission.code for rp in self.permissions if rp.permission)

    def to_public(self, with_permissions: bool = False) -> dict:
        out = {
            "id": self.id, "code": self.code, "name": self.name,
            "description": self.description, "level": self.level,
            "orgId": self.org_id, "isTemplate": self.is_template,
            "isSystem": self.is_system, "isDefault": self.is_default,
            "isReadonly": self.is_readonly, "icon": self.icon, "color": self.color,
            "sortOrder": self.sort_order,
            "userCount": len(self.assignments),
        }
        if with_permissions:
            out["permissions"] = self.permission_codes()
        return out


class RolePermission(Base):
    """role ↔ permission. Composite PK: a grant is either present or it isn't."""
    __tablename__ = "role_permissions"

    role_id: Mapped[str] = mapped_column(
        ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True)
    permission_id: Mapped[str] = mapped_column(
        ForeignKey("permissions.id", ondelete="CASCADE"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    role: Mapped["Role"] = relationship(back_populates="permissions")
    permission: Mapped["Permission"] = relationship(lazy="joined")


class UserRole(Base):
    """
    user ↔ role, with the tenant it was granted in.

    org_id is denormalised deliberately: every authorisation query filters by
    tenant, and carrying it here means resolving a user's rights never has to
    join back through roles to find out which tenant a grant belongs to.
    """
    __tablename__ = "user_roles"

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    role_id: Mapped[str] = mapped_column(
        ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True)
    org_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    assigned_by: Mapped[str | None] = mapped_column(String(32), nullable=True)
    assigned_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    role: Mapped["Role"] = relationship(back_populates="assignments", lazy="joined")


# ══ Sidebar ════════════════════════════════════════════════════════════

class Menu(Base, TimestampMixin):
    """
    One sidebar entry. parent_id gives unlimited nesting; the API returns two
    levels because that is what the shell renders, not because the model says so.
    """
    __tablename__ = "menus"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    label: Mapped[str] = mapped_column(String(120), nullable=False)
    icon: Mapped[str] = mapped_column(String(64), default="ti-circle")
    # The frontend route id this entry activates. Null for a pure grouping row.
    route: Mapped[str | None] = mapped_column(String(64), nullable=True)

    parent_id: Mapped[str | None] = mapped_column(
        ForeignKey("menus.id", ondelete="CASCADE"), nullable=True, index=True)
    children: Mapped[list["Menu"]] = relationship(
        back_populates="parent", cascade="all, delete-orphan",
        order_by="Menu.sort_order", single_parent=True)
    parent: Mapped["Menu | None"] = relationship(back_populates="children", remote_side="Menu.id")

    level: Mapped[str] = mapped_column(String(16), default=LEVEL_COMPANY, index=True)
    # Optional entitlement gate: hide unless the tenant has adopted this module.
    module_code: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    section: Mapped[str] = mapped_column(String(64), default="")

    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_visible: Mapped[bool] = mapped_column(Boolean, default=True)
    is_system: Mapped[bool] = mapped_column(Boolean, default=True)

    permissions: Mapped[list["SidebarPermission"]] = relationship(
        back_populates="menu", cascade="all, delete-orphan")

    def to_public(self, children: list | None = None) -> dict:
        return {
            "id": self.id, "code": self.code, "label": self.label, "icon": self.icon,
            "route": self.route, "section": self.section, "level": self.level,
            "moduleCode": self.module_code, "sortOrder": self.sort_order,
            "isVisible": self.is_visible,
            "permissions": [sp.permission.code for sp in self.permissions if sp.permission],
            "children": children if children is not None else [],
        }


class SidebarPermission(Base):
    """
    menu ↔ permission. A menu is shown when the viewer holds ANY mapped
    permission (OR, not AND) — an entry with no mapping is visible to everyone
    who can see the sidebar at all.
    """
    __tablename__ = "sidebar_permissions"
    __table_args__ = (UniqueConstraint("menu_id", "permission_id", name="uq_sidebar_menu_perm"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    menu_id: Mapped[str] = mapped_column(ForeignKey("menus.id", ondelete="CASCADE"), index=True)
    permission_id: Mapped[str] = mapped_column(
        ForeignKey("permissions.id", ondelete="CASCADE"), index=True)

    menu: Mapped["Menu"] = relationship(back_populates="permissions")
    permission: Mapped["Permission"] = relationship(lazy="joined")


# ══ Dashboard ══════════════════════════════════════════════════════════

class DashboardWidget(Base, TimestampMixin):
    """
    A tile on a role's landing page. `component` names a React component the
    shell knows how to render; `config` carries its props, so a new arrangement
    of existing components is pure data.
    """
    __tablename__ = "dashboard_widgets"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    subtitle: Mapped[str] = mapped_column(String(240), default="")
    component: Mapped[str] = mapped_column(String(64), nullable=False)

    level: Mapped[str] = mapped_column(String(16), default=LEVEL_COMPANY, index=True)
    size: Mapped[str] = mapped_column(String(16), default="md")   # sm | md | lg | full
    icon: Mapped[str] = mapped_column(String(64), default="ti-chart-bar")
    color: Mapped[str] = mapped_column(String(16), default="#6d28d9")
    config: Mapped[dict] = mapped_column(JSON, default=dict)

    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_visible: Mapped[bool] = mapped_column(Boolean, default=True)

    grants: Mapped[list["DashboardPermission"]] = relationship(
        back_populates="widget", cascade="all, delete-orphan")

    def to_public(self) -> dict:
        return {
            "id": self.id, "code": self.code, "title": self.title,
            "subtitle": self.subtitle, "component": self.component,
            "size": self.size, "icon": self.icon, "color": self.color,
            "config": self.config or {}, "sortOrder": self.sort_order,
        }


class DashboardPermission(Base):
    """
    widget ↔ (permission | role). Either column may be set: map by permission
    for capability-driven tiles, by role when a tile is simply "the COO's".
    """
    __tablename__ = "dashboard_permissions"
    # Grants key on role *code*, not id: role rows are cloned per tenant, so an
    # id would only ever match one company's copy.
    __table_args__ = (
        UniqueConstraint("widget_id", "permission_id", "role_code", name="uq_dash_widget_grant"),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    widget_id: Mapped[str] = mapped_column(
        ForeignKey("dashboard_widgets.id", ondelete="CASCADE"), index=True)
    permission_id: Mapped[str | None] = mapped_column(
        ForeignKey("permissions.id", ondelete="CASCADE"), nullable=True, index=True)
    role_code: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)

    widget: Mapped["DashboardWidget"] = relationship(back_populates="grants")
    permission: Mapped["Permission | None"] = relationship(lazy="joined")


# ══ Microservice registry ══════════════════════════════════════════════

class Module(Base, TimestampMixin):
    """
    A microservice the platform offers. Replaces the hardcoded SERVICES dict:
    the gateway resolves its upstream from these rows, and the catalogue the UI
    renders is the same table.
    """
    __tablename__ = "modules"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    code: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(64), default="", index=True)
    version: Mapped[str] = mapped_column(String(32), default="1.0.0")
    status: Mapped[str] = mapped_column(String(24), default="active", index=True)

    # One-line hook shown on the marketplace card, and the bullet list the
    # public product page renders. Both are content the owner edits, not code.
    tagline: Mapped[str] = mapped_column(String(240), default="")
    features: Mapped[list] = mapped_column(JSON, default=list)
    # Off the marketplace entirely — for a service being built or retired.
    is_public: Mapped[bool] = mapped_column(Boolean, default=True)

    icon: Mapped[str] = mapped_column(String(64), default="ti-box")
    color: Mapped[str] = mapped_column(String(16), default="#6d28d9")
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    banner_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Marketplace card art and the "Preview" clip. Uploaded through the storage
    # layer, so these hold whatever URL the active driver returned.
    thumbnail_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    preview_video_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    redirect_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    login_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    permissions: Mapped[list["ModulePermission"]] = relationship(
        back_populates="module", cascade="all, delete-orphan")

    def to_public(self) -> dict:
        return {
            "id": self.id, "code": self.code, "name": self.name,
            "description": self.description, "tagline": self.tagline,
            "features": self.features or [], "category": self.category,
            "version": self.version, "status": self.status, "icon": self.icon,
            "color": self.color, "logoUrl": self.logo_url, "bannerUrl": self.banner_url,
            "thumbnailUrl": self.thumbnail_url, "previewVideoUrl": self.preview_video_url,
            "redirectUrl": self.redirect_url, "loginUrl": self.login_url,
            "isActive": self.is_active, "isPublic": self.is_public,
            "sortOrder": self.sort_order,
        }


class ModulePermission(Base):
    """module ↔ permission: what holding this module lets you do."""
    __tablename__ = "module_permissions"
    __table_args__ = (UniqueConstraint("module_id", "permission_id", name="uq_module_perm"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    module_id: Mapped[str] = mapped_column(ForeignKey("modules.id", ondelete="CASCADE"), index=True)
    permission_id: Mapped[str] = mapped_column(
        ForeignKey("permissions.id", ondelete="CASCADE"), index=True)

    module: Mapped["Module"] = relationship(back_populates="permissions")
    permission: Mapped["Permission"] = relationship(lazy="joined")
