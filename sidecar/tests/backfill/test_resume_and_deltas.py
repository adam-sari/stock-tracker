"""Tests for the post-verification fixes to Plan 2: auto-resume and delta_shares recompute."""
from __future__ import annotations
from datetime import date, datetime, timezone
from unittest.mock import patch, MagicMock
import pytest
from sqlalchemy import text

from sidecar.db import get_session


def _epoch(d: date) -> int:
    return int(datetime(d.year, d.month, d.day, tzinfo=timezone.utc).timestamp())


def test_backfill_form4_auto_resumes_from_max_filed_at(fresh_db, monkeypatch):
    """If insider_txns already has rows, resume by refetching the MAX(filed_at) day.

    The day itself is refetched (not skipped past) because an interrupted run may
    have ingested only some of that day's filings; ON CONFLICT(id) DO NOTHING dedups.
    """
    monkeypatch.setenv("EDGAR_CONTACT_EMAIL", "test@example.com")
    # Pretend we ingested up to 2024-01-10 already
    with get_session() as s:
        s.execute(text(
            "INSERT INTO insider_txns (id, ticker, insider_name, code, is_derivative, shares, "
            "txn_date, filed_at, source) VALUES ('seed', 'AAPL', 'X', 'P', 0, 100, "
            "'2024-01-10', :fa, 'fixture')"
        ), {"fa": _epoch(date(2024, 1, 10))})
        s.commit()

    captured_ranges: list[str] = []

    def fake_get_filings(form, filing_date):
        captured_ranges.append(filing_date)
        return []

    fake_module = MagicMock(set_identity=MagicMock(), get_filings=fake_get_filings)
    with patch.dict("sys.modules", {"edgar": fake_module}):
        from sidecar.backfill.form4 import backfill_form4
        # Ask for 2024-01-01..2024-01-20 — should auto-resume from 2024-01-10 (refetch)
        result = backfill_form4(date(2024, 1, 1), date(2024, 1, 20), chunk_days=7, resume=True)

    # All captured ranges should start >= 2024-01-10 (day refetched, not skipped).
    assert all(r >= "2024-01-10" for r in captured_ranges), f"got ranges {captured_ranges}"
    # First chunk must include 2024-01-10 itself so same-day-but-later filings
    # missed by an interrupted run get a second chance.
    assert captured_ranges[0].startswith("2024-01-10:"), f"got first range {captured_ranges[0]}"
    assert result["resumed_from"] == "2024-01-10"


def test_backfill_form4_no_resume_runs_full_range(fresh_db, monkeypatch):
    """With resume=False, the full requested range is processed."""
    monkeypatch.setenv("EDGAR_CONTACT_EMAIL", "test@example.com")
    with get_session() as s:
        s.execute(text(
            "INSERT INTO insider_txns (id, ticker, insider_name, code, is_derivative, shares, "
            "txn_date, filed_at, source) VALUES ('seed', 'AAPL', 'X', 'P', 0, 100, "
            "'2024-01-10', :fa, 'fixture')"
        ), {"fa": _epoch(date(2024, 1, 10))})
        s.commit()

    captured_ranges: list[str] = []

    def fake_get_filings(form, filing_date):
        captured_ranges.append(filing_date)
        return []

    fake_module = MagicMock(set_identity=MagicMock(), get_filings=fake_get_filings)
    with patch.dict("sys.modules", {"edgar": fake_module}):
        from sidecar.backfill.form4 import backfill_form4
        result = backfill_form4(date(2024, 1, 1), date(2024, 1, 14), chunk_days=7, resume=False)

    # With resume=False, first chunk is 2024-01-01..01-07
    assert captured_ranges[0] == "2024-01-01:2024-01-07"
    assert result["resumed_from"] is None


def test_recompute_deltas_first_observation_stays_null(fresh_db):
    """The earliest period_end for a (cik, ticker) leaves delta_shares NULL."""
    with get_session() as s:
        s.execute(text(
            "INSERT INTO fund_holdings (filing_accession, cik, ticker, shares, value_usd, period_end, filed_at) "
            "VALUES ('acc1', '001', 'AAPL', 1000, 100000, '2024-03-31', 1715000000)"
        ))
        s.commit()
    from sidecar.backfill.thirteen_f import _recompute_deltas
    n = _recompute_deltas()
    assert n == 1
    with get_session() as s:
        row = s.execute(text("SELECT delta_shares FROM fund_holdings WHERE filing_accession='acc1'")).first()
        assert row[0] is None


def test_recompute_deltas_computes_diff_for_subsequent_periods(fresh_db):
    """Subsequent quarters get delta_shares = current - prior."""
    with get_session() as s:
        s.execute(text(
            "INSERT INTO fund_holdings (filing_accession, cik, ticker, shares, value_usd, period_end, filed_at) "
            "VALUES ('q1', '001', 'AAPL', 1000, 100000, '2024-03-31', 1715000000),"
            "       ('q2', '001', 'AAPL', 1500, 150000, '2024-06-30', 1722000000),"
            "       ('q3', '001', 'AAPL', 1200, 120000, '2024-09-30', 1730000000)"
        ))
        s.commit()
    from sidecar.backfill.thirteen_f import _recompute_deltas
    _recompute_deltas()
    with get_session() as s:
        rows = s.execute(text(
            "SELECT filing_accession, delta_shares FROM fund_holdings ORDER BY period_end"
        )).all()
    deltas = {r[0]: r[1] for r in rows}
    assert deltas["q1"] is None       # first observation
    assert deltas["q2"] == 500.0      # 1500 - 1000
    assert deltas["q3"] == -300.0     # 1200 - 1500


def test_recompute_deltas_isolates_per_cik_and_ticker(fresh_db):
    """delta_shares is computed within each (cik, ticker) partition, not across them."""
    with get_session() as s:
        s.execute(text(
            "INSERT INTO fund_holdings (filing_accession, cik, ticker, shares, value_usd, period_end, filed_at) "
            "VALUES ('a1', '001', 'AAPL', 1000, 100000, '2024-03-31', 1715000000),"
            "       ('b1', '002', 'AAPL', 5000, 500000, '2024-03-31', 1715000000),"
            "       ('a2', '001', 'AAPL', 1500, 150000, '2024-06-30', 1722000000),"
            "       ('b2', '002', 'AAPL', 4500, 450000, '2024-06-30', 1722000000)"
        ))
        s.commit()
    from sidecar.backfill.thirteen_f import _recompute_deltas
    _recompute_deltas()
    with get_session() as s:
        rows = s.execute(text(
            "SELECT filing_accession, delta_shares FROM fund_holdings ORDER BY filing_accession"
        )).all()
    deltas = {r[0]: r[1] for r in rows}
    assert deltas["a1"] is None       # first for (001, AAPL)
    assert deltas["a2"] == 500.0      # 1500 - 1000
    assert deltas["b1"] is None       # first for (002, AAPL)
    assert deltas["b2"] == -500.0     # 4500 - 5000
