"""
storage.py — where uploaded files go.

One interface, two drivers. Callers say `save(file, folder)` and get back a URL;
they never learn whether the bytes landed on local disk or in S3. That is the
whole point — swapping the driver is a settings change, not a code change, and
no upload path is hardcoded at a call site.

Driver selection, in order:
    1. the `storage` row in app_settings (set from the admin UI)
    2. STORAGE_DRIVER in the environment
    3. local disk

Local files are written under MEDIA_ROOT and served at /media by server.py.
"""
from __future__ import annotations

import logging
import os
import re
import uuid
from datetime import datetime
from pathlib import Path
from typing import BinaryIO

logger = logging.getLogger("hub-backend")

BACKEND_DIR = Path(__file__).resolve().parent
MEDIA_ROOT = Path(os.environ.get("MEDIA_ROOT", BACKEND_DIR / "media")).resolve()
MEDIA_URL = os.environ.get("MEDIA_URL", "/media")

# What may be uploaded, and how big. Enforced here rather than at each caller so
# a new upload surface cannot accidentally accept an executable.
IMAGE_TYPES = {
    "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp",
    "image/gif": ".gif", "image/svg+xml": ".svg",
}
VIDEO_TYPES = {
    "video/mp4": ".mp4", "video/webm": ".webm", "video/quicktime": ".mov",
}
ALLOWED = {**IMAGE_TYPES, **VIDEO_TYPES}

MAX_IMAGE_BYTES = int(os.environ.get("MAX_IMAGE_BYTES", 8 * 1024 * 1024))     # 8 MB
MAX_VIDEO_BYTES = int(os.environ.get("MAX_VIDEO_BYTES", 200 * 1024 * 1024))   # 200 MB

_SAFE = re.compile(r"[^a-zA-Z0-9._-]+")


class StorageError(RuntimeError):
    """Raised for anything the caller should surface to the user verbatim."""


def _safe_name(filename: str, content_type: str) -> str:
    """
    A collision-proof, traversal-proof object name.

    The original name is only a hint: it is stripped to a safe stem and given a
    fresh uuid, so "../../etc/passwd" and two files both called "logo.png"
    are equally harmless.
    """
    stem = Path(filename or "file").stem
    stem = _SAFE.sub("-", stem).strip("-")[:48] or "file"
    ext = ALLOWED.get(content_type) or Path(filename or "").suffix.lower() or ""
    if ext not in ALLOWED.values():
        ext = ALLOWED.get(content_type, "")
    return f"{stem}-{uuid.uuid4().hex[:10]}{ext}"


def safe_folder(folder: str) -> str:
    """
    Keep the caller's nesting ("microservices/thumbnails") but sanitise each
    segment independently, so a hierarchy survives while ".." never does.
    """
    parts = []
    for seg in (folder or "misc").split("/"):
        seg = _SAFE.sub("-", seg).strip("-.")
        if seg and seg != "..":
            parts.append(seg[:40])
    return "/".join(parts) or "misc"


def validate(content_type: str, size: int) -> None:
    if content_type not in ALLOWED:
        raise StorageError(
            f"Unsupported file type '{content_type}'. Allowed: "
            f"{', '.join(sorted(ALLOWED))}")
    cap = MAX_VIDEO_BYTES if content_type in VIDEO_TYPES else MAX_IMAGE_BYTES
    if size > cap:
        raise StorageError(
            f"File is {size / 1048576:.1f} MB — the limit for this type is "
            f"{cap / 1048576:.0f} MB")


# ── drivers ───────────────────────────────────────────────────────────

