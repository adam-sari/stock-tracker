"""Form 4 backfill: loop _scan_form4_range over chunked date ranges."""
from __future__ import annotations
import logging
import os
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import text

from sidecar.db import get_session
from sidecar.jobs.scan_form4 import _scan_form4_range

logger = logging.getLogger(__name__)


def _max_filed_at_date() -> date | None:
    """Return the date corresponding to MAX(filed_at) in insider_txns, or None if empty."""
    with get_session() as s:
        row = s.execute(text("SELECT MAX(filed_at) AS m FROM insider_txns")).first()
    if not row or row[0] is None:
        return None
    return datetime.fromtimestamp(int(row[0]), tz=timezone.utc).date()


def backfill_form4(
    start_date: date,
    end_date: date,
    chunk_days: int = 7,
    resume: bool = True,
) -> dict:
    """Backfill Form 4 filings in chunks of `chunk_days` from start to end.

    EDGAR returns 100k+ Form 4 filings/year — chunking keeps each pull manageable
    and lets us recover from transient failures without losing all progress.

    If `resume` (default True) and insider_txns already contains data, advances
    start_date to MAX(filed_at)+1 so re-running the same command picks up where
    a previous interrupted run left off.
    """
    try:
        from edgar import set_identity
    except ImportError as e:
        logger.error("edgartools not installed: %s", e)
        return {"inserted": 0, "skipped": 0, "errors": 1, "chunks": 0, "resumed_from": None}

    contact = os.environ.get("EDGAR_CONTACT_EMAIL")
    if not contact:
        logger.error("EDGAR_CONTACT_EMAIL not set — required by SEC EDGAR")
        return {"inserted": 0, "skipped": 0, "errors": 1, "chunks": 0, "resumed_from": None}
    set_identity(f"Stock Tracker {contact}")

    resumed_from: date | None = None
    if resume:
        last = _max_filed_at_date()
        if last is not None:
            candidate = last + timedelta(days=1)
            if candidate > start_date:
                logger.info(
                    "Auto-resuming from %s (skipping %d days already ingested up to %s)",
                    candidate, (candidate - start_date).days, last,
                )
                start_date = candidate
                resumed_from = last

    if start_date > end_date:
        logger.info("Nothing to backfill: start_date %s > end_date %s after resume", start_date, end_date)
        return {"inserted": 0, "skipped": 0, "errors": 0, "chunks": 0, "resumed_from": str(resumed_from) if resumed_from else None}

    totals = {"inserted": 0, "skipped": 0, "errors": 0, "chunks": 0,
              "resumed_from": str(resumed_from) if resumed_from else None}
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
