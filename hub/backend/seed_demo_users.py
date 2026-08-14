"""
seed_demo_users.py — one demo login per role, for local development.

Creates (or refreshes) a single account for every distinct RBAC role so each
persona's sidebar, dashboard and permissions can be opened without hand-building
users. Company roles are bound to ONE tenant; platform roles have no tenant.

    python seed_demo_users.py --yes
    python seed_demo_users.py --yes --password hunter2 --org demo-2

DEVELOPMENT ONLY. Every account shares one weak, printed password, so anyone who
reads this file can sign in as a platform owner. It refuses to run without
--yes, and it refuses outright when HUB_ENV is production/staging. Do not seed
these into an internet-facing deployment; if you already have, delete the users
and rotate the super-admin credential.

Re-running is safe: accounts are matched on username and updated in place, so
this resets passwords rather than creating duplicates.
"""
from __future__ import annotations

import argparse
import os
import sys

from db import SessionLocal
from models import Organization, User
from rbac_models import Role, UserRole
from security import hash_password

DEFAULT_PASSWORD = "demo1234"

# (username, rbac role code, legacy users.role, display name)
#
# The second column is the RBAC role that actually drives the UI. The third is
# the legacy `users.role` string, which still gates the /api/<svc> gateway and
# the older admin routes — it has only seven values, so roles with no legacy
# equivalent get "frontline", the least-privileged persona, rather than an
# invented one. Nothing silently gains reach that way: the older admin routes
# are behind require_roles("super_admin", "admin") and reject anything else.
ACCOUNTS = [
    # ── Platform (no tenant) ──────────────────────────────────────────
    ("owner",      "platform_owner",   "super_admin", "Demo Platform Owner"),
    ("support",    "platform_support", "admin",       "Demo Platform Support"),
    # ── Company (bound to the target tenant) ──────────────────────────
    ("admin",      "company_admin",    "admin",       "Demo Company Admin"),
    ("coo",        "coo",              "coo",         "Demo Plant Manager / COO"),
    ("supervisor", "supervisor",       "supervisor",  "Demo Line Supervisor"),
    ("frontline",  "frontline",        "frontline",   "Demo Frontline Operator"),
    ("trainer",    "lnd",              "lnd",         "Demo L&D / Trainer"),
    ("compliance", "compliance",       "compliance",  "Demo Compliance Officer"),
    ("maintenance", "maintenance",     "frontline",   "Demo Maintenance Engineer"),
    ("quality",    "quality",          "frontline",   "Demo Quality Engineer"),
    ("safety",     "safety",           "frontline",   "Demo Safety Officer"),
    ("hr",         "hr",               "frontline",   "Demo HR / Training Coordinator"),
    ("finance",    "finance",          "frontline",   "Demo Finance Manager"),
    ("itadmin",    "it_admin",         "admin",       "Demo IT Administrator"),
    ("viewer",     "viewer",           "frontline",   "Demo Viewer / Auditor"),
]

PLATFORM_LEVEL = "platform"


def _refuse_in_production() -> None:
    env = (os.environ.get("HUB_ENV") or os.environ.get("ENV") or "").strip().lower()
    if env in {"production", "prod", "staging"}:
        sys.exit(f"refusing to seed demo accounts with HUB_ENV={env!r}")


def _pick_org(db, slug: str | None) -> Organization:
    q = db.query(Organization).filter(Organization.deleted_at.is_(None)) \
        if hasattr(Organization, "deleted_at") else db.query(Organization)
    org = q.filter(Organization.slug == slug).first() if slug else q.order_by(Organization.created_at).first()
    if not org:
        sys.exit(f"no organisation found{f' with slug {slug!r}' if slug else ''} — run the seed first")
    return org


