"""
rbac_routes.py — the access-control API.

Two audiences, one router:
  /api/me/*          what the signed-in user may see — the frontend's only
                     source of navigation, widgets and permission gates.
  /api/rbac/*        administration of roles, permissions and the sidebar,
                     scoped automatically to the caller's plane.

Every endpoint is guarded by a permission, never by a role name.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, selectinload

from db import get_db
from models import AuditLog, Organization, User
from rbac import (LEVEL_COMPANY, LEVEL_PLATFORM, Principal, dashboard_for,
                  get_principal, navigation_for, require_permission,
                  user_permissions)
from rbac_models import (Menu, Module, Permission, PermissionGroup, Role,
                         RolePermission, SidebarPermission, UserRole)

router = APIRouter(prefix="/api", tags=["rbac"])


def _log(db: Session, p: Principal, action: str, detail: str = "") -> None:
    db.add(AuditLog(actor_id=p.user.id, actor_email=p.user.email,
                    org_id=p.user.org_id, action=action, detail=detail))
    db.commit()


# ══ /api/me — what the signed-in user may see ══════════════════════════

@router.get("/me/bootstrap")
def bootstrap(p: Principal = Depends(get_principal), db: Session = Depends(get_db)):
    """
    Everything the shell needs to render itself, in ONE round trip: identity,
    permission codes, the sidebar tree and the dashboard layout.

    The frontend holds no permission logic of its own — it renders what this
    returns. That is what makes the sidebar genuinely database-driven rather
    than a hardcoded list that happens to be filtered.
    """
    org = db.get(Organization, p.org_id) if p.org_id else None
    entitlements = (org.entitlements if org else []) or []

    return {
        "user": p.user.to_public(),
        "level": p.level,
        "roles": [r.to_public() for r in p.roles],
        "permissions": sorted(p.permissions),
        "navigation": navigation_for(db, p, entitlements),
        "dashboard": dashboard_for(db, p),
        "entitlements": entitlements,
        "crossTenant": p.cross_tenant,
    }


@router.get("/me/permissions")
def my_permissions(p: Principal = Depends(get_principal)):
    return {"permissions": sorted(p.permissions), "level": p.level,
            "roles": [r.code for r in p.roles]}


# ══ /api/rbac/permissions — the catalogue ══════════════════════════════

@router.get("/rbac/permissions")
def list_permissions(p: Principal = Depends(require_permission(
        "company.roles.view", "company.roles.manage", "platform.permissions.manage")),
        db: Session = Depends(get_db)):
    """
    The permission catalogue, grouped for a role editor. A company admin only
    ever sees company-level permissions — they cannot grant what they are not.
    """
    q = db.query(Permission).filter(Permission.deleted_at.is_(None))
    if not p.is_platform:
        q = q.filter(Permission.level == LEVEL_COMPANY)
    perms = q.order_by(Permission.sort_order).all()

    groups = {g.id: g for g in db.query(PermissionGroup).order_by(PermissionGroup.sort_order).all()}
    out: dict[str, dict] = {}
    for perm in perms:
        g = groups.get(perm.group_id)
        key = g.code if g else "ungrouped"
        out.setdefault(key, {
            "code": key,
            "name": g.name if g else "Other",
            "sortOrder": g.sort_order if g else 999,
            "permissions": [],
        })["permissions"].append(perm.to_public())

    return {"groups": sorted(out.values(), key=lambda x: x["sortOrder"])}


# ══ /api/rbac/roles ════════════════════════════════════════════════════

class RoleCreate(BaseModel):
    code: str = Field(min_length=2, max_length=64)
    name: str = Field(min_length=2, max_length=120)
    description: str = ""
    icon: str = "ti-user"
    color: str = "#6d28d9"
    permissions: list[str] = []
    org_id: Optional[str] = None      # platform operators may target a tenant


class RoleUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    is_default: Optional[bool] = None
    permissions: Optional[list[str]] = None


def _visible_roles(db: Session, p: Principal, org_id: str | None = None):
    """Platform sees platform roles + blueprints; a tenant sees only its own."""
    q = db.query(Role).filter(Role.deleted_at.is_(None))
    if p.is_platform:
        if org_id:
            return q.filter(Role.org_id == org_id)
        return q.filter(Role.org_id.is_(None))
    return q.filter(Role.org_id == p.org_id)


@router.get("/rbac/roles")
def list_roles(org_id: Optional[str] = None,
               p: Principal = Depends(require_permission(
                   "company.roles.view", "company.roles.manage", "platform.roles.manage")),
               db: Session = Depends(get_db)):
    roles = (_visible_roles(db, p, org_id)
             .options(selectinload(Role.permissions).selectinload(RolePermission.permission),
                      selectinload(Role.assignments))
             .order_by(Role.sort_order).all())
    return {"roles": [r.to_public(with_permissions=True) for r in roles]}


@router.post("/rbac/roles", status_code=201)
def create_role(body: RoleCreate,
                p: Principal = Depends(require_permission(
                    "company.roles.manage", "platform.roles.manage")),
                db: Session = Depends(get_db)):
    # A company admin can only ever create roles inside their own tenant.
    org_id = body.org_id if p.is_platform else p.org_id
    if org_id:
        p.assert_org(org_id)
        if not db.get(Organization, org_id):
            raise HTTPException(404, "Organisation not found")

    if db.query(Role).filter_by(code=body.code, org_id=org_id).first():
        raise HTTPException(409, f"A role with code '{body.code}' already exists here")

    level = LEVEL_PLATFORM if (p.is_platform and org_id is None) else LEVEL_COMPANY
    role = Role(code=body.code, name=body.name, description=body.description,
                level=level, org_id=org_id, icon=body.icon, color=body.color,
                is_system=False, sort_order=500)
    db.add(role)
    db.flush()
    _apply_permissions(db, p, role, body.permissions)
    db.commit()
    db.refresh(role)
    _log(db, p, "role_create", f"Created role {role.code}")
    return {"role": role.to_public(with_permissions=True)}


def _apply_permissions(db: Session, p: Principal, role: Role, codes: list[str]) -> None:
    """
    Replace a role's grants.

    Two invariants enforced here, not in the UI:
      • a company role can never hold a platform permission — otherwise a tenant
        could escalate itself into the platform plane;
      • a read-only role rejects any non-view permission.
    """
    perms = db.query(Permission).filter(Permission.code.in_(codes)).all() if codes else []
    found = {x.code for x in perms}
    missing = set(codes) - found
    if missing:
        raise HTTPException(400, f"Unknown permission(s): {', '.join(sorted(missing))}")

    for perm in perms:
        if role.level == LEVEL_COMPANY and perm.level == LEVEL_PLATFORM:
            raise HTTPException(
                403, f"'{perm.code}' is a platform permission and cannot be granted to a company role")
        if not p.is_platform and perm.level == LEVEL_PLATFORM:
            raise HTTPException(403, "You cannot grant platform permissions")
        if role.is_readonly and perm.action not in ("view", "monitor"):
            raise HTTPException(
                400, f"'{role.name}' is read-only; '{perm.code}' would let it change data")

    db.query(RolePermission).filter_by(role_id=role.id).delete()
    for perm in perms:
        db.add(RolePermission(role_id=role.id, permission_id=perm.id))
    db.flush()


@router.patch("/rbac/roles/{role_id}")
def update_role(role_id: str, body: RoleUpdate,
                p: Principal = Depends(require_permission(
                    "company.roles.manage", "platform.roles.manage")),
                db: Session = Depends(get_db)):
    role = db.get(Role, role_id)
    if not role or role.deleted_at:
        raise HTTPException(404, "Role not found")
    if role.org_id:
        p.assert_org(role.org_id)
    elif not p.is_platform:
        raise HTTPException(403, "Only the platform may edit shipped roles")

    if body.name is not None:
        role.name = body.name
    if body.description is not None:
        role.description = body.description
    if body.icon is not None:
        role.icon = body.icon
    if body.color is not None:
        role.color = body.color
    if body.is_default is not None:
        role.is_default = body.is_default
    if body.permissions is not None:
        _apply_permissions(db, p, role, body.permissions)

    db.commit()
    db.refresh(role)
    _log(db, p, "role_update", f"Updated role {role.code}")
    return {"role": role.to_public(with_permissions=True)}


@router.delete("/rbac/roles/{role_id}")
def delete_role(role_id: str,
                p: Principal = Depends(require_permission(
                    "company.roles.manage", "platform.roles.manage")),
                db: Session = Depends(get_db)):
    role = db.get(Role, role_id)
    if not role or role.deleted_at:
        raise HTTPException(404, "Role not found")
    if role.is_system:
        raise HTTPException(403, "Shipped roles cannot be deleted — edit their permissions instead")
    if role.org_id:
        p.assert_org(role.org_id)
    if role.assignments:
        raise HTTPException(
            409, f"{len(role.assignments)} user(s) still hold this role — reassign them first")

    from datetime import datetime
    role.deleted_at = datetime.utcnow()   # soft delete: audit rows still resolve
    db.commit()
    _log(db, p, "role_delete", f"Deleted role {role.code}")
    return {"ok": True}


# ══ Role assignment ════════════════════════════════════════════════════

class AssignRoles(BaseModel):
    role_ids: list[str]


@router.get("/rbac/users/{user_id}/roles")
def get_user_roles(user_id: str,
                   p: Principal = Depends(require_permission(
                       "company.roles.view", "company.roles.assign", "platform.roles.manage")),
                   db: Session = Depends(get_db)):
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(404, "User not found")
    p.assert_org(target.org_id) if target.org_id else None
    links = db.query(UserRole).filter_by(user_id=user_id).all()
    return {"roles": [l.role.to_public() for l in links if l.role]}


@router.put("/rbac/users/{user_id}/roles")
def set_user_roles(user_id: str, body: AssignRoles,
                   p: Principal = Depends(require_permission(
                       "company.roles.assign", "platform.roles.manage")),
                   db: Session = Depends(get_db)):
    """
    Replace a user's roles. Multi-role by design — a Quality Engineer who also
    covers Safety holds both, rather than needing a bespoke merged role.
    """
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(404, "User not found")
    if target.org_id:
        p.assert_org(target.org_id)
    elif not p.is_platform:
        raise HTTPException(403, "Only the platform may assign platform roles")

    roles = db.query(Role).filter(Role.id.in_(body.role_ids)).all() if body.role_ids else []
    if len(roles) != len(set(body.role_ids)):
        raise HTTPException(400, "One or more roles do not exist")

    for r in roles:
        # you may only grant roles that live where the target user lives
        if r.org_id != target.org_id:
            raise HTTPException(
                403, f"Role '{r.code}' belongs to a different organisation than this user")
        if r.level == LEVEL_PLATFORM and not p.is_platform:
            raise HTTPException(403, "You cannot grant platform roles")

    # Refuse to strip the last administrator of a tenant — the classic lockout.
    if target.org_id:
        admin_perm = "company.roles.manage"
        keeps_admin = any(admin_perm in {rp.permission.code for rp in r.permissions if rp.permission}
                          for r in roles)
        if not keeps_admin:
            others = (db.query(UserRole)
                        .join(Role, Role.id == UserRole.role_id)
                        .filter(UserRole.org_id == target.org_id,
                                UserRole.user_id != target.id,
                                Role.code == "company_admin")
                        .count())
            had_admin = any(l.role and l.role.code == "company_admin"
                            for l in db.query(UserRole).filter_by(user_id=target.id).all())
            if had_admin and others == 0:
                raise HTTPException(
                    409, "This is the last administrator of the organisation — "
                         "promote someone else first")

    db.query(UserRole).filter_by(user_id=user_id).delete()
    for r in roles:
        db.add(UserRole(user_id=user_id, role_id=r.id, org_id=target.org_id,
                        assigned_by=p.user.id))
    db.commit()
    _log(db, p, "roles_assign",
         f"Set roles for {target.email}: {', '.join(r.code for r in roles) or '(none)'}")
    return {"ok": True, "roles": [r.to_public() for r in roles]}


# ══ Platform user directory ════════════════════════════════════════════

@router.get("/platform/users")
def platform_users(q: Optional[str] = None, org_id: Optional[str] = None,
                   limit: int = 50, offset: int = 0,
                   p: Principal = Depends(require_permission(
                       "platform.companies.view", "platform.roles.manage")),
                   db: Session = Depends(get_db)):
    """
    Every user on the platform, across every tenant.

    Unlike /api/admin/users this includes platform staff and carries each
    user's real roles, so the owner can see who holds what without opening ten
    tenants. Paginated and searchable because "list everything" stops working
    the day the platform succeeds.
    """
    query = db.query(User)
    if org_id:
        query = query.filter(User.org_id == org_id)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(
            (User.email.ilike(like)) | (User.full_name.ilike(like)) |
            (User.username.ilike(like)))

    total = query.count()
    users = (query.order_by(User.created_at.desc())
                  .offset(max(0, offset)).limit(min(max(1, limit), 200)).all())

    # Resolve every role in one query rather than per user.
    ids = [u.id for u in users]
    grants: dict[str, list] = {}
    if ids:
        rows = (db.query(UserRole.user_id, Role)
                  .join(Role, Role.id == UserRole.role_id)
                  .filter(UserRole.user_id.in_(ids), Role.deleted_at.is_(None))
                  .all())
        for uid, role in rows:
            grants.setdefault(uid, []).append(role.to_public())

    orgs = dict(db.query(Organization.id, Organization.name).all())
    return {
        "users": [{**u.to_public(),
                   "orgName": orgs.get(u.org_id),
                   "roles": grants.get(u.id, [])} for u in users],
        "total": total, "limit": limit, "offset": offset,
        "organizations": [{"id": k, "name": v} for k, v in sorted(orgs.items(), key=lambda x: x[1])],
    }


# ══ Sidebar administration ═════════════════════════════════════════════

class MenuUpdate(BaseModel):
    label: Optional[str] = None
    icon: Optional[str] = None
    route: Optional[str] = None
    section: Optional[str] = None
    sort_order: Optional[int] = None
    is_visible: Optional[bool] = None
    parent_id: Optional[str] = None
    permissions: Optional[list[str]] = None


@router.get("/rbac/menus")
def list_menus(p: Principal = Depends(require_permission("platform.menus.manage")),
               db: Session = Depends(get_db)):
    """The whole sidebar, unfiltered — this is the builder's view, not a user's."""
    menus = (db.query(Menu)
               .options(selectinload(Menu.permissions).selectinload(SidebarPermission.permission))
               .filter(Menu.deleted_at.is_(None))
               .order_by(Menu.sort_order).all())
    by_parent: dict[str | None, list[Menu]] = {}
    for m in menus:
        by_parent.setdefault(m.parent_id, []).append(m)
    tree = [m.to_public(children=[c.to_public() for c in by_parent.get(m.id, [])])
            for m in by_parent.get(None, [])]
    return {"menus": tree}


@router.patch("/rbac/menus/{menu_id}")
def update_menu(menu_id: str, body: MenuUpdate,
                p: Principal = Depends(require_permission("platform.menus.manage")),
                db: Session = Depends(get_db)):
    menu = db.get(Menu, menu_id)
    if not menu or menu.deleted_at:
        raise HTTPException(404, "Menu not found")

    for field in ("label", "icon", "route", "section", "sort_order", "is_visible", "parent_id"):
        val = getattr(body, field)
        if val is not None:
            setattr(menu, field, val)

    if body.permissions is not None:
        perms = db.query(Permission).filter(Permission.code.in_(body.permissions)).all()
        db.query(SidebarPermission).filter_by(menu_id=menu.id).delete()
        for perm in perms:
            db.add(SidebarPermission(menu_id=menu.id, permission_id=perm.id))

    db.commit()
    db.refresh(menu)
    _log(db, p, "menu_update", f"Updated menu {menu.code}")
    return {"menu": menu.to_public()}


# ══ Module registry ════════════════════════════════════════════════════

@router.get("/rbac/modules")
def list_modules(p: Principal = Depends(require_permission(
        "platform.modules.view", "platform.modules.manage", "company.modules.assign")),
        db: Session = Depends(get_db)):
    mods = (db.query(Module).filter(Module.deleted_at.is_(None))
              .order_by(Module.sort_order).all())
    return {"modules": [m.to_public() for m in mods]}
