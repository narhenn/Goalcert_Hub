"""
env.py — Alembic runtime wiring.

Pulls the connection URL and the model metadata from the app itself (db.py +
models.py), so `alembic upgrade head` and the running server can never disagree
about which database they mean. Nothing here needs editing when you add tables:
import them in models.py and they show up in `--autogenerate`.
"""
from __future__ import annotations

import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import create_engine

# migrations/ lives inside hub/backend — make the backend importable whether
# alembic was launched from here, from manage.py, or programmatically.
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from db import DATABASE_URL, Base  # noqa: E402
import models  # noqa: E402,F401  (side-effect: registers tables on Base.metadata)

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# SQLite cannot ALTER most things in place; batch mode rewrites the table
# instead. Harmless on Postgres, so we only turn it on where it is needed.
IS_SQLITE = DATABASE_URL.startswith("sqlite")


def run_migrations_offline() -> None:
    """`alembic upgrade head --sql` — emit SQL without touching a database."""
    context.configure(
        url=DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
        render_as_batch=IS_SQLITE,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Normal path — connect and apply."""
    connectable = config.attributes.get("connection", None)

    if connectable is not None:  # reusing a connection handed in by the app
        _run(connectable)
        return

    connect_args = {"check_same_thread": False} if IS_SQLITE else {}
    engine = create_engine(DATABASE_URL, connect_args=connect_args, pool_pre_ping=True)
    try:
        with engine.connect() as connection:
            _run(connection)
    finally:
        engine.dispose()


def _run(connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
        render_as_batch=IS_SQLITE,
    )
    with context.begin_transaction():
        context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
