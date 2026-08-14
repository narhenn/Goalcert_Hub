"""
settings_routes.py — uploads, SMTP and storage configuration.

Credentials are write-only across this whole module: a GET tells you which keys
are set, never their values, and a PATCH that omits a secret leaves the stored
one alone. So the settings screen can be opened in front of anyone.
"""
from __future__ import annotations

import logging
import os
import smtplib
from email.message import EmailMessage
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

import storage
from db import get_db
from models import AuditLog
from rbac import Principal, require_permission
from settings_models import AppSetting

logger = logging.getLogger("hub-backend")

router = APIRouter(prefix="/api/platform", tags=["settings"])


def _log(db: Session, p: Principal, action: str, detail: str = "") -> None:
    db.add(AuditLog(actor_id=p.user.id, actor_email=p.user.email,
                    org_id=p.user.org_id, action=action, detail=detail))
    db.commit()


def _row(db: Session, namespace: str) -> AppSetting:
    row = db.query(AppSetting).filter_by(namespace=namespace).first()
    if not row:
        row = AppSetting(namespace=namespace, values={}, secrets={})
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def _merge_secrets(row: AppSetting, incoming: dict | None) -> None:
    """Blank means 'keep what is stored' — never wipe a secret by omission."""
    if not incoming:
        return
    merged = dict(row.secrets or {})
    for k, v in incoming.items():
        if v:
            merged[k] = v
    row.secrets = merged


# ══ Uploads ════════════════════════════════════════════════════════════

@router.post("/uploads", status_code=201)
async def upload_file(
    file: UploadFile = File(...),
    folder: str = Form("misc"),
    p: Principal = Depends(require_permission(
        "platform.modules.manage", "platform.branding.manage", "platform.storage.manage")),
    db: Session = Depends(get_db),
):
    """
    Accept one image or video and hand back its URL.

    Type and size are enforced in storage.validate(), not here, so every upload
    surface gets the same rules. The bytes are read once into memory: the video
    cap (200 MB) is the real bound on that, and streaming straight to the driver
    would be the change to make if that cap ever rises.
    """
    data = await file.read()
    if not data:
        raise HTTPException(400, "The uploaded file is empty")

    try:
        record = storage.save_upload(
            db, data, folder, file.filename or "upload",
            file.content_type or "application/octet-stream")
    except storage.StorageError as exc:
        raise HTTPException(400, str(exc))
    except Exception as exc:                     # noqa: BLE001
        logger.exception("upload failed")
        raise HTTPException(500, f"Upload failed: {exc}")

    _log(db, p, "file_upload", f"{record['filename']} -> {record['url']}")
    return record


# ══ Storage settings ═══════════════════════════════════════════════════

class StorageWrite(BaseModel):
    driver: Optional[str] = None          # local | s3
    bucket: Optional[str] = None
    region: Optional[str] = None
    endpoint: Optional[str] = None
    base_url: Optional[str] = None
    access_key_id: Optional[str] = None       # secret
    secret_access_key: Optional[str] = None   # secret


@router.get("/settings/storage")
def get_storage(p: Principal = Depends(require_permission("platform.storage.manage")),
                db: Session = Depends(get_db)):
    row = _row(db, "storage")
    active = storage.get_driver(db)
    return {
        **row.to_public(),
        "activeDriver": active.name,
        "mediaRoot": str(storage.MEDIA_ROOT),
        "limits": {
            "imageMb": round(storage.MAX_IMAGE_BYTES / 1048576),
            "videoMb": round(storage.MAX_VIDEO_BYTES / 1048576),
        },
        "allowedTypes": sorted(storage.ALLOWED),
        "drivers": [
            {"code": "local", "name": "Local disk", "ready": True},
            {"code": "s3", "name": "Amazon S3 (or compatible)",
             "ready": _boto3_available()},
        ],
    }


def _boto3_available() -> bool:
    try:
        import boto3  # noqa: F401
        return True
    except ImportError:
        return False


