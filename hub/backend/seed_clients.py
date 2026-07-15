"""
seed_clients.py — create 10 client demo organizations with admin logins.

Run: python seed_clients.py
Each client gets an org with full entitlements + an admin user.
"""
from db import SessionLocal, Base, engine
from models import Organization, User, DEFAULT_ENTITLEMENTS, DEFAULT_POLICY
from security import hash_password

Base.metadata.create_all(bind=engine)

CLIENTS = [
    {"org": "Collins Aerospace",    "slug": "collins",    "email": "admin@collins-demo.goalcert.io",    "name": "Collins Admin",    "password": "Collins@2026"},
    {"org": "SMRT Corporation",     "slug": "smrt",       "email": "admin@smrt-demo.goalcert.io",      "name": "SMRT Admin",       "password": "SMRT@2026"},
    {"org": "ST Engineering",       "slug": "stengg",     "email": "admin@stengg-demo.goalcert.io",    "name": "ST Eng Admin",     "password": "STEng@2026"},
    {"org": "SingHealth",           "slug": "singhealth", "email": "admin@singhealth-demo.goalcert.io", "name": "SingHealth Admin", "password": "SHealth@2026"},
    {"org": "DSTA Singapore",       "slug": "dsta",       "email": "admin@dsta-demo.goalcert.io",      "name": "DSTA Admin",       "password": "DSTA@2026"},
    {"org": "ComfortDelGro",        "slug": "cdg",        "email": "admin@cdg-demo.goalcert.io",       "name": "CDG Admin",        "password": "CDG@2026"},
    {"org": "Changi Airport Group", "slug": "changi",     "email": "admin@changi-demo.goalcert.io",    "name": "Changi Admin",     "password": "Changi@2026"},
    {"org": "SIA Engineering",      "slug": "siaec",      "email": "admin@siaec-demo.goalcert.io",     "name": "SIAEC Admin",      "password": "SIAEC@2026"},
    {"org": "Sembcorp Industries",  "slug": "sembcorp",   "email": "admin@sembcorp-demo.goalcert.io",  "name": "Sembcorp Admin",   "password": "Sembcorp@2026"},
    {"org": "Keppel Corporation",   "slug": "keppel",     "email": "admin@keppel-demo.goalcert.io",    "name": "Keppel Admin",     "password": "Keppel@2026"},
]

db = SessionLocal()
try:
    created = 0
    for c in CLIENTS:
        # Skip if org already exists
        if db.query(Organization).filter(Organization.slug == c["slug"]).first():
            print(f"  SKIP  {c['org']} (already exists)")
            continue

        # Create org with full entitlements
        org = Organization(
            name=c["org"],
            slug=c["slug"],
            status="active",
            entitlements=DEFAULT_ENTITLEMENTS,
            policy=DEFAULT_POLICY,
        )
        db.add(org)
        db.flush()

        # Create admin user for the org
        user = User(
            email=c["email"],
            full_name=c["name"],
            password_hash=hash_password(c["password"]),
            role="admin",
            status="active",
            must_change_password=False,
            org_id=org.id,
        )
        db.add(user)
        db.commit()
        created += 1
        print(f"  OK    {c['org']:25s} → {c['email']:45s} / {c['password']}")

    print(f"\n{'='*80}")
    print(f"Created {created} client orgs with admin logins.")
    print(f"{'='*80}")
    print()
    print("LOGIN CREDENTIALS:")
    print(f"{'='*80}")
    print(f"{'Organization':25s} {'Email':45s} {'Password'}")
    print(f"{'-'*80}")

    # Also print the super admin
    sa = db.query(User).filter(User.role == "super_admin").first()
    if sa:
        print(f"{'SUPER ADMIN':25s} {sa.email:45s} ChangeMe!2026")
        print(f"{'-'*80}")

    for c in CLIENTS:
        print(f"{c['org']:25s} {c['email']:45s} {c['password']}")
    print(f"{'='*80}")

finally:
    db.close()
