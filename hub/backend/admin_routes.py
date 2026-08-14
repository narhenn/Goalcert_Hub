"""
admin_routes.py — org, user and role administration.

Privilege boundary:
  super_admin  → manages organisations, their entitlements/policy, and creates
                 org admins. Sees across all orgs.
  admin        → manages users *within their own org*, assigns operational persona
                 roles, resets passwords. Cannot create admins or touch other orgs.
"""
from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db import get_db
from deps import get_current_user, require_admin, require_super_admin
from models import (ASSIGNABLE_BY, DEFAULT_ENTITLEMENTS, DEFAULT_POLICY, ROLES,
                    AuditLog, Organization, User)
from schemas import (OrgCreate, OrgUpdate, ResetPasswordRequest, UserCreate,
                     UserUpdate)
from security import hash_password

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _log(db: Session, actor: User, action: str, detail: str = "") -> None:
    db.add(AuditLog(actor_id=actor.id, actor_email=actor.email,
                    org_id=actor.org_id, action=action, detail=detail))
    db.commit()


def _slugify(name: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return s or "org"


def _assignable_roles(actor: User) -> list[str]:
    return ASSIGNABLE_BY.get(actor.role, [])


# ── Organisations (super_admin) ───────────────────────────────────────

@router.get("/orgs")
def list_orgs(_: User = Depends(require_super_admin), db: Session = Depends(get_db)):
    orgs = db.query(Organization).order_by(Organization.created_at.desc()).all()
    return {"orgs": [o.to_public() for o in orgs]}


@router.post("/orgs")
def create_org(body: OrgCreate, actor: User = Depends(require_super_admin),
               db: Session = Depends(get_db)):
    slug = _slugify(body.slug or body.name)
    if db.query(Organization).filter(Organization.slug == slug).first():
        raise HTTPException(409, "An organisation with that slug already exists")
    org = Organization(
        name=body.name, slug=slug,
        entitlements=body.entitlements or list(DEFAULT_ENTITLEMENTS),
        policy=dict(DEFAULT_POLICY),
    )
    db.add(org)
    db.flush()  # get org.id

    created_admin = None
    if body.admin_email and body.admin_password:
        email = body.admin_email.strip().lower()
        if db.query(User).filter(User.email == email).first():
            raise HTTPException(409, f"A user with email {email} already exists")
        created_admin = User(
            email=email, full_name=body.admin_name or "",
            password_hash=hash_password(body.admin_password),
            role="admin", status="active", must_change_password=True,
            org_id=org.id, created_by=actor.id,
        )
        db.add(created_admin)

    db.commit()
    db.refresh(org)

    # A new tenant gets its own copy of every shipped role immediately, and its
    # bootstrap admin is granted company_admin — otherwise the account exists
    # but can do nothing, since authorisation reads user_roles, not users.role.
    from rbac_models import Role, UserRole
    from rbac_seed import provision_org_roles
    org_roles = provision_org_roles(db, org)
    if created_admin:
        admin_role = org_roles.get("company_admin")
        if admin_role:
            db.add(UserRole(user_id=created_admin.id, role_id=admin_role.id,
                            org_id=org.id, assigned_by=actor.id))
    db.commit()

    _log(db, actor, "org_create", f"Created org {org.name}"
         + (f" + admin {created_admin.email}" if created_admin else ""))
    return {"org": org.to_public(),
            "admin": created_admin.to_public() if created_admin else None}


@router.patch("/orgs/{org_id}")
def update_org(org_id: str, body: OrgUpdate,
               actor: User = Depends(require_super_admin), db: Session = Depends(get_db)):
    org = db.get(Organization, org_id)
    if not org:
        raise HTTPException(404, "Organisation not found")
    if body.name is not None:
        org.name = body.name
    if body.status is not None:
        org.status = body.status
    if body.entitlements is not None:
        org.entitlements = body.entitlements
    if body.policy is not None:
        org.policy = body.policy
    db.commit()
    db.refresh(org)
    _log(db, actor, "org_update", f"Updated org {org.name}")
    return {"org": org.to_public()}


# ── Users (admin + super_admin) ───────────────────────────────────────

@router.get("/users")
def list_users(actor: User = Depends(require_admin), db: Session = Depends(get_db)):
    q = db.query(User)
    if actor.role == "admin":
        q = q.filter(User.org_id == actor.org_id)          # org-scoped
    else:
        q = q.filter(User.role != "super_admin")           # super_admin: all tenants' users
    users = q.order_by(User.created_at.desc()).all()
    return {
        "users": [u.to_public() for u in users],
        "assignableRoles": _assignable_roles(actor),
        "allRoles": ROLES,
    }


@router.post("/users")
def create_user(body: UserCreate, actor: User = Depends(require_admin),
                db: Session = Depends(get_db)):
    if body.role not in _assignable_roles(actor):
        raise HTTPException(403, f"You cannot assign the role '{body.role}'")

    # resolve target org
    if actor.role == "admin":
        org_id = actor.org_id
    else:
        org_id = body.org_id
        if not org_id:
            raise HTTPException(400, "org_id is required when a super_admin creates a user")
    if not org_id or not db.get(Organization, org_id):
        raise HTTPException(404, "Target organisation not found")

    email = body.email.strip().lower()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(409, f"A user with email {email} already exists")

    user = User(
        email=email, full_name=body.full_name,
        password_hash=hash_password(body.password),
        role=body.role, status="active",
        must_change_password=body.must_change_password,
        org_id=org_id, created_by=actor.id,
    )
    db.add(user)
    db.flush()

    # Grant the real role row. The legacy `role` string stays in sync for the
    # persona UI, but user_roles is what authorisation actually reads.
    from rbac_models import Role, UserRole
    from rbac_seed import LEGACY_ROLE_MAP
    code = LEGACY_ROLE_MAP.get(body.role, body.role)
    role_row = db.query(Role).filter_by(org_id=org_id, code=code).first()
    if role_row:
        db.add(UserRole(user_id=user.id, role_id=role_row.id,
                        org_id=org_id, assigned_by=actor.id))

    db.commit()
    db.refresh(user)
    _log(db, actor, "user_create", f"Created {email} as {body.role}")
    return {"user": user.to_public()}


@router.patch("/users/{user_id}")
def update_user(user_id: str, body: UserUpdate, actor: User = Depends(require_admin),
                db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    if actor.role == "admin" and user.org_id != actor.org_id:
        raise HTTPException(403, "Out of your organisation")
    if user.role == "super_admin":
        raise HTTPException(403, "Cannot modify the platform owner")
    if user.id == actor.id and body.role and body.role != actor.role:
        raise HTTPException(400, "You cannot change your own role")

    if body.full_name is not None:
        user.full_name = body.full_name
    if body.role is not None:
        if body.role not in _assignable_roles(actor):
            raise HTTPException(403, f"You cannot assign the role '{body.role}'")
        user.role = body.role
    if body.status is not None:
        if body.status not in ("active", "pending", "disabled"):
            raise HTTPException(400, "Invalid status")
        user.status = body.status
    db.commit()
    db.refresh(user)
    _log(db, actor, "user_update", f"Updated {user.email}: role={user.role} status={user.status}")
    return {"user": user.to_public()}


@router.post("/users/{user_id}/reset-password")
def reset_password(user_id: str, body: ResetPasswordRequest,
                   actor: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    if actor.role == "admin" and user.org_id != actor.org_id:
        raise HTTPException(403, "Out of your organisation")
    if user.role == "super_admin" and actor.role != "super_admin":
        raise HTTPException(403, "Cannot reset the platform owner")
    user.password_hash = hash_password(body.new_password)
    user.must_change_password = body.must_change_password
    db.commit()
    _log(db, actor, "password_reset", f"Reset password for {user.email}")
    return {"ok": True}


@router.delete("/users/{user_id}")
def delete_user(user_id: str, actor: User = Depends(require_admin), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    if user.id == actor.id:
        raise HTTPException(400, "You cannot delete yourself")
    if actor.role == "admin" and user.org_id != actor.org_id:
        raise HTTPException(403, "Out of your organisation")
    if user.role == "super_admin":
        raise HTTPException(403, "Cannot delete the platform owner")
    email = user.email
    db.delete(user)
    db.commit()
    _log(db, actor, "user_delete", f"Deleted {email}")
    return {"ok": True}


@router.get("/audit")
def audit(actor: User = Depends(require_admin), db: Session = Depends(get_db), limit: int = 50):
    q = db.query(AuditLog)
    if actor.role == "admin":
        q = q.filter(AuditLog.org_id == actor.org_id)
    rows = q.order_by(AuditLog.created_at.desc()).limit(min(limit, 200)).all()
    return {"entries": [r.to_public() for r in rows]}
