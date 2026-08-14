"""
rbac_seed.py — installs the shipped catalogue and provisions tenants.

Idempotent by construction. Every step is get-or-create, and it never
overwrites a role's permissions once that role exists: a tenant that has
customised "Line Supervisor" keeps their customisation across every deploy.
That is the difference between seeding and resetting, and getting it wrong is
how a release silently revokes somebody's access.

Run order (all safe to repeat):
    1. permission groups + permissions   — the catalogue
    2. platform roles                    — the SaaS operator's own roles
    3. company role blueprints           — org_id NULL, is_template=1
    4. menus + sidebar permission map
    5. dashboard widgets + grants
    6. module registry
    7. per-tenant provisioning           — clone blueprints into each org
    8. backfill                          — legacy users.role -> user_roles
"""
from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from db import SessionLocal
from models import Organization, User
from rbac_catalog import (COMPANY_ROLES, GROUPS, MENUS, MODULES, PERMISSIONS,
                          PLATFORM_ROLES, RETIRED_MENUS, WIDGETS, _is_view)
from rbac_models import (LEVEL_COMPANY, LEVEL_PLATFORM, DashboardPermission,
                         DashboardWidget, Menu, Module, ModulePermission,
                         Permission, PermissionGroup, Role, RolePermission,
                         SidebarPermission, UserRole)

logger = logging.getLogger("hub-backend")

# The legacy single-role column mapped onto the new role codes. Only consulted
# once per user, to move them across; after that user_roles is the truth.
LEGACY_ROLE_MAP = {
    "super_admin": "platform_owner",
    "admin": "company_admin",
    "coo": "coo",
    "supervisor": "supervisor",
    "frontline": "frontline",
    "lnd": "lnd",
    "compliance": "compliance",
}


# ── catalogue ─────────────────────────────────────────────────────────

def _seed_permissions(db: Session) -> dict[str, Permission]:
    groups: dict[str, PermissionGroup] = {}
    for code, name, level, sort in GROUPS:
        g = db.query(PermissionGroup).filter_by(code=code).first()
        if not g:
            g = PermissionGroup(code=code, name=name, level=level, sort_order=sort)
            db.add(g)
        groups[code] = g
    db.flush()

    perms: dict[str, Permission] = {}
    for i, (code, name, group_code, level) in enumerate(PERMISSIONS):
        p = db.query(Permission).filter_by(code=code).first()
        resource, action = code.split(".", 1)[1].rsplit(".", 1)
        if not p:
            p = Permission(code=code, name=name, level=level, resource=resource,
                           action=action, group_id=groups[group_code].id,
                           is_system=True, sort_order=i)
            db.add(p)
        else:
            # keep display metadata fresh without touching any grant
            p.name, p.level, p.group_id = name, level, groups[group_code].id
        perms[code] = p
    db.flush()
    return perms


def _resolve(spec, perms: dict[str, Permission], level: str) -> list[Permission]:
    """Expand a role's permission spec into concrete rows."""
    if spec == "*":
        return [p for p in perms.values() if p.level == level]
    if spec == "VIEW_ONLY":
        return [p for p in perms.values() if p.level == level and _is_view(p.code)]
    return [perms[c] for c in spec if c in perms]


def _grant(db: Session, role: Role, permissions: list[Permission]) -> None:
    have = {rp.permission_id for rp in role.permissions}
    for p in permissions:
        if p.id not in have:
            db.add(RolePermission(role_id=role.id, permission_id=p.id))


def _seed_roles(db: Session, perms: dict[str, Permission]) -> None:
    """Platform roles, then company blueprints (org_id NULL, is_template=1)."""
    for spec in PLATFORM_ROLES:
        role = db.query(Role).filter_by(code=spec["code"], org_id=None,
                                        is_template=False).first()
        if role:
            continue   # exists — never re-grant, the operator may have edited it
        role = Role(
            code=spec["code"], name=spec["name"], description=spec["description"],
            level=LEVEL_PLATFORM, org_id=None, is_template=False,
            is_system=spec.get("is_system", False), icon=spec["icon"],
            color=spec["color"], sort_order=spec["sort"],
        )
        db.add(role)
        db.flush()
        _grant(db, role, _resolve(spec["permissions"], perms, LEVEL_PLATFORM))

    for spec in COMPANY_ROLES:
        role = db.query(Role).filter_by(code=spec["code"], org_id=None,
                                        is_template=True).first()
        if role:
            continue
        role = Role(
            code=spec["code"], name=spec["name"], description=spec["description"],
            level=LEVEL_COMPANY, org_id=None, is_template=True,
            is_system=spec.get("is_system", False),
            is_default=spec.get("is_default", False),
            is_readonly=spec.get("is_readonly", False),
            icon=spec["icon"], color=spec["color"], sort_order=spec["sort"],
        )
        db.add(role)
        db.flush()
        _grant(db, role, _resolve(spec["permissions"], perms, LEVEL_COMPANY))
    db.flush()


