"""Smoke test: scan_13f runs without crashing when no curated funds exist."""
from __future__ import annotations
import os
import subprocess
from pathlib import Path
from unittest.mock import patch, MagicMock
import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def applied_schema(tmp_path, monkeypatch):
    db_path = tmp_path / "test.db"
    monkeypatch.setenv("DB_PATH", str(db_path))
    monkeypatch.setenv("EDGAR_CONTACT_EMAIL", "test@example.com")
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
    from sidecar.seed_funds import seed_funds, CURATED_FUNDS
    n = seed_funds()
    # n may be > len(CURATED_FUNDS) if duplicate CIKs are in the list — that's fine
    assert n > 0

    from sidecar.db import get_session
    from sqlalchemy import text
    with get_session() as session:
        rows = session.execute(text("SELECT cik, name, is_curated FROM funds")).all()
        assert len(rows) >= 1
        assert any(r[0] == "0001067983" for r in rows)  # Berkshire CIK


def test_scan_13f_with_empty_funds_runs_clean(applied_schema):
    fake_set_identity = MagicMock()
    fake_module = MagicMock(set_identity=fake_set_identity)
    # PyPI package is `edgartools` but the import name is `edgar` — patch the import name
    with patch.dict("sys.modules", {"edgar": fake_module}):
        from sidecar.jobs.scan_13f import scan_13f
        result = scan_13f()
    assert result["funds"] == 0
    assert result["errors"] == 0
