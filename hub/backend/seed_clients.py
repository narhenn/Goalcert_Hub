"""
seed_clients.py — create 10 generic demo organizations with admin logins.

Run: python seed_clients.py
"""
from db import SessionLocal, Base, engine
from models import Organization, User, DEFAULT_ENTITLEMENTS, DEFAULT_POLICY
from security import hash_password

Base.metadata.create_all(bind=engine)

COUNT = 10

db = SessionLocal()
try:
    created = 0
    for i in range(1, COUNT + 1):
        slug = f"demo-{i}"
        email = f"admin{i}@goalcert.io"

        if db.query(Organization).filter(Organization.slug == slug).first():
            print(f"  SKIP  Demo Org {i} (already exists)")
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
        print(f"  OK  Demo Org {i}")

    print(f"\nCreated {created} demo orgs.")
finally:
    db.close()
