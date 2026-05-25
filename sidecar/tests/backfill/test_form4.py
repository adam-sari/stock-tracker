"""Tests for sidecar.backfill.form4 — date-chunked Form 4 backfill."""
from __future__ import annotations
from datetime import date
from unittest.mock import patch, MagicMock
import pytest


def test_backfill_form4_chunks_date_range(fresh_db, monkeypatch):
    monkeypatch.setenv("EDGAR_CONTACT_EMAIL", "test@example.com")
    fake_set_identity = MagicMock()
    captured_calls = []

    def fake_get_filings(form, filing_date):
        captured_calls.append(filing_date)
        return []

    fake_module = MagicMock(set_identity=fake_set_identity, get_filings=fake_get_filings)
    with patch.dict("sys.modules", {"edgar": fake_module}):
        from sidecar.backfill.form4 import backfill_form4
        result = backfill_form4(date(2024, 1, 1), date(2024, 1, 22), chunk_days=7)

    # Expect 4 chunks: [1-7], [8-14], [15-21], [22-22]
    assert len(captured_calls) == 4
    assert captured_calls[0] == "2024-01-01:2024-01-07"
    assert captured_calls[1] == "2024-01-08:2024-01-14"
    assert captured_calls[-1].endswith(":2024-01-22")
    assert result["chunks"] == 4
    assert result["inserted"] == 0


def test_backfill_form4_aggregates_per_chunk_counts(fresh_db, monkeypatch):
    monkeypatch.setenv("EDGAR_CONTACT_EMAIL", "test@example.com")
    fake_set_identity = MagicMock()
    counter = {"n": 0}

    def fake_get_filings(form, filing_date):
        counter["n"] += 1
        return []

    fake_module = MagicMock(set_identity=fake_set_identity, get_filings=fake_get_filings)
    with patch.dict("sys.modules", {"edgar": fake_module}):
        from sidecar.backfill.form4 import backfill_form4
        result = backfill_form4(date(2024, 1, 1), date(2024, 1, 14), chunk_days=7)

    assert counter["n"] == 2
    assert "errors" in result
