"""auth_routes.py — login, whoami, change-password."""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from db import get_db
from deps import get_current_user
from models import AuditLog, User
from schemas import ChangePasswordRequest, LoginRequest
from security import create_access_token, hash_password, verify_password
from sso import autolaunch_app_for

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _log(db: Session, actor: User, action: str, detail: str = "") -> None:
    db.add(AuditLog(actor_id=actor.id, actor_email=actor.email,
                    org_id=actor.org_id, action=action, detail=detail))
    db.commit()


@router.post("/login")
def login(body: LoginRequest, db: Session = Depends(get_db)):
    # One field, two ways in: the email on the account or its short username.
    ident = body.identifier.strip().lower()
    user = (db.query(User)
              .filter((User.email == ident) | (User.username == ident))
              .first())
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if user.status == "disabled":
        raise HTTPException(status_code=403, detail="Account disabled — contact your admin")
    if user.status == "pending":
        raise HTTPException(status_code=403, detail="Account pending — your admin has not assigned a role yet")

    user.last_login = datetime.utcnow()
    db.commit()
    token = create_access_token(user)
    # Returned with the session rather than fetched afterwards: the browser has
    # to open the satellite tab while the sign-in click still counts as user
    # activation, and a second round trip is long enough to lose it to the
    # pop-up blocker. None for everyone who does not auto-launch.
    return {"token": token, "user": user.to_public(), "ssoAutoLaunch": autolaunch_app_for(user)}


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return {"user": user.to_public()}


@router.post("/change-password")
def change_password(body: ChangePasswordRequest,
                    user: User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    user.password_hash = hash_password(body.new_password)
    user.must_change_password = False
    db.commit()
    _log(db, user, "password_change", "self-service password change")
    return {"ok": True, "user": user.to_public()}
