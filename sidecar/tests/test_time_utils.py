"""Tests for the filed_at epoch conversion helper.

Prior bug: scan_form4 / scan_13f used `time.mktime` which interprets
struct_time as host-local. `filed_at` then varied by deployment TZ and
shifted filings across UTC day boundaries on non-UTC hosts. The fix is
`calendar.timegm`, which interprets struct_time as UTC.
"""
from __future__ import annotations
import os
import time
from datetime import date

import pytest

from sidecar.jobs.time_utils import date_to_utc_epoch


def test_returns_utc_midnight_for_known_date():
    # 2024-03-15 00:00:00 UTC = 1710460800
    assert date_to_utc_epoch(date(2024, 3, 15)) == 1710460800


def test_distinct_dates_one_day_apart():
    a = date_to_utc_epoch(date(2024, 3, 15))
    b = date_to_utc_epoch(date(2024, 3, 16))
    assert b - a == 86400


@pytest.mark.skipif(
    not hasattr(time, "tzset"),
    reason="time.tzset is POSIX-only; on Windows the timezone-sensitive bug "
    "is still demonstrable but requires a different harness",
)
def test_result_is_independent_of_host_TZ():
    """The buggy `time.mktime` implementation would fail this on non-UTC TZ."""
    EXPECTED = 1710460800  # 2024-03-15 00:00 UTC
    original_tz = os.environ.get("TZ")
    try:
        for tz in ("UTC", "America/New_York", "Asia/Tokyo", "Pacific/Auckland"):
            os.environ["TZ"] = tz
            time.tzset()
            assert date_to_utc_epoch(date(2024, 3, 15)) == EXPECTED, (
                f"date_to_utc_epoch is not TZ-stable: TZ={tz} gave a different "
                f"epoch. Did someone revert to time.mktime?"
            )
    finally:
        if original_tz is None:
            os.environ.pop("TZ", None)
        else:
            os.environ["TZ"] = original_tz
        time.tzset()


def test_helper_is_not_time_mktime():
    """Sentinel: explicit guard so a future regression to time.mktime breaks
    visibly even on a UTC CI host where the values would coincidentally agree."""
    import sidecar.jobs.time_utils as tu
    src = open(tu.__file__, encoding="utf-8").read()
    # Match call sites (with parens), not prose mentions in docstrings.
    assert "calendar.timegm(" in src, "date_to_utc_epoch must call calendar.timegm"
    assert "time.mktime(" not in src, "date_to_utc_epoch must not call time.mktime"
