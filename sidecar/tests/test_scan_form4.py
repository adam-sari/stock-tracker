"""Smoke test: scan_form4 runs without crashing, records a job_runs entry.

We don't mock edgartools — instead, run with days_back=0 so it returns
an empty filing set. The test verifies the wiring (DB connection, job_runs
audit, error handling) without requiring live network.
"""
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


def test_scan_form4_with_no_filings_succeeds(applied_schema):
    """Patch edgartools to return [] and verify the job completes."""
    fake_set_identity = MagicMock()
    fake_get_filings = MagicMock(return_value=[])
    fake_module = MagicMock(set_identity=fake_set_identity, get_filings=fake_get_filings)

    # PyPI package is `edgartools` but the import name is `edgar` — patch the import name
    with patch.dict("sys.modules", {"edgar": fake_module}):
        from sidecar.jobs.scan_form4 import scan_form4
        result = scan_form4(days_back=1)

    assert result["inserted"] == 0
    assert result["errors"] == 0

    # job_runs entry recorded
    from sidecar.db import get_session
    from sqlalchemy import text
    with get_session() as session:
        row = session.execute(text("SELECT job, status FROM job_runs ORDER BY id DESC LIMIT 1")).first()
        assert row[0] == "scan_form4"
        assert row[1] == "ok"
