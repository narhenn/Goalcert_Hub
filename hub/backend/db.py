"""
db.py — database engine + session (SQLite now, Postgres-ready).

Set DATABASE_URL to a Postgres DSN (postgresql+psycopg://user:pass@host/db)
and nothing else changes — the models and sessions are engine-agnostic.
"""
from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# Default: a SQLite file next to the backend. Override with DATABASE_URL in prod.
DEFAULT_SQLITE = f"sqlite:///{(Path(__file__).resolve().parent / 'goalcert_hub.db').as_posix()}"
DATABASE_URL = os.environ.get("DATABASE_URL", DEFAULT_SQLITE)

# check_same_thread only matters for SQLite; harmless to compute conditionally.
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def init_db() -> None:
    """Create tables. Import models first so they register on Base.metadata."""
    import models  # noqa: F401  (side-effect: registers tables)
    Base.metadata.create_all(bind=engine)


def get_db():
    """FastAPI dependency — yields a session, always closes it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
