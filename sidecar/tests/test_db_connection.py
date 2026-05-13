"""Verify the Python sidecar can read the schema applied by Node."""
from __future__ import annotations
import importlib
import os
import subprocess
from pathlib import Path

import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def applied_schema(tmp_path, monkeypatch):
    db_path = tmp_path / "test.db"
    monkeypatch.setenv("DB_PATH", str(db_path))

    # Reset module-level engine cache so the new DB_PATH env var takes effect
    import sidecar.db as db_module
    db_module._engine = None
    db_module._SessionLocal = None

    node_bin = str(PROJECT_ROOT / "node_modules" / ".bin")
    env = {**os.environ, "DB_PATH": str(db_path), "PATH": f"{node_bin}:{os.environ.get('PATH', '')}"}
    subprocess.run(
        ["npx", "tsx", "lib/db/migrate.ts"],
        cwd=PROJECT_ROOT,
        env=env,
        check=True,
        capture_output=True,
    )
    yield db_path

    # Clean up engine cache after test
    db_module._engine = None
    db_module._SessionLocal = None


def test_python_sees_schema_version(applied_schema):
    from sidecar.db import get_session
    from sidecar.models import SchemaVersion
    with get_session() as session:
        v = session.query(SchemaVersion).order_by(SchemaVersion.version.desc()).first()
        assert v is not None
        assert v.version >= 2
