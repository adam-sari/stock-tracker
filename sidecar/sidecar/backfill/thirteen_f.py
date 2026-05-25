"""13F backfill: for each curated fund, ingest the N most-recent 13F-HR filings."""
from __future__ import annotations
import logging
import os

from sqlalchemy import text

from sidecar.db import get_session
from sidecar.jobs.scan_13f import _process_filing

logger = logging.getLogger(__name__)


def backfill_13f(quarters_back: int = 20) -> dict:
    """For each curated fund, fetch the last `quarters_back` 13F-HR filings and upsert holdings."""
    try:
        from edgar import set_identity, Company
    except ImportError as e:
        logger.error("edgartools not available: %s", e)
        return {"funds": 0, "filings": 0, "holdings": 0, "errors": 1}

    contact = os.environ.get("EDGAR_CONTACT_EMAIL")
    if not contact:
        logger.error("EDGAR_CONTACT_EMAIL not set")
        return {"funds": 0, "filings": 0, "holdings": 0, "errors": 1}
    set_identity(f"Stock Tracker {contact}")

    with get_session() as session:
        curated = session.execute(text("SELECT cik, name FROM funds WHERE is_curated=1")).all()

    total_funds = total_filings = total_holdings = errors = 0
    for cik, name in curated:
        try:
            co = Company(cik)
            filings = co.get_filings(form="13F-HR")
            if not filings:
                continue
        except Exception as e:
            logger.warning("13F fetch failed for %s (%s): %s", name, cik, e)
            errors += 1
            continue

        n = min(quarters_back, len(filings))
        with get_session() as session:
            for i in range(n):
                try:
                    h, e = _process_filing(session, cik, name, filings[i])
                    total_holdings += h
                    errors += e
                    total_filings += 1
                except Exception as ex:
                    logger.warning("13F filing %d failed for %s: %s", i, name, ex)
                    errors += 1
            session.commit()
        total_funds += 1
        logger.info("13F backfill: %s (%s) → %d filings processed", name, cik, n)

    logger.info(
        "backfill_13f complete: funds=%d filings=%d holdings=%d errors=%d",
        total_funds, total_filings, total_holdings, errors,
    )
    return {"funds": total_funds, "filings": total_filings, "holdings": total_holdings, "errors": errors}
