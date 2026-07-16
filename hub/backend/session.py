"""
session.py — cookie session + CSRF helpers.

Why cookies and not a Bearer token in localStorage:
  • The hub composes each platform's real UI as a Module-Federation remote, which
    runs JS **in the hub's own origin**. A token in localStorage would be readable
    by any of that code (and by any XSS). An HttpOnly cookie is not readable by JS
    at all, so the session can't be exfiltrated.
  • EventSource (SSE) cannot send an Authorization header. A cookie rides
    automatically, so the twin's live `/api/twin/bus/stream` authenticates.

CSRF: because cookies are sent automatically, mutations use a double-submit
token — a readable `gc_csrf` cookie that the SPA echoes back in `X-CSRF-Token`.
SameSite=Strict already blocks cross-site sends; the token is defence in depth.
"""
from __future__ import annotations

import os
import secrets

from fastapi import Response

COOKIE_SESSION = "gc_session"
COOKIE_CSRF = "gc_csrf"

# `Secure` requires HTTPS — local dev runs on http://localhost, so default OFF
# and turn it ON in production (COOKIE_SECURE=true).
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "").strip().lower() in ("1", "true", "yes")

_MAX_AGE = int(os.environ.get("JWT_EXPIRE_MINUTES", "720")) * 60


def new_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def set_session_cookies(response: Response, token: str, csrf: str) -> None:
    # HttpOnly → JS (including federated remote code) can NEVER read the session.
    # Path=/api keeps it off static asset requests.
    response.set_cookie(
        COOKIE_SESSION, token,
        httponly=True, secure=COOKIE_SECURE, samesite="strict",
        path="/api", max_age=_MAX_AGE,
    )
    # Readable BY DESIGN: the SPA echoes it back in X-CSRF-Token (double submit).
    # Path=/ so document.cookie can see it from any page path.
    response.set_cookie(
        COOKIE_CSRF, csrf,
        httponly=False, secure=COOKIE_SECURE, samesite="strict",
        path="/", max_age=_MAX_AGE,
    )


def clear_session_cookies(response: Response) -> None:
    response.delete_cookie(COOKIE_SESSION, path="/api")
    response.delete_cookie(COOKIE_CSRF, path="/")
