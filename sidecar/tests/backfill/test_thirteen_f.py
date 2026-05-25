"""Tests for sidecar.backfill.thirteen_f — historical 13F backfill across curated funds."""
from __future__ import annotations
from unittest.mock import patch, MagicMock
import pytest
from sqlalchemy import text

from sidecar.db import get_session


def test_backfill_13f_loops_over_quarters_per_fund(fresh_db, monkeypatch):
    monkeypatch.setenv("EDGAR_CONTACT_EMAIL", "test@example.com")
    with get_session() as s:
        s.execute(text(
            "INSERT INTO funds (cik, name, is_curated) VALUES ('001', 'TestFund', 1)"
        ))
        s.commit()

    fake_filings = []
    for i in range(5):
        f = MagicMock()
        f.accession_no = f"acc-{i}"
        f.filing_date = MagicMock(timetuple=lambda: __import__("time").gmtime(1700000000 + i * 90 * 86400))
        f.obj.return_value = MagicMock(report_period=f"2023-Q{(i % 4) + 1}", infotable=None)
        fake_filings.append(f)

    fake_company = MagicMock(get_filings=MagicMock(return_value=fake_filings))
    fake_set_identity = MagicMock()
    fake_module = MagicMock(set_identity=fake_set_identity, Company=MagicMock(return_value=fake_company))

    with patch.dict("sys.modules", {"edgar": fake_module}):
        from sidecar.backfill.thirteen_f import backfill_13f
        result = backfill_13f(quarters_back=4)

    assert result["funds"] == 1
    assert result["filings"] == 4