def _resolve_role(db, code: str, org_id: str) -> Role | None:
    """
    Company roles exist twice: a template (org_id NULL) and a concrete per-tenant
    copy. Grants must point at the tenant's own row, never the template, or the
    user ends up holding a role that belongs to no organisation.
    """
    role = (db.query(Role)
              .filter(Role.code == code, Role.deleted_at.is_(None), Role.org_id == org_id)
              .first())
    if role:
        return role
    return (db.query(Role)
              .filter(Role.code == code, Role.deleted_at.is_(None),
                      Role.org_id.is_(None), Role.level == PLATFORM_LEVEL)
              .first())


def seed(password: str, org_slug: str | None, email_domain: str) -> list[dict]:
    db = SessionLocal()
    created: list[dict] = []
    try:
        org = _pick_org(db, org_slug)
        pw_hash = hash_password(password)

        for username, role_code, legacy_role, full_name in ACCOUNTS:
            role = _resolve_role(db, role_code, org.id)
            if not role:
                print(f"  !  {username:<11} skipped — no role {role_code!r}", file=sys.stderr)
                continue

            is_platform = role.level == PLATFORM_LEVEL
            org_id = None if is_platform else org.id
            email = f"{username}@{email_domain}"

            user = db.query(User).filter(User.username == username).first()

            # Only ever adopt an account this script owns. Usernames here are
            # ordinary words — "admin", "owner", "finance" — and the real
            # platform owner is seeded with SUPER_ADMIN_USERNAME, which defaults
            # to "admin". Without this guard, matching on username alone silently
            # rewrites that account's email and password and demotes it to a
            # tenant role: the deployment loses its way back in.
            if user and user.email != email:
                print(f"  !  {username:<11} skipped — username taken by "
                      f"{user.email} (role {user.role!r}); not overwriting",
                      file=sys.stderr)
                continue

            was_new = user is None
            if was_new:
                user = User(username=username, email=email)
                db.add(user)

            user.email = email
            user.full_name = full_name
            user.password_hash = pw_hash
            user.role = legacy_role
            user.status = "active"
            user.must_change_password = False
            user.org_id = org_id
            db.flush()

            # One role per demo account: drop any earlier grant so re-running
            # cannot leave a persona holding two roles at once.
            db.query(UserRole).filter(UserRole.user_id == user.id).delete()
            db.add(UserRole(user_id=user.id, role_id=role.id, org_id=org_id))

            created.append({
                "username": username, "email": email, "role": role.name,
                "code": role_code, "level": role.level,
                "org": "—" if is_platform else org.name, "new": was_new,
            })

        db.commit()
        return created
    finally:
        db.close()


def main() -> None:
    ap = argparse.ArgumentParser(description="Seed one demo login per role (development only).")
    ap.add_argument("--yes", action="store_true", help="required: confirm weak shared-password accounts")
    ap.add_argument("--password", default=DEFAULT_PASSWORD, help=f"shared password (default: {DEFAULT_PASSWORD})")
    ap.add_argument("--org", default=None, help="tenant slug for company roles (default: the oldest org)")
    ap.add_argument("--email-domain", default="demo.goalcert.io", help="domain for generated emails")
    args = ap.parse_args()

    if not args.yes:
        sys.exit(__doc__.strip() + "\n\nRefusing to run without --yes.")
    _refuse_in_production()

    rows = seed(args.password, args.org, args.email_domain)
    if not rows:
        sys.exit("nothing seeded")

    w = max(len(r["username"]) for r in rows)
    print(f"\n  {len(rows)} demo accounts — password for every one: {args.password}\n")
    print(f"  {'LOGIN'.ljust(w)}  {'ROLE':<26} {'LEVEL':<9} {'TENANT':<22} ")
    print(f"  {'-' * w}  {'-' * 26} {'-' * 9} {'-' * 22} ")
    for r in rows:
        print(f"  {r['username'].ljust(w)}  {r['role']:<26} {r['level']:<9} {r['org']:<22} "
              f"{'new' if r['new'] else 'updated'}")
    print("\n  Sign in at /login with the LOGIN value or its email; both work.\n")


if __name__ == "__main__":
    main()
