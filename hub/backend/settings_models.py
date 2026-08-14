"""
settings_models.py — platform configuration that lives in the database.

One table, keyed by a namespace ("smtp", "storage", "branding"), each holding a
JSON blob. A namespace is added by writing a row, not by migrating a column,
which is what keeps "add a setting" from being a schema change.

Secrets (SMTP password, S3 secret key) live in `secrets` and are NEVER returned
by to_public(). The UI is told which keys are set, never their values.
"""
from __future__ import annotations

import uuid

from sqlalchemy import JSON, Boolean, String
from sqlalchemy.orm import Mapped, mapped_column

from db import Base
from rbac_models import TimestampMixin


def _uuid() -> str:
    return uuid.uuid4().hex


class AppSetting(Base, TimestampMixin):
    __tablename__ = "app_settings"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    namespace: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    # Everything safe to show: host, port, region, bucket, from-address…
    values: Mapped[dict] = mapped_column(JSON, default=dict)
    # Credentials. Write-only as far as the API is concerned.
    secrets: Mapped[dict] = mapped_column(JSON, default=dict)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=False)

    def to_public(self) -> dict:
        s = self.secrets or {}
        return {
            "namespace": self.namespace,
            "values": self.values or {},
            # which credentials exist — never what they are
            "configuredSecrets": sorted(k for k, v in s.items() if v),
            "isEnabled": self.is_enabled,
            "updatedAt": self.updated_at.isoformat() if self.updated_at else None,
        }
