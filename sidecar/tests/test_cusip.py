"""Test the CUSIP cache logic (without hitting OpenFIGI live)."""
from __future__ import annotations
import os
import shutil
import subprocess
import time
from pathlib import Path
from unittest.mock import patch, MagicMock
import pytest

PROJECT_ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def applied_schema(tmp_path, monkeypatch):
    db_path = tmp_path / "test.db"
    monkeypatch.setenv("DB_PATH", str(db_path))
    node_bin = str(PROJECT_ROOT / "node_modules" / ".bin")
    search_path = os.pathsep.join([node_bin, os.environ.get("PATH", "")])
    npx = shutil.which("npx", path=search_path) or "npx"
    subprocess.run(
        [npx, "tsx", "lib/db/migrate.ts"],
        cwd=PROJECT_ROOT,
        env={**os.environ, "DB_PATH": str(db_path)},
        check=True,
        capture_output=True,
    )
    import sidecar.db as db_module
    db_module._engine = None
    db_module._SessionLocal = None
    yield db_path


def test_lookup_returns_cached_values(applied_schema):
    """If the cache already has an entry, OpenFIGI is not called."""
    from sidecar.db import get_session
    from sqlalchemy import text
    with get_session() as session:
        session.execute(text("INSERT INTO cusip_ticker_map (cusip, ticker, resolved_at, source) VALUES ('037833100', 'AAPL', 0, 'test')"))
        session.commit()

    from sidecar.cusip import lookup_cusips
    with patch("sidecar.cusip.httpx.post") as mock_post:
        result = lookup_cusips(["037833100"])
        assert result == {"037833100": "AAPL"}
        mock_post.assert_not_called()


def test_lookup_hits_openfigi_and_caches(applied_schema):
    """Cache miss → OpenFIGI is called, result is written to cache."""
    fake = MagicMock()
    fake.status_code = 200
    fake.raise_for_status = MagicMock()
    fake.json = MagicMock(return_value=[
        {"data": [{"ticker": "NVDA", "securityType": "Common Stock"}]}
    ])

    from sidecar.cusip import lookup_cusips
    with patch("sidecar.cusip.httpx.post", return_value=fake):
        result = lookup_cusips(["67066G104"])  # NVDA's CUSIP
        assert result == {"67066G104": "NVDA"}

    # Cached?
    from sidecar.db import get_session
    from sqlalchemy import text
    with get_session() as session:
        row = session.execute(text("SELECT ticker FROM cusip_ticker_map WHERE cusip='67066G104'")).first()
        assert row[0] == "NVDA"
