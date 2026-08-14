"""
seed.py — bootstrap the first super_admin from env on startup.

The very first platform owner cannot be created through the UI (nobody is logged
in yet), so it is seeded from SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD. Runs once;
if a super_admin already exists it does nothing.
"""
from __future__ import annotations

import logging
import os

from db import SessionLocal
from models import User
from security import hash_password

logger = logging.getLogger("hub-backend")


def seed_super_admin() -> None:
    email = os.environ.get("SUPER_ADMIN_EMAIL", "owner@goalcert.io").strip().lower()
    password = os.environ.get("SUPER_ADMIN_PASSWORD", "ChangeMe!2026")
    name = os.environ.get("SUPER_ADMIN_NAME", "Platform Owner")
    username = os.environ.get("SUPER_ADMIN_USERNAME", "admin").strip().lower() or None

    db = SessionLocal()
    try:
        existing = db.query(User).filter(User.role == "super_admin").first()
        if existing:
            return
        # don't collide with a pre-existing email
        if db.query(User).filter(User.email == email).first():
            return
        owner = User(
            email=email,
            username=username,
            full_name=name,
            password_hash=hash_password(password),
            role="super_admin",
            status="active",
            must_change_password=True,
            org_id=None,
        )
        db.add(owner)
        db.commit()
        logger.info("seeded super_admin: %s (change the password on first login)", email)
    finally:
        db.close()
