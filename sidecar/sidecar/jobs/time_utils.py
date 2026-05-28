"""Timezone-stable epoch conversion for filed_at fields.

`time.mktime` interprets `struct_time` as host-local; using it for SEC
filing dates makes `filed_at` differ by host UTC offset and shifts filings
across day boundaries. Use `calendar.timegm` to anchor at UTC.
"""
from __future__ import annotations
import calendar
from datetime import date


def date_to_utc_epoch(d: date) -> int:
    """Convert a date (or datetime) to a UTC epoch second.

    For a plain `date`, this returns the epoch for midnight UTC on that date,
    regardless of the host's local timezone.
    """
    return int(calendar.timegm(d.timetuple()))
