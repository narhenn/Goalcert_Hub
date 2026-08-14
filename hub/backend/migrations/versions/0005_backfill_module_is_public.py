"""backfill modules.is_public for rows that predate the column

0004 added `is_public` as NOT NULL with no server default. New rows get the
model default (True), but MySQL filled every EXISTING row with 0 — quietly
unpublishing the seven microservices that were already in the table.

This is the "new non-nullable column on a populated table" case: add, backfill,
then constrain. 0004 skipped the backfill, so it happens here rather than by
editing a migration that has already run.

Scoped deliberately: only the modules seeded by rbac_seed are republished. A
service the owner has since unpublished on purpose is left alone.

Revision ID: 0005
Revises: 0004
Created: 2026-07-30
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: Union[str, None] = "0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# The codes rbac_seed installs. Only these are corrected.
SEEDED = ("twin", "scenario", "agentic", "hivemind", "agentbuilder",
          "frontline", "supervisor")


def upgrade() -> None:
    op.execute(
        sa.text("UPDATE modules SET is_public = 1 WHERE code IN :codes AND is_public = 0")
        .bindparams(sa.bindparam("codes", value=SEEDED, expanding=True))
    )


def downgrade() -> None:
    # Restoring "accidentally unpublished" is not a state worth recreating.
    pass