class LocalDriver:
    """Disk under MEDIA_ROOT. The default, and what makes uploads work today."""

    name = "local"

    def save(self, data: bytes, folder: str, filename: str) -> str:
        # date-partitioned so one directory never accumulates a million files
        rel = Path(safe_folder(folder)) / datetime.utcnow().strftime("%Y/%m") / filename
        dest = (MEDIA_ROOT / rel).resolve()

        # Belt and braces: even with a sanitised name, never write outside root.
        if not str(dest).startswith(str(MEDIA_ROOT)):
            raise StorageError("Refusing to write outside the media root")

        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(data)
        return f"{MEDIA_URL}/{rel.as_posix()}"

    def delete(self, url: str) -> bool:
        if not url or not url.startswith(MEDIA_URL):
            return False
        rel = url[len(MEDIA_URL):].lstrip("/")
        target = (MEDIA_ROOT / rel).resolve()
        if not str(target).startswith(str(MEDIA_ROOT)) or not target.is_file():
            return False
        target.unlink()
        return True


class S3Driver:
    """
    Amazon S3 (or any S3-compatible endpoint).

    boto3 is imported lazily so the platform runs without it installed — a
    deployment that never selects S3 should not need the dependency.
    """

    name = "s3"

    def __init__(self, cfg: dict, secrets: dict):
        self.bucket = cfg.get("bucket")
        self.region = cfg.get("region") or "us-east-1"
        self.endpoint = cfg.get("endpoint") or None
        self.base_url = (cfg.get("base_url") or "").rstrip("/")
        self.key = secrets.get("access_key_id")
        self.secret = secrets.get("secret_access_key")
        if not self.bucket:
            raise StorageError("S3 storage is selected but no bucket is configured")

    def _client(self):
        try:
            import boto3
        except ImportError:
            raise StorageError(
                "S3 storage is selected but boto3 is not installed. "
                "Add `boto3` to requirements.txt and redeploy, or switch to local storage.")
        return boto3.client(
            "s3", region_name=self.region, endpoint_url=self.endpoint,
            aws_access_key_id=self.key, aws_secret_access_key=self.secret)

    def save(self, data: bytes, folder: str, filename: str) -> str:
        key = f"{safe_folder(folder)}/{datetime.utcnow():%Y/%m}/{filename}"
        self._client().put_object(Bucket=self.bucket, Key=key, Body=data)
        if self.base_url:                       # CDN or custom domain in front
            return f"{self.base_url}/{key}"
        host = self.endpoint or f"https://{self.bucket}.s3.{self.region}.amazonaws.com"
        return f"{host.rstrip('/')}/{key}"

    def delete(self, url: str) -> bool:
        try:
            key = url.split(f"{self.bucket}/", 1)[-1] if self.bucket in url else None
            if not key:
                return False
            self._client().delete_object(Bucket=self.bucket, Key=key)
            return True
        except Exception as exc:                # noqa: BLE001
            logger.warning("s3 delete failed for %s: %s", url, exc)
            return False


def get_driver(db=None):
    """
    Resolve the active driver. Settings win over env; local is the fallback so
    an unconfigured platform still accepts uploads instead of erroring.
    """
    cfg, secrets, driver = {}, {}, os.environ.get("STORAGE_DRIVER", "local")

    if db is not None:
        try:
            from settings_models import AppSetting
            row = db.query(AppSetting).filter_by(namespace="storage").first()
            if row:
                cfg = row.values or {}
                secrets = row.secrets or {}
                driver = cfg.get("driver") or driver
        except Exception as exc:                # noqa: BLE001
            logger.warning("storage settings unreadable (%s) — falling back to local", exc)

    if driver == "s3":
        return S3Driver(cfg, secrets)
    return LocalDriver()


def save_upload(db, data: bytes, folder: str, filename: str, content_type: str) -> dict:
    """Validate then persist. Returns the record the API hands back."""
    validate(content_type, len(data))
    driver = get_driver(db)
    url = driver.save(data, folder, _safe_name(filename, content_type))
    logger.info("upload: %s (%s, %.1f KB) -> %s", filename, content_type, len(data) / 1024, url)
    return {
        "url": url, "driver": driver.name, "contentType": content_type,
        "size": len(data), "filename": filename,
    }
