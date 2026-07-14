"""
deps.py — FastAPI auth dependencies.

get_current_user   → decode JWT, load the live user, enforce active status.
require_roles(...) → gate an endpoint to specific roles.
The gateway also imports resolve_user_from_token for its own auth check.
"""
from __future__ import annotations

from fastapi import Depends, Header, HTTPException
from sqlalchemy.orm import Session

from db import get_db
from models import User
from security import decode_access_token


def _bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1]
    return None


def resolve_user_from_token(token: str | None, db: Session) -> User | None:
    if not token:
        return None
    payload = decode_access_token(token)
    if not payload:
        return None
    user = db.get(User, payload.get("sub"))
    if not user or user.status != "active":
        return None
    return user


def get_current_user(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    user = resolve_user_from_token(_bearer(authorization), db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


def require_roles(*roles: str):
    def guard(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="Insufficient role")
        return user
    return guard


require_super_admin = require_roles("super_admin")
require_admin = require_roles("super_admin", "admin")
