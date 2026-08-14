"""
rbac.py — authorisation resolution and enforcement.

The one rule this module exists to enforce: **code asks for a permission, never
for a role**. `require_permission("company.users.create")` survives a customer
inventing their own role; `require_roles("admin")` does not.

Everything here reads the database. There is no permission list in Python — the
only constant is the name of the cross-tenant override, and that is itself a
row you can delete.
"""
from __future__ import annotations

import logging
from functools import lru_cache

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session, selectinload

from db import get_db
from deps import get_current_user
from models import User
from rbac_models import (LEVEL_COMPANY, LEVEL_PLATFORM, DashboardPermission,
                         DashboardWidget, Menu, Permission, Role,
                         RolePermission, SidebarPermission, UserRole)

logger = logging.getLogger("hub-backend")

# The single escape hatch: a platform operator holding this may act on any
# tenant's data. It is a permission row like any other — revoke it and the
# bypass disappears without a deploy.
CROSS_TENANT = "platform.tenants.impersonate"


# ── resolution ────────────────────────────────────────────────────────

def user_permissions(db: Session, user: User) -> set[str]:
    """
    Every permission code this user holds, via every role granted to them.

    One query, joined — not a loop over roles. This runs on every guarded
    request, so it must never become N+1.
    """
    rows = (db.query(Permission.code)
              .join(RolePermission, RolePermission.permission_id == Permission.id)
              .join(UserRole, UserRole.role_id == RolePermission.role_id)
              .filter(UserRole.user_id == user.id)
              .distinct()
              .all())
    return {r[0] for r in rows}


def user_roles(db: Session, user: User) -> list[Role]:
    return (db.query(Role)
              .join(UserRole, UserRole.role_id == Role.id)
              .filter(UserRole.user_id == user.id, Role.deleted_at.is_(None))
              .order_by(Role.sort_order)
              .all())


def user_level(roles: list[Role]) -> str:
    """Platform beats company: holding any platform role makes you an operator."""
    return LEVEL_PLATFORM if any(r.level == LEVEL_PLATFORM for r in roles) else LEVEL_COMPANY


def has_permission(held: set[str], code: str) -> bool:
    """
    Does this permission set satisfy `code`?

    Two ways to pass:
      • the exact code is held, or
      • a `<scope>.<resource>.manage` grant covers any action on that resource
        (so "manage" implies view/create/update/delete without listing them).
    """
    if code in held:
        return True
    scope_resource = code.rsplit(".", 1)[0]
    return f"{scope_resource}.manage" in held


# ── dependencies ──────────────────────────────────────────────────────

class Principal:
    """The authenticated caller plus their resolved rights — what routes receive."""

    def __init__(self, user: User, roles: list[Role], permissions: set[str]):
        self.user = user
        self.roles = roles
        self.permissions = permissions
        self.level = user_level(roles)
        self.org_id = user.org_id
        self.is_platform = self.level == LEVEL_PLATFORM
        self.cross_tenant = CROSS_TENANT in permissions

    def can(self, code: str) -> bool:
        if has_permission(self.permissions, code):
            return True
        # A platform operator with the override satisfies company-scope checks;
        # that is how "view every tenant's data" is expressed without giving
        # platform roles company permissions they could never be scoped by.
        return self.cross_tenant and code.startswith("company.")

    def may_touch_org(self, org_id: str | None) -> bool:
        """Tenant isolation. The only place this question is answered."""
        if self.cross_tenant:
            return True
        return org_id is not None and org_id == self.org_id

    def assert_org(self, org_id: str | None) -> None:
        if not self.may_touch_org(org_id):
            raise HTTPException(403, "Outside your organisation")


def get_principal(user: User = Depends(get_current_user),
                  db: Session = Depends(get_db)) -> Principal:
    roles = user_roles(db, user)
    return Principal(user, roles, user_permissions(db, user))


def require_permission(*codes: str, require_all: bool = False):
    """
    Guard an endpoint by capability.

        @router.post("/users", dependencies=[Depends(require_permission("company.users.create"))])

    Several codes are OR by default (any one grants access); pass
    require_all=True when the endpoint genuinely needs every one.
    """
    def guard(p: Principal = Depends(get_principal)) -> Principal:
        ok = all(p.can(c) for c in codes) if require_all else any(p.can(c) for c in codes)
        if not ok:
            raise HTTPException(
                status_code=403,
                detail=f"Missing permission: {' and '.join(codes) if require_all else ' or '.join(codes)}",
            )
        return p
    return guard


# ── navigation ────────────────────────────────────────────────────────

def navigation_for(db: Session, p: Principal, entitlements: list[str]) -> list[dict]:
    """
    The sidebar this principal may see, as a tree.

    Three gates, in order:
      1. level      — platform entries never render for a company user
      2. module     — an entry tied to a module the tenant has not adopted is out
      3. permission — the viewer must hold at least ONE mapped permission
    A parent left with no visible children and no route of its own is dropped,
    so the sidebar never shows a heading that opens nothing.
    """
    menus = (db.query(Menu)
               .options(selectinload(Menu.permissions).selectinload(SidebarPermission.permission))
               .filter(Menu.is_visible.is_(True), Menu.deleted_at.is_(None))
               .order_by(Menu.sort_order)
               .all())

    ent = set(entitlements or [])

    def visible(m: Menu) -> bool:
        if m.level != p.level:
            return False
        if m.module_code and not p.is_platform and m.module_code not in ent:
            return False
        codes = [sp.permission.code for sp in m.permissions if sp.permission]
        if not codes:
            return True          # unmapped entry — visible to anyone who sees the sidebar
        return any(p.can(c) for c in codes)

    allowed = [m for m in menus if visible(m)]
    by_id = {m.id: m for m in allowed}
    children: dict[str, list[Menu]] = {}
    roots: list[Menu] = []

    for m in allowed:
        if m.parent_id and m.parent_id in by_id:
            children.setdefault(m.parent_id, []).append(m)
        elif m.parent_id and m.parent_id not in by_id:
            continue             # parent filtered out → child goes with it
        else:
            roots.append(m)

    out = []
    for m in roots:
        kids = [c.to_public() for c in sorted(children.get(m.id, []), key=lambda x: x.sort_order)]
        if not kids and not m.route:
            continue             # empty heading
        out.append(m.to_public(children=kids))
    return out


def dashboard_for(db: Session, p: Principal) -> list[dict]:
    """
    The widgets this principal may see. A widget is granted by permission OR by
    role code; an ungranted widget is visible to everyone at that level.
    """
    widgets = (db.query(DashboardWidget)
                 .options(selectinload(DashboardWidget.grants)
                          .selectinload(DashboardPermission.permission))
                 .filter(DashboardWidget.is_visible.is_(True),
                         DashboardWidget.deleted_at.is_(None),
                         DashboardWidget.level == p.level)
                 .order_by(DashboardWidget.sort_order)
                 .all())

    role_codes = {r.code for r in p.roles}
    out = []
    for w in widgets:
        grants = w.grants
        if not grants:
            out.append(w.to_public())
            continue
        ok = any(
            (g.permission and p.can(g.permission.code)) or
            (g.role_code and g.role_code in role_codes)
            for g in grants
        )
        if ok:
            out.append(w.to_public())
    return out
