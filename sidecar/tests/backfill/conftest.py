"""Shared backfill test fixtures."""
from __future__ import annotations
import os
import shutil
import subprocess
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[3]


@pytest.fixture
def fresh_db(tmp_path, monkeypatch):
    """Apply schema to a fresh DB and return its path."""
    db_path = tmp_path / "backfill.db"
    monkeypatch.setenv("DB_PATH", str(db_path))
    node_bin = str(PROJECT_ROOT / "node_modules" / ".bin")
    search_path = os.pathsep.join([node_bin, os.environ.get("PATH", "")])
    npx = shutil.which("npx", path=search_path) or "npx"
    subprocess.run(
        [npx, "tsx", "lib/db/migrate.ts"],
        cwd=PROJECT_ROOT,
        env={**os.environ, "DB_PATH": str(db_path)},
        check=True, capture_output=True,
    )
    import sidecar.db as db_module
    db_module._engine = None
    db_module._SessionLocal = None
    return db_path
