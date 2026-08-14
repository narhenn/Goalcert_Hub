"""
db.py — database engine + session. Engine-agnostic: the models and sessions
do not care which backend DATABASE_URL points at.

    sqlite:///./goalcert_hub.db                        (default, no server)
    mysql+pymysql://root@127.0.0.1:3306/goalcert_hub   (local Laragon/XAMPP)
    postgresql+psycopg://user:pass@host/db             (Render / RDS)

The schema is owned by Alembic (see migrations/ and manage.py), never by
create_all(): every change is a reviewable file that runs the same way on a
laptop and on Render.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path

logger = logging.getLogger("hub-backend")

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# Load .env here rather than only in server.py: manage.py and the Alembic env
# import this module directly, and they must resolve the same DATABASE_URL the
# server does. On Render there is no .env and the real environment wins.
try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent / ".env")
except ImportError:
    pass

# Default: a SQLite file next to the backend. Override with DATABASE_URL in prod.
DEFAULT_SQLITE = f"sqlite:///{(Path(__file__).resolve().parent / 'goalcert_hub.db').as_posix()}"
DATABASE_URL = os.environ.get("DATABASE_URL", DEFAULT_SQLITE)

# check_same_thread only matters for SQLite; harmless to compute conditionally.
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


# ── Migrations ────────────────────────────────────────────────────────
BACKEND_DIR = Path(__file__).resolve().parent
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"
MIGRATIONS_DIR = BACKEND_DIR / "migrations"

_FALSEY = {"0", "false", "no", "off"}


def alembic_config():
    """Alembic config with absolute paths, so the caller's cwd never matters."""
    from alembic.config import Config

    cfg = Config(str(ALEMBIC_INI))
    cfg.set_main_option("script_location", str(MIGRATIONS_DIR))
    return cfg


def run_migrations() -> None:
    """Apply every pending migration. Idempotent — a no-op when already at head."""
    from alembic import command

    command.upgrade(alembic_config(), "head")


def current_revision() -> str | None:
    """The revision this database is stamped with (None = never migrated)."""
    from alembic.runtime.migration import MigrationContext

    with engine.connect() as conn:
        return MigrationContext.configure(conn).get_current_revision()


def head_revision() -> str | None:
    """The newest revision that exists in migrations/versions."""
    from alembic.script import ScriptDirectory

    return ScriptDirectory.from_config(alembic_config()).get_current_head()


def ensure_schema() -> None:
    """
    Called on startup. AUTO_MIGRATE=1 (the default) upgrades to head; set
    AUTO_MIGRATE=0 when a deploy pipeline runs `alembic upgrade head` itself,
    and the server will merely refuse to boot against an out-of-date schema
    instead of migrating behind your back.
    """
    if os.environ.get("AUTO_MIGRATE", "1").strip().lower() not in _FALSEY:
        run_migrations()
        logger.info("schema at head (%s)", head_revision())
        return

    current, head = current_revision(), head_revision()
    if current != head:
        raise RuntimeError(
            f"database schema is at {current or 'no revision'}, code expects {head}. "
            f"Run: python manage.py migrate"
        )


# Older name, kept so nothing that imports it breaks. It no longer creates
# tables — migrations do.
init_db = ensure_schema


def get_db():
    """FastAPI dependency — yields a session, always closes it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
