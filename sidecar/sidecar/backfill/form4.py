"""Form 4 backfill: loop _scan_form4_range over chunked date ranges."""
from __future__ import annotations
import logging
import os
from datetime import date, timedelta

from sidecar.jobs.scan_form4 import _scan_form4_range

logger = logging.getLogger(__name__)


def backfill_form4(
    start_date: date,
    end_date: date,
    chunk_days: int = 7,
) -> dict:
    """Backfill Form 4 filings in chunks of `chunk_days` from start to end.

    EDGAR returns 100k+ Form 4 filings/year — chunking keeps each pull manageable
    and lets us recover from transient failures without losing all progress.
    """
    try:
        from edgar import set_identity
    except ImportError as e:
        logger.error("edgartools not installed: %s", e)
        return {"inserted": 0, "skipped": 0, "errors": 1, "chunks": 0}

    contact = os.environ.get("EDGAR_CONTACT_EMAIL")
    if not contact:
        logger.error("EDGAR_CONTACT_EMAIL not set — required by SEC EDGAR")
        return {"inserted": 0, "skipped": 0, "errors": 1, "chunks": 0}
    set_identity(f"Stock Tracker {contact}")

    totals = {"inserted": 0, "skipped": 0, "errors": 0, "chunks": 0}
    cur = start_date
    while cur <= end_date:
        chunk_end = min(cur + timedelta(days=chunk_days - 1), end_date)
        logger.info("Backfilling Form 4 chunk %s..%s", cur, chunk_end)
        result = _scan_form4_range(cur, chunk_end)
        totals["inserted"] += result["inserted"]
        totals["skipped"] += result["skipped"]
        totals["errors"] += result["errors"]
        totals["chunks"] += 1
        cur = chunk_end + timedelta(days=1)

    logger.info(
        "backfill_form4 complete: chunks=%d inserted=%d skipped=%d errors=%d",
        totals["chunks"], totals["inserted"], totals["skipped"], totals["errors"],
    )
    return totals
