"""
sso_routes.py — SSO ticket issuance for the satellite LMS app.

The hub is the identity source of truth; the LMS trusts a short-lived signed
ticket instead of running its own login. GET /api/sso/lms/launch mints one and
hands back the URL the browser should open — the LMS verifies the ticket
against SSO_SECRET/SSO_ISSUER/SSO_LMS_AUDIENCE on its own callback endpoint.
"""
from __future__ import annotations

import os
import time
import uuid
from urllib.parse import urlencode

import jwt
from fastapi import APIRouter, Depends, HTTPException

from deps import get_current_user
from models import User

router = APIRouter(prefix="/api/sso", tags=["sso"])

SSO_ISSUER = os.environ.get("SSO_ISSUER", "")
SSO_ALGORITHM = os.environ.get("SSO_ALGORITHM", "HS256")
SSO_SECRET = os.environ.get("SSO_SECRET", "")
SSO_TICKET_TTL_SECONDS = int(os.environ.get("SSO_TICKET_TTL_SECONDS", "60"))

LMS_AUDIENCE = os.environ.get("SSO_LMS_AUDIENCE", "")
LMS_CALLBACK_URL = os.environ.get("SSO_LMS_CALLBACK_URL", "")
LMS_DEFAULT_TARGET = os.environ.get("SSO_LMS_DEFAULT_TARGET", "/")
LMS_ROLES = {r.strip() for r in os.environ.get("SSO_LMS_ROLES", "").split(",") if r.strip()}


@router.get("/lms/launch")
def launch_lms(user: User = Depends(get_current_user)):
    if not SSO_SECRET or not LMS_CALLBACK_URL:
        raise HTTPException(status_code=503, detail="LMS SSO is not configured")
    if LMS_ROLES and user.role not in LMS_ROLES:
        raise HTTPException(status_code=403, detail="Not permitted to launch the LMS")

    now = int(time.time())
    ticket = jwt.encode(
        {
            "iss": SSO_ISSUER,
            "aud": LMS_AUDIENCE,
            "sub": user.id,
            "email": user.email,
            "name": user.full_name,
            "role": user.role,
            "org_id": user.org_id,
            "org_name": user.org.name if user.org else None,
            "jti": uuid.uuid4().hex,
            "iat": now,
            "exp": now + SSO_TICKET_TTL_SECONDS,
        },
        SSO_SECRET,
        algorithm=SSO_ALGORITHM,
    )
    redirect_url = f"{LMS_CALLBACK_URL}?{urlencode({'ticket': ticket, 'target': LMS_DEFAULT_TARGET})}"
    return {"redirect_url": redirect_url, "expires_in": SSO_TICKET_TTL_SECONDS}
