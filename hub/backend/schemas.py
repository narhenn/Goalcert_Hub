"""schemas.py — request/response bodies for auth + admin."""
from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


class OrgCreate(BaseModel):
    name: str = Field(min_length=2)
    slug: Optional[str] = None
    entitlements: Optional[list[str]] = None
    # optionally bootstrap the org's first admin in one call
    admin_email: Optional[EmailStr] = None
    admin_name: Optional[str] = None
    admin_password: Optional[str] = None


class OrgUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None
    entitlements: Optional[list[str]] = None
    policy: Optional[dict] = None


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str = ""
    role: str
    password: str = Field(min_length=8)
    org_id: Optional[str] = None            # super_admin may target any org
    must_change_password: bool = True


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    role: Optional[str] = None
    status: Optional[str] = None


class ResetPasswordRequest(BaseModel):
    new_password: str = Field(min_length=8)
    must_change_password: bool = True
