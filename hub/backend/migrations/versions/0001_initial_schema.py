"""initial schema - organizations, users, audit_log

This is the baseline. It describes the schema that used to be created by
`Base.metadata.create_all()`, so it is written to be adoptable: every object is
created only if it is not already there. A database that predates migrations
(the local SQLite file, the deployed Postgres) can therefore run
`python manage.py migrate` once and simply be recorded as up to date.

Docstrings in migrations stay ASCII - `alembic history -v` prints them straight
to the console, and Windows consoles are cp1252.

Revision ID: 0001
Revises:
Created: 2026-07-30
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import context, op

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _existing() -> tuple[set[str], dict[str, set[str]]]:
    """(table names, {table: index names}) already present in the database."""
    if context.is_offline_mode():
        # --sql mode has no connection to inspect; emit the full schema.
        return set(), {}

    inspector = sa.inspect(op.get_bind())
    tables = set(inspector.get_table_names())
    indexes = {t: {ix["name"] for ix in inspector.get_indexes(t)} for t in tables}
    return tables, indexes


def upgrade() -> None:
    tables, indexes = _existing()

    if "organizations" not in tables:
        op.create_table(
            "organizations",
            sa.Column("id", sa.String(length=32), nullable=False),
            sa.Column("name", sa.String(length=160), nullable=False),
            sa.Column("slug", sa.String(length=80), nullable=False),
            sa.Column("status", sa.String(length=16), nullable=False),
            sa.Column("entitlements", sa.JSON(), nullable=False),
            sa.Column("policy", sa.JSON(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
            sa.UniqueConstraint("slug"),
        )

    if "users" not in tables:
        op.create_table(
            "users",
            sa.Column("id", sa.String(length=32), nullable=False),
            sa.Column("email", sa.String(length=200), nullable=False),
            sa.Column("full_name", sa.String(length=160), nullable=False),
            sa.Column("password_hash", sa.String(length=200), nullable=False),
            sa.Column("role", sa.String(length=24), nullable=False),
            sa.Column("status", sa.String(length=16), nullable=False),
            sa.Column("must_change_password", sa.Boolean(), nullable=False),
            sa.Column("org_id", sa.String(length=32), nullable=True),
            sa.Column("created_by", sa.String(length=32), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("last_login", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["org_id"], ["organizations.id"]),
            sa.PrimaryKeyConstraint("id"),
        )

    if "ix_users_email" not in indexes.get("users", set()):
        op.create_index("ix_users_email", "users", ["email"], unique=True)

    if "audit_log" not in tables:
        op.create_table(
            "audit_log",
            sa.Column("id", sa.String(length=32), nullable=False),
            sa.Column("actor_id", sa.String(length=32), nullable=True),
            sa.Column("actor_email", sa.String(length=200), nullable=False),
            sa.Column("org_id", sa.String(length=32), nullable=True),
            sa.Column("action", sa.String(length=64), nullable=False),
            sa.Column("detail", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.PrimaryKeyConstraint("id"),
        )


def downgrade() -> None:
    op.drop_table("audit_log")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
    op.drop_table("organizations")
