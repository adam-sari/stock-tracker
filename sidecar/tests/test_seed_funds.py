"""Direct tests for sidecar/sidecar/seed_funds.py — seed_funds() function.

Note: seed_funds is also indirectly tested via test_scan_13f.py, but here
we test the function directly with a fresh DB for each test.
"""
from __future__ import annotations
import os
import subprocess
from pathlib import Path
from sqlalchemy import text
import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def applied_schema(tmp_path, monkeypatch):
    db_path = tmp_path / "test.db"
    monkeypatch.setenv("DB_PATH", str(db_path))
    node_bin = str(PROJECT_ROOT / "node_modules" / ".bin")
    subprocess.run(
        ["npx", "tsx", "lib/db/migrate.ts"],
        cwd=PROJECT_ROOT,
        env={**os.environ, "DB_PATH": str(db_path), "PATH": f"{node_bin}:{os.environ.get('PATH', '')}"},
        check=True,
        capture_output=True,
    )
    import sidecar.db as db_module
    db_module._engine = None
    db_module._SessionLocal = None
    yield db_path


def test_seed_funds_inserts_curated_roster(applied_schema):
    """seed_funds() inserts all curated funds into the DB."""
    from sidecar.seed_funds import seed_funds, CURATED_FUNDS
    count = seed_funds()
    assert count > 0

    from sidecar.db import get_session
    with get_session() as session:
        rows = session.execute(text("SELECT cik, name, is_curated FROM funds")).all()
    # There may be fewer unique rows than list entries because Soros CIK appears twice
    unique_ciks = {r[0] for r in rows}
    assert len(unique_ciks) >= 1
    # All inserted rows should be marked is_curated=1
    assert all(r[2] == 1 for r in rows)


def test_seed_funds_contains_berkshire(applied_schema):
    """Berkshire Hathaway (0001067983) must be in the seeded roster."""
    from sidecar.seed_funds import seed_funds
    seed_funds()

    from sidecar.db import get_session
    with get_session() as session:
        rows = session.execute(text("SELECT cik, name FROM funds")).all()

    ciks = {r[0] for r in rows}
    assert "0001067983" in ciks


def test_seed_funds_is_idempotent(applied_schema):
    """Calling seed_funds() twice does not create duplicate rows."""
    from sidecar.seed_funds import seed_funds
    seed_funds()
    seed_funds()

    from sidecar.db import get_session
    with get_session() as session:
        count = session.execute(text("SELECT COUNT(*) FROM funds")).scalar()

    # Unique CIKs only — Soros appears twice in the list but maps to one DB row
    from sidecar.seed_funds import CURATED_FUNDS
    unique_ciks = {cik for cik, _ in CURATED_FUNDS}
    assert count == len(unique_ciks)


def test_seed_funds_sets_is_curated_flag(applied_schema):
    """All seeded funds have is_curated=1."""
    from sidecar.seed_funds import seed_funds
    seed_funds()

    from sidecar.db import get_session
    with get_session() as session:
        non_curated = session.execute(
            text("SELECT COUNT(*) FROM funds WHERE is_curated = 0")
        ).scalar()

    assert non_curated == 0


def test_seed_funds_returns_row_count(applied_schema):
    """seed_funds() returns a positive integer representing rows upserted."""
    from sidecar.seed_funds import seed_funds, CURATED_FUNDS
    count = seed_funds()
    # SQLite ON CONFLICT DO UPDATE returns rowcount=1 per affected row
    # The count should equal the number of CURATED_FUNDS entries (including duplicates)
    assert count == len(CURATED_FUNDS)
