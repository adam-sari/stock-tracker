"""Tests for backfill_form4 resume cursor logic.

Regression test for bug-hunt #5: `_max_filed_at_date` floored MAX(filed_at)
to date then `+1 day`, silently skipping the rest of the resumed-from day.
Fix: re-fetch the resumed-from day; ON CONFLICT(id) DO NOTHING dedups.
"""
from __future__ import annotations
import os
import shutil
import subprocess
import time
from datetime import date, datetime, timezone
from pathlib import Path
from unittest.mock import patch, MagicMock

import pytest
from sqlalchemy import text

PROJECT_ROOT = Path(__file__).resolve().parents[2]


@pytest.fixture
def applied_schema(tmp_path, monkeypatch):
    db_path = tmp_path / "test.db"
    monkeypatch.setenv("DB_PATH", str(db_path))
    monkeypatch.setenv("EDGAR_CONTACT_EMAIL", "test@example.com")
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


def _insert_filing(session, *, accession: str, ticker: str, filed_at_ts: int):
    session.execute(
        text(
            "INSERT INTO insider_txns (id, ticker, insider_name, code, is_derivative, shares, "
            "price, value, txn_date, filed_at, filing_url, source) "
            "VALUES (:id, :ticker, 'Test Insider', 'P', 0, 100, 10.0, 1000.0, '2024-03-15', "
            ":filed_at, 'https://example.com', 'edgar')"
        ),
        {"id": accession, "ticker": ticker, "filed_at": filed_at_ts},
    )


def test_resume_refetches_max_filed_at_day(applied_schema):
    """If a previous run ingested filings up to 2024-03-15, a resumed run should
    refetch 2024-03-15 (so same-day later filings get a chance), not start from 2024-03-16."""
    from sidecar.db import get_session

    # Pre-populate 5 filings on 2024-03-15 at hours 09:00..13:00 UTC.
    # (Production currently stores midnight due to a separate bug, but we use
    # distinct timestamps here to make the MAX semantics explicit.)
    day = date(2024, 3, 15)
    base = int(datetime(2024, 3, 15, 9, 0, 0, tzinfo=timezone.utc).timestamp())
    with get_session() as session:
        for i, hour_offset in enumerate([0, 3600, 7200, 10800, 14400]):  # 09:00..13:00
            _insert_filing(
                session,
                accession=f"acc-{i}",
                ticker="AAPL",
                filed_at_ts=base + hour_offset,
            )
        session.commit()

    captured_calls = []

    def fake_range(start: date, end: date) -> dict:
        captured_calls.append((start, end))
        return {"inserted": 0, "skipped": 0, "errors": 0}

    # Patch the import inside form4.py
    with patch("sidecar.backfill.form4._scan_form4_range", side_effect=fake_range):
        # Also patch edgartools so set_identity import doesn't fail
        fake_edgar = MagicMock(set_identity=MagicMock())
        with patch.dict("sys.modules", {"edgar": fake_edgar}):
            from sidecar.backfill.form4 import backfill_form4
            result = backfill_form4(
                start_date=date(2024, 3, 1),
                end_date=date(2024, 3, 20),
                chunk_days=30,  # one chunk
                resume=True,
            )

    assert len(captured_calls) >= 1, "backfill should have invoked _scan_form4_range"
    actual_start, actual_end = captured_calls[0]

    # The bug: resume jumped to 2024-03-16, dropping same-day later filings.
    # The fix: resume from 2024-03-15 itself; ON CONFLICT(id) DO NOTHING dedups.
    assert actual_start == day, (
        f"Expected resume to refetch {day} (the MAX(filed_at) day) so same-day "
        f"later filings aren't dropped; got start={actual_start}. "
        f"Bug: code floored MAX(filed_at) to date and added 1 day."
    )
    assert result["resumed_from"] == str(day)


def test_resume_with_no_data_uses_start_date_unchanged(applied_schema):
    """When insider_txns is empty, no resume happens — start_date used as-is."""
    captured_calls = []

    def fake_range(start: date, end: date) -> dict:
        captured_calls.append((start, end))
        return {"inserted": 0, "skipped": 0, "errors": 0}

    with patch("sidecar.backfill.form4._scan_form4_range", side_effect=fake_range):
        fake_edgar = MagicMock(set_identity=MagicMock())
        with patch.dict("sys.modules", {"edgar": fake_edgar}):
            from sidecar.backfill.form4 import backfill_form4
            result = backfill_form4(
                start_date=date(2024, 3, 1),
                end_date=date(2024, 3, 5),
                chunk_days=30,
                resume=True,
            )

    assert captured_calls == [(date(2024, 3, 1), date(2024, 3, 5))]
    assert result["resumed_from"] is None


def test_resume_skips_only_strictly_earlier_days(applied_schema):
    """If data through 2024-03-15 exists and we ask for 2024-03-20..2024-03-25,
    resume should not move start_date *backwards*."""
    from sidecar.db import get_session

    base = int(datetime(2024, 3, 15, 12, 0, 0, tzinfo=timezone.utc).timestamp())
    with get_session() as session:
        _insert_filing(session, accession="acc-x", ticker="AAPL", filed_at_ts=base)
        session.commit()

    captured_calls = []

    def fake_range(start: date, end: date) -> dict:
        captured_calls.append((start, end))
        return {"inserted": 0, "skipped": 0, "errors": 0}

    with patch("sidecar.backfill.form4._scan_form4_range", side_effect=fake_range):
        fake_edgar = MagicMock(set_identity=MagicMock())
        with patch.dict("sys.modules", {"edgar": fake_edgar}):
            from sidecar.backfill.form4 import backfill_form4
            result = backfill_form4(
                start_date=date(2024, 3, 20),
                end_date=date(2024, 3, 25),
                chunk_days=30,
                resume=True,
            )

    # MAX(filed_at) day is 2024-03-15, but our requested range starts at 2024-03-20.
    # Resume must not pull start backwards.
    assert captured_calls == [(date(2024, 3, 20), date(2024, 3, 25))]
    assert result["resumed_from"] is None