@router.patch("/settings/storage")
def update_storage(body: StorageWrite,
                   p: Principal = Depends(require_permission("platform.storage.manage")),
                   db: Session = Depends(get_db)):
    row = _row(db, "storage")
    vals = dict(row.values or {})
    for k in ("driver", "bucket", "region", "endpoint", "base_url"):
        v = getattr(body, k)
        if v is not None:
            vals[k] = v
    row.values = vals
    _merge_secrets(row, {"access_key_id": body.access_key_id,
                         "secret_access_key": body.secret_access_key})
    row.is_enabled = True

    # Fail the save if the chosen driver cannot actually be constructed —
    # better a 400 here than every future upload dying at the point of use.
    if vals.get("driver") == "s3":
        try:
            storage.S3Driver(vals, row.secrets or {})
        except storage.StorageError as exc:
            raise HTTPException(400, str(exc))

    db.commit()
    _log(db, p, "storage_settings", f"driver={vals.get('driver', 'local')}")
    return get_storage(p, db)


# ══ SMTP settings ══════════════════════════════════════════════════════

class SmtpWrite(BaseModel):
    host: Optional[str] = None
    port: Optional[int] = None
    use_tls: Optional[bool] = None
    from_email: Optional[str] = None
    from_name: Optional[str] = None
    sales_email: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None        # secret
    is_enabled: Optional[bool] = None


@router.get("/settings/smtp")
def get_smtp(p: Principal = Depends(require_permission("platform.smtp.manage")),
             db: Session = Depends(get_db)):
    row = _row(db, "smtp")
    return {
        **row.to_public(),
        # The env fallback the enquiry mailer uses when no row is configured.
        "envFallback": bool(os.environ.get("SMTP_HOST")),
    }


@router.patch("/settings/smtp")
def update_smtp(body: SmtpWrite,
                p: Principal = Depends(require_permission("platform.smtp.manage")),
                db: Session = Depends(get_db)):
    row = _row(db, "smtp")
    vals = dict(row.values or {})
    for k in ("host", "port", "use_tls", "from_email", "from_name", "sales_email", "username"):
        v = getattr(body, k)
        if v is not None:
            vals[k] = v
    row.values = vals
    _merge_secrets(row, {"password": body.password})
    if body.is_enabled is not None:
        row.is_enabled = body.is_enabled
    db.commit()
    _log(db, p, "smtp_settings", f"host={vals.get('host', '')}")
    return get_smtp(p, db)


class TestEmail(BaseModel):
    to: EmailStr


@router.post("/settings/smtp/test")
def send_test_email(body: TestEmail,
                    p: Principal = Depends(require_permission("platform.smtp.manage")),
                    db: Session = Depends(get_db)):
    """
    Actually send. The point of a test button is proving delivery works, so the
    SMTP error is returned verbatim rather than a generic failure — that string
    is the whole diagnostic.
    """
    row = _row(db, "smtp")
    cfg, secrets = row.values or {}, row.secrets or {}
    host = cfg.get("host") or os.environ.get("SMTP_HOST", "")
    if not host:
        raise HTTPException(400, "No SMTP host configured")

    msg = EmailMessage()
    msg["Subject"] = "Integration Hub — SMTP test"
    sender = cfg.get("from_email") or os.environ.get("SMTP_FROM") or str(body.to)
    msg["From"] = f"{cfg['from_name']} <{sender}>" if cfg.get("from_name") else sender
    msg["To"] = str(body.to)
    msg.set_content(
        "This is a test message from the Integration Hub.\n\n"
        f"Host: {host}:{cfg.get('port', 587)}\n"
        "If you received it, outbound mail is working.\n")

    try:
        port = int(cfg.get("port") or os.environ.get("SMTP_PORT", 587))
        with smtplib.SMTP(host, port, timeout=15) as s:
            if cfg.get("use_tls", True):
                s.starttls()
            user = cfg.get("username") or os.environ.get("SMTP_USER")
            pwd = secrets.get("password") or os.environ.get("SMTP_PASSWORD")
            if user and pwd:
                s.login(user, pwd)
            s.send_message(msg)
    except Exception as exc:                     # noqa: BLE001
        logger.warning("SMTP test to %s failed: %s", body.to, exc)
        raise HTTPException(400, f"{type(exc).__name__}: {exc}")

    _log(db, p, "smtp_test", f"sent to {body.to}")
    return {"ok": True, "sentTo": str(body.to)}
