"""
sso_verifier.py — drop-in Hub SSO relying party for the VR LMS (FastAPI).

Copy this file into the VR LMS backend and mount `router`:

    import sso_verifier
    app.include_router(sso_verifier.router)

It is the exact mirror of the Laravel LMS implementation
(app/Sso/Services/HubTokenVerifier.php): same ticket, same claims, same checks,
same refusal behaviour. Only the last step differs — establishing a session is
whatever "logged in" means in this application, which is the one thing this
module cannot know for you. See `establish_session()`.

Environment
-----------
    HUB_SSO_ENABLED=true
    HUB_SSO_ISSUER=https://hub.goal-cert.com     # must equal SSO_ISSUER on the hub
    HUB_SSO_AUDIENCE=goalcert-vr                 # must equal SSO_VR_AUDIENCE on the hub
    HUB_SSO_ALGORITHM=HS256
    HUB_SSO_SECRET=<same value as SSO_SECRET on the hub, >=32 chars>
    # RS256 instead:
    # HUB_SSO_PUBLIC_KEY / HUB_SSO_PUBLIC_KEY_PATH
    HUB_SSO_MAX_AGE_SECONDS=120
    HUB_SSO_LEEWAY_SECONDS=30
    HUB_SSO_ALLOWED_ROLES=super_admin,admin
    HUB_SSO_DEFAULT_TARGET=/dashboard
    HUB_SSO_LOGIN_URL=/login                     # where refusals land
    HUB_SSO_REDIS_URL=                           # replay store; see _JtiStore
"""
from __future__ import annotations

import os
import threading
import time
from typing import Any

import jwt
from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse

router = APIRouter(prefix="/sso", tags=["sso"])

ENABLED = os.environ.get("HUB_SSO_ENABLED", "true").lower() in ("1", "true", "yes")
ISSUER = os.environ.get("HUB_SSO_ISSUER", "https://hub.goal-cert.com")
AUDIENCE = os.environ.get("HUB_SSO_AUDIENCE", "goalcert-vr")
ALGORITHM = os.environ.get("HUB_SSO_ALGORITHM", "HS256").upper()
SECRET = os.environ.get("HUB_SSO_SECRET", "")
PUBLIC_KEY = os.environ.get("HUB_SSO_PUBLIC_KEY", "")
PUBLIC_KEY_PATH = os.environ.get("HUB_SSO_PUBLIC_KEY_PATH", "")
MAX_AGE = int(os.environ.get("HUB_SSO_MAX_AGE_SECONDS", "120"))
LEEWAY = int(os.environ.get("HUB_SSO_LEEWAY_SECONDS", "30"))
ALLOWED_ROLES = [r.strip() for r in os.environ.get("HUB_SSO_ALLOWED_ROLES", "super_admin,admin").split(",") if r.strip()]
DEFAULT_TARGET = os.environ.get("HUB_SSO_DEFAULT_TARGET", "/dashboard")
LOGIN_URL = os.environ.get("HUB_SSO_LOGIN_URL", "/login")
ALLOWED_PREFIXES = [p.strip() for p in os.environ.get("HUB_SSO_ALLOWED_PREFIXES", "/").split(",") if p.strip()]


class SsoError(Exception):
    """Technical reason goes to the log; `public` is what the visitor sees."""

    def __init__(self, message: str, public: str = "Single sign-on failed. Please sign in."):
        super().__init__(message)
        self.public = public


# ── replay protection ────────────────────────────────────────────────

class _JtiStore:
    """
    Burns each `jti` on first use.

    The in-process default is correct for a single worker only. With more than
    one worker or host, set HUB_SSO_REDIS_URL — otherwise a ticket replayed
    against a different worker would be accepted, and replay protection is the
    control that makes a URL-borne ticket safe.
    """

    def __init__(self) -> None:
        self._redis = None
        url = os.environ.get("HUB_SSO_REDIS_URL", "")
        if url:
            import redis  # optional dependency

            self._redis = redis.Redis.from_url(url)
        self._local: dict[str, float] = {}
        self._lock = threading.Lock()

    def claim(self, jti: str, ttl: int = 900) -> bool:
        """True if this jti had not been seen. Atomic."""
        if self._redis is not None:
            return bool(self._redis.set(f"sso:jti:{jti}", "1", nx=True, ex=ttl))

        now = time.time()
        with self._lock:
            for k, exp in list(self._local.items()):
                if exp < now:
                    del self._local[k]
            if jti in self._local:
                return False
            self._local[jti] = now + ttl
            return True


_jti_store = _JtiStore()


def _key() -> str:
    if ALGORITHM.startswith("HS"):
        if not SECRET:
            raise SsoError("HUB_SSO_SECRET is not set", "Single sign-on is misconfigured.")
        if len(SECRET) < 32:
            raise SsoError("HUB_SSO_SECRET shorter than 32 chars", "Single sign-on is misconfigured.")
        return SECRET

    key = PUBLIC_KEY
    if not key and PUBLIC_KEY_PATH and os.path.exists(PUBLIC_KEY_PATH):
        with open(PUBLIC_KEY_PATH, "r", encoding="utf-8") as fh:
            key = fh.read()
    if not key.strip():
        raise SsoError("no hub public key configured", "Single sign-on is misconfigured.")
    return key


