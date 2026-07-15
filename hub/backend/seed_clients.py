"""
seed_clients.py — create 10 generic demo organizations with admin logins.
Called on server startup. Idempotent — skips if orgs already exist.
"""
from __future__ import annotations
import logging
from db import SessionLocal
from models import Organization, User, DEFAULT_ENTITLEMENTS, DEFAULT_POLICY
from security import hash_password

logger = logging.getLogger("hub-backend")

COUNT = 10


def seed_demo_orgs() -> None:
    db = SessionLocal()
    try:
        created = 0
        for i in range(1, COUNT + 1):
            slug = f"demo-{i}"
            email = f"admin{i}@goalcert.io"

            if db.query(Organization).filter(Organization.slug == slug).first():
                continue

            org = Organization(
                name=f"Demo Organisation {i}",
                slug=slug,
                status="active",
                entitlements=DEFAULT_ENTITLEMENTS,
                policy=DEFAULT_POLICY,
            )
            db.add(org)
            db.flush()

            user = User(
                email=email,
                full_name=f"Admin {i}",
                password_hash=hash_password(f"GoalCert{i}!"),
                role="admin",
                status="active",
                must_change_password=False,
                org_id=org.id,
            )
            db.add(user)
            db.commit()
            created += 1

        if created:
            logger.info("seeded %d demo organisations (admin1-admin%d@goalcert.io)", created, COUNT)
    finally:
        db.close()


if __name__ == "__main__":
    seed_demo_orgs()
    print(f"Seeded {COUNT} demo orgs.")