def _seed_menus(db: Session, perms: dict[str, Permission]) -> None:
    # Withdrawals first, so a code that was retired and later reused as a new
    # entry is recreated below rather than deleted after being written.
    for code in RETIRED_MENUS:
        stale = db.query(Menu).filter_by(code=code).first()
        if stale:
            db.delete(stale)          # cascades to its permissions and children
            logger.info("menu %s retired — removed", code)
    db.flush()

    by_code: dict[str, Menu] = {}
    # two passes so a child can always find its parent regardless of list order
    for code, label, icon, route, parent, section, module, sort, _p in MENUS:
        m = db.query(Menu).filter_by(code=code).first()
        if not m:
            level = LEVEL_PLATFORM if code.startswith("plat.") else LEVEL_COMPANY
            m = Menu(code=code, label=label, icon=icon, route=route, section=section,
                     module_code=module, sort_order=sort, level=level, is_system=True)
            db.add(m)
        by_code[code] = m
    db.flush()

    for code, _l, _i, _r, parent, *_rest in MENUS:
        if parent:
            by_code[code].parent_id = by_code[parent].id
    db.flush()

    for code, *_rest in MENUS:
        wanted = _rest[-1]
        menu = by_code[code]
        have = {sp.permission_id for sp in menu.permissions}
        for pcode in wanted:
            p = perms.get(pcode)
            if p and p.id not in have:
                db.add(SidebarPermission(menu_id=menu.id, permission_id=p.id))
    db.flush()


def _seed_widgets(db: Session, perms: dict[str, Permission]) -> None:
    for (code, title, subtitle, component, level, size, icon, color, sort,
         pcodes, rcodes, config) in WIDGETS:
        w = db.query(DashboardWidget).filter_by(code=code).first()
        if not w:
            w = DashboardWidget(code=code, title=title, subtitle=subtitle,
                                component=component, level=level, size=size,
                                icon=icon, color=color, sort_order=sort,
                                config=config or {})
            db.add(w)
            db.flush()
        else:
            # Widgets are platform-shipped presentation, not tenant data, so a
            # release may restyle or re-point them. Grants below are additive
            # and never removed here.
            w.title, w.subtitle, w.component = title, subtitle, component
            w.size, w.icon, w.color, w.config = size, icon, color, (config or {})
        have_p = {g.permission_id for g in w.grants}
        for pcode in pcodes:
            p = perms.get(pcode)
            if p and p.id not in have_p:
                db.add(DashboardPermission(widget_id=w.id, permission_id=p.id))
        have_r = {g.role_code for g in w.grants}
        for rcode in rcodes:
            if rcode not in have_r:
                db.add(DashboardPermission(widget_id=w.id, role_code=rcode))
    db.flush()


def _seed_modules(db: Session) -> None:
    for code, name, category, icon, color, sort, desc in MODULES:
        m = db.query(Module).filter_by(code=code).first()
        if not m:
            db.add(Module(code=code, name=name, category=category, icon=icon,
                          color=color, sort_order=sort, description=desc,
                          status="active", is_active=True))
    db.flush()


# ── tenant provisioning ───────────────────────────────────────────────

def provision_org_roles(db: Session, org: Organization) -> dict[str, Role]:
    """
    Clone every company blueprint into this tenant, once.

    Cloning (rather than pointing every tenant at one shared row) is what lets
    a company rename a role or change its permissions without leaking that
    change into every other company on the platform.
    """
    templates = db.query(Role).filter_by(is_template=True, level=LEVEL_COMPANY).all()
    existing = {r.code: r for r in db.query(Role).filter_by(org_id=org.id).all()}

    for t in templates:
        if t.code in existing:
            continue
        clone = Role(
            code=t.code, name=t.name, description=t.description,
            level=LEVEL_COMPANY, org_id=org.id, is_template=False,
            is_system=t.is_system, is_default=t.is_default, is_readonly=t.is_readonly,
            icon=t.icon, color=t.color, sort_order=t.sort_order,
        )
        db.add(clone)
        db.flush()
        for rp in t.permissions:
            db.add(RolePermission(role_id=clone.id, permission_id=rp.permission_id))
        existing[t.code] = clone
    db.flush()
    return existing


def _backfill_user_roles(db: Session) -> int:
    """
    Move users off the legacy `users.role` string onto real grants.

    Runs for any user with no grant at all, so it is safe to repeat and will
    also catch accounts created by older code paths after this ships.
    """
    moved = 0
    users = db.query(User).all()
    org_roles: dict[str, dict[str, Role]] = {}

    for u in users:
        if db.query(UserRole).filter_by(user_id=u.id).first():
            continue   # already has grants — leave it alone

        code = LEGACY_ROLE_MAP.get(u.role)
        if not code:
            continue

        if u.org_id:
            if u.org_id not in org_roles:
                org_roles[u.org_id] = {r.code: r for r
                                       in db.query(Role).filter_by(org_id=u.org_id).all()}
            role = org_roles[u.org_id].get(code)
        else:
            # no org → a platform person
            role = db.query(Role).filter_by(code=code, org_id=None,
                                            is_template=False).first()
        if not role:
            continue

        db.add(UserRole(user_id=u.id, role_id=role.id, org_id=u.org_id,
                        assigned_by=None))
        moved += 1
    db.flush()
    return moved


# ── entry point ───────────────────────────────────────────────────────

def seed_rbac() -> None:
    """Called on startup, after migrations. Safe to run on every boot."""
    db = SessionLocal()
    try:
        perms = _seed_permissions(db)
        _seed_roles(db, perms)
        _seed_menus(db, perms)
        _seed_widgets(db, perms)
        _seed_modules(db)
        db.commit()

        for org in db.query(Organization).all():
            provision_org_roles(db, org)
        db.commit()

        moved = _backfill_user_roles(db)
        db.commit()

        if moved:
            logger.info("rbac: granted roles to %d user(s) migrated off the legacy column", moved)
        logger.info("rbac: catalogue ready (%d permissions, %d roles)",
                    db.query(Permission).count(), db.query(Role).count())
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    seed_rbac()
    print("RBAC seed complete.")