def verify_ticket(token: str) -> dict[str, Any]:
    """
    Verify a Hub ticket and return its claims.

    PyJWT checks the signature, `exp`, `nbf`, `iss` and `aud` for us — passing
    `audience` and `issuer` is what turns those into enforced checks rather than
    decorative claims. The age ceiling and replay burn are ours.
    """
    if not ENABLED:
        raise SsoError("SSO disabled", "Single sign-on is not enabled for this site.")

    try:
        claims = jwt.decode(
            token,
            _key(),
            algorithms=[ALGORITHM],       # allow-list: no `none`, no alg confusion
            audience=AUDIENCE,
            issuer=ISSUER,
            leeway=LEEWAY,
            options={"require": ["exp", "iat", "iss", "aud", "sub", "jti"]},
        )
    except jwt.ExpiredSignatureError:
        raise SsoError("ticket expired", "Your single sign-on link has expired. Please try again from the Hub.")
    except jwt.InvalidAudienceError:
        raise SsoError("audience mismatch", "This single sign-on link was issued for a different application.")
    except jwt.InvalidIssuerError:
        raise SsoError("issuer mismatch", "Your single sign-on link could not be verified.")
    except jwt.PyJWTError as e:
        raise SsoError(f"ticket rejected: {e}", "Your single sign-on link is invalid.")

    # Our own ceiling, independent of the issuer's `exp`.
    age = time.time() - int(claims["iat"])
    if MAX_AGE > 0 and age > MAX_AGE + LEEWAY:
        raise SsoError(f"ticket {age:.0f}s old", "Your single sign-on link has expired. Please try again from the Hub.")

    if ALLOWED_ROLES and claims.get("role") not in ALLOWED_ROLES:
        raise SsoError(f"role {claims.get('role')!r} not allowed",
                       "Your Hub role does not grant access to this application.")

    if not _jti_store.claim(str(claims["jti"])):
        raise SsoError("replay detected",
                       "This single sign-on link has already been used. Please try again from the Hub.")

    return claims


def safe_target(claims: dict[str, Any]) -> str:
    """Only site-relative paths under an allow-listed prefix. No open redirect."""
    rt = str(claims.get("rt") or "").strip()
    if not rt or not rt.startswith("/") or rt.startswith("//") or rt.startswith("/\\"):
        return DEFAULT_TARGET
    for prefix in ALLOWED_PREFIXES:
        if prefix == "/" or rt == prefix or rt.startswith(prefix.rstrip("/") + "/"):
            return rt
    return DEFAULT_TARGET


# ── the one part you must implement ──────────────────────────────────

def establish_session(request: Request, response: RedirectResponse, claims: dict[str, Any]) -> None:
    """
    Turn verified claims into a signed-in session in THIS application.

    Resolve `claims["sub"]` to a user you ALREADY have — do not create one from
    the token. Match on a stored hub-subject link first, falling back to email
    exactly once to establish that link, and refuse if the email matches more
    than one row. Then do whatever this app does to mark a request authenticated:

        user = lookup_by_hub_subject(claims["sub"]) or link_once_by_email(claims["email"])
        if user is None:
            raise SsoError("no local user", "Your Hub account is not linked to an account here.")
        if not user.is_active:
            raise SsoError("user disabled", "Your account has been deactivated.")
        request.session["user_id"] = user.id          # SessionMiddleware, or
        response.set_cookie("session", make_session_cookie(user),
                            httponly=True, secure=True, samesite="lax")
    """
    raise NotImplementedError(
        "Implement establish_session() against the VR LMS's own user store and session mechanism."
    )


async def hub_callback(request: Request):
    """
    The landing endpoint. POST is preferred (the ticket stays out of the URL,
    the history and the access log); GET is accepted for plain links.

    The body is parsed by hand rather than through a `Form(...)` parameter so
    the same handler can serve both methods — a Form parameter on a GET route
    is not something FastAPI can satisfy.
    """
    raw = request.query_params.get("token", "")

    if not raw and request.method == "POST":
        try:
            form = await request.form()
            raw = str(form.get("token") or "")
        except Exception:  # noqa: BLE001 — not form-encoded; try JSON
            try:
                raw = str((await request.json()).get("token") or "")
            except Exception:  # noqa: BLE001
                raw = ""

    if not raw:
        return RedirectResponse(f"{LOGIN_URL}?sso_error=missing_token", status_code=302)

    try:
        claims = verify_ticket(raw)
        response = RedirectResponse(DEFAULT_TARGET, status_code=302)
        establish_session(request, response, claims)
        response.headers["Location"] = safe_target(claims)
        return response
    except SsoError as e:
        # Log `str(e)`; show `e.public`. Never leak which check failed.
        import logging

        logging.getLogger(__name__).warning("[sso] refused: %s (ip=%s)", e, request.client.host if request.client else "?")
        return RedirectResponse(f"{LOGIN_URL}?sso_error=1", status_code=302)


router.add_api_route("/hub/callback", hub_callback, methods=["GET", "POST"], name="sso_hub_callback")
