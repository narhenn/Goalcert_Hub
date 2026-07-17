# Goalcert Integration Hub — the host (ECS Fargate, PUBLIC subnet behind an ALB).
#
# ONE image = the whole deployable unit. server.py serves hub/web/dist at "/" when it
# exists, so the SPA and /api/* share an origin: no CORS between them, no separate static
# host, and the HttpOnly session cookie is same-origin by construction.
#
# WHAT THIS IMAGE IS NOT: it does not contain the three platform REMOTES. Those are
# fetched by the browser at runtime from their own origins (S3/CloudFront) — that is the
# point of Module Federation and why a platform can ship without redeploying the hub.
# Consequences you must not skip:
#   • VITE_*_REMOTE must be baked in at BUILD time (Vite inlines import.meta.env), so they
#     are build args here, not runtime env. Changing a remote URL = rebuild this image.
#   • REMOTE_ORIGINS (runtime env) must list those same origins or the CSP blocks them.
# See AWS_DEPLOYMENT.md.
#
# Build from the REPO ROOT so both hub/web and hub/backend are in context:
#   docker build -f hub/Dockerfile -t goalcert-hub .

# ── 1. Build the SPA ────────────────────────────────────────────────
FROM node:20-slim AS web

WORKDIR /build

COPY hub/web/package.json hub/web/package-lock.json* ./
RUN npm ci --no-audit --no-fund

COPY hub/web/ ./

# Baked into the bundle at build time. Point them at the CloudFront remote paths — pin the
# <git-sha> path, not a floating one, so a hub build is reproducible.
ARG VITE_TWIN_REMOTE
ARG VITE_SCENARIO_REMOTE
ARG VITE_HIVEMIND_REMOTE
ENV VITE_TWIN_REMOTE=$VITE_TWIN_REMOTE \
    VITE_SCENARIO_REMOTE=$VITE_SCENARIO_REMOTE \
    VITE_HIVEMIND_REMOTE=$VITE_HIVEMIND_REMOTE

RUN npm run build

# ── 2. API + the built SPA ──────────────────────────────────────────
FROM python:3.11-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8090

WORKDIR /app/hub/backend

COPY hub/backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY hub/backend/ ./

# server.py resolves the SPA as ../web/dist relative to itself — keep that layout.
COPY --from=web /build/dist /app/hub/web/dist

RUN useradd --create-home --uid 10001 appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8090

# Hits the REAL health route: JSON + a live DB check, and it can actually return 503.
# Do NOT point this at "/" — that is the SPA catch-all and returns 200 HTML even when the
# database is gone, so the check could never fail and ECS would never replace a dead task.
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD python -c "import urllib.request,os,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:%s/api/health' % os.environ.get('PORT','8090'), timeout=4).status==200 else 1)"

CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT:-8090} --proxy-headers --forwarded-allow-ips='*'"]
