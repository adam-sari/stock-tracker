"""Shared SQLite engine for the stock-tracker DB.

The Node process applies the schema. We attach read/write via SQLAlchemy
in WAL mode so writes from Plan 2's jobs don't block Node's reads.
"""
from __future__ import annotations
import os
from pathlib import Path
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, Session

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DB_PATH = PROJECT_ROOT / "db" / "stocks.db"


def _resolve_db_path() -> Path:
    env_path = os.environ.get("DB_PATH")
    return Path(env_path).resolve() if env_path else DEFAULT_DB_PATH


def make_engine():
    db_path = _resolve_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(f"sqlite:///{db_path}", future=True)

    @event.listens_for(engine, "connect")
    def _set_pragmas(dbapi_conn, _):
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode = WAL")
        cur.execute("PRAGMA foreign_keys = ON")
        cur.close()

    return engine


_engine = None
_SessionLocal = None


def get_session() -> Session:
    global _engine, _SessionLocal
    if _engine is None:
        _engine = make_engine()
        _SessionLocal = sessionmaker(bind=_engine, autoflush=False, expire_on_commit=False, future=True)
    return _SessionLocal()
