"""custom plans linked to enquiries; flat per-period pricing

Revision ID: 0007
Revises: 0006
Created: 2026-08-11 08:26:37.476792

Two changes that travel together:

1. Plans can be *custom* — a quote written against one enquiry, kept out of the
   public catalogue and the tenant marketplace.
2. Pricing is flat per billing period rather than per seat, so the stored
   periods lose their "/seat" segment ("/seat/yr" -> "/yr").

The per-seat columns `plans.unit` and `plans.min_qty` are deliberately NOT
dropped. Nothing reads them any more, but dropping them would discard what
existing tiers were sold on, and a column nobody writes costs nothing.
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '0007'
down_revision: Union[str, None] = '0006'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

FK_ENQUIRY = 'fk_plans_enquiry_id'


def upgrade() -> None:
    with op.batch_alter_table('plans', schema=None) as batch_op:
        # server_default is required, not cosmetic: these are NOT NULL columns
        # added to a table that already has rows, and without a default the
        # backfill has nothing to write.
        batch_op.add_column(sa.Column('is_custom', sa.Boolean(), nullable=False,
                                      server_default=sa.false()))
        batch_op.add_column(sa.Column('enquiry_id', sa.String(length=32), nullable=True))
        batch_op.add_column(sa.Column('quoted_to', sa.String(length=200), nullable=False,
                                      server_default=''))
        batch_op.create_index(batch_op.f('ix_plans_enquiry_id'), ['enquiry_id'], unique=False)
        batch_op.create_index(batch_op.f('ix_plans_is_custom'), ['is_custom'], unique=False)
        # Named, so downgrade can actually drop it.
        batch_op.create_foreign_key(FK_ENQUIRY, 'enquiries', ['enquiry_id'], ['id'],
                                    ondelete='SET NULL')

    # Per-seat periods become flat periods. Done as SQL rather than in Python so
    # it runs the same on SQLite, MySQL and Postgres without loading the ORM.
    plan_prices = sa.table('plan_prices', sa.column('period', sa.String))
    for old, new in (('/seat/yr', '/yr'), ('/seat/mo', '/mo'),
                     ('/seat/month', '/mo'), ('/seat/year', '/yr'), ('/seat', '')):
        op.execute(plan_prices.update().where(plan_prices.c.period == old)
                                       .values(period=new))


def downgrade() -> None:
    plan_prices = sa.table('plan_prices', sa.column('period', sa.String))
    for new, old in (('/yr', '/seat/yr'), ('/mo', '/seat/mo')):
        op.execute(plan_prices.update().where(plan_prices.c.period == new)
                                       .values(period=old))

    with op.batch_alter_table('plans', schema=None) as batch_op:
        batch_op.drop_constraint(FK_ENQUIRY, type_='foreignkey')
        batch_op.drop_index(batch_op.f('ix_plans_is_custom'))
        batch_op.drop_index(batch_op.f('ix_plans_enquiry_id'))
        batch_op.drop_column('quoted_to')
        batch_op.drop_column('enquiry_id')
        batch_op.drop_column('is_custom')
