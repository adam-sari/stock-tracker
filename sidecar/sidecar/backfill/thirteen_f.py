"""13F backfill: for each curated fund, ingest the N most-recent 13F-HR filings."""
from __future__ import annotations
import logging
import os

from sqlalchemy import text

from sidecar.db import get_session
from sidecar.jobs.scan_13f import _process_filing

logger = logging.getLogger(__name__)


def _recompute_deltas() -> int:
    """For each (cik, ticker) pair, compute delta_shares as shares - prior_period_shares.

    For the first observed period for each (cik, ticker), delta_shares stays NULL
    (we don't know if the position was new vs continued — being conservative makes
    score13FAccumulation skip such rows rather than falsely flagging them).

    Returns the number of rows updated.
    """
    with get_session() as s:
        rows = s.execute(text(
            "SELECT filing_accession, cik, ticker, period_end, shares FROM fund_holdings "
            "ORDER BY cik, ticker, period_end"
        )).all()

        prev_key: tuple[str, str] | None = None
        prev_shares = 0.0
        updates: list[dict] = []
        for acc, cik, ticker, period_end, shares in rows:
            key = (cik, ticker)
            if key != prev_key:
                # First observation for this (cik, ticker) — leave delta NULL
                delta = None
            else:
                delta = shares - prev_shares
            prev_key = key
            prev_shares = shares
            updates.append({"acc": acc, "ticker": ticker, "delta": delta})

        for u in updates:
            s.execute(text(
                "UPDATE fund_holdings SET delta_shares = :delta "
                "WHERE filing_accession = :acc AND ticker = :ticker"
            ), u)
        s.commit()

    logger.info("recomputed delta_shares for %d fund_holdings rows", len(updates))
    return len(updates)


def backfill_13f(quarters_back: int = 20) -> dict:
    """For each curated fund, fetch the last `quarters_back` 13F-HR filings and upsert holdings.

    After ingestion, recomputes delta_shares across all fund_holdings so the
    discovery scoring's `funds` signal has the data it needs.
    """
    try:
        from edgar import set_identity, Company
    except ImportError as e:
        logger.error("edgartools not available: %s", e)
        return {"funds": 0, "filings": 0, "holdings": 0, "errors": 1, "delta_updates": 0}

    contact = os.environ.get("EDGAR_CONTACT_EMAIL")
    if not contact:
        logger.error("EDGAR_CONTACT_EMAIL not set")
        return {"funds": 0, "filings": 0, "holdings": 0, "errors": 1, "delta_updates": 0}
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

    delta_updates = _recompute_deltas()

    logger.info(
        "backfill_13f complete: funds=%d filings=%d holdings=%d errors=%d delta_updates=%d",
        total_funds, total_filings, total_holdings, errors, delta_updates,
    )
    return {
        "funds": total_funds, "filings": total_filings, "holdings": total_holdings,
        "errors": errors, "delta_updates": delta_updates,
    }
