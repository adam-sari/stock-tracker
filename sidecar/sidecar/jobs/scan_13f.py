"""Weekly 13F-HR ingestion for curated funds via edgartools (import: `edgar`).

For each curated fund, fetch the most recent 13F-HR filing and upsert
into fund_holdings. The library's ThirteenF.infotable DataFrame already
has Ticker resolved per holding — no CUSIP→ticker lookup needed.

API verified against edgartools v5.31.x:
- Company(cik) → Company object
- co.get_filings(form="13F-HR") → list[Filing], filings[0] is most recent
- filing.obj() → ThirteenF with .infotable (DataFrame), .report_period
- infotable columns include: Issuer, Class, Cusip, Value, Shares, Type, Ticker, ...
"""
from __future__ import annotations
import logging
import math
import os
import time
from sqlalchemy import text
from sidecar.db import get_session

logger = logging.getLogger(__name__)


def _to_float(value) -> float | None:
    if value is None:
        return None
    try:
        v = float(value)
        if math.isnan(v):
            return None
        return v
    except (TypeError, ValueError):
        return None


def _process_filing(session, cik: str, name: str, filing, accession_override: str = "") -> tuple[int, int]:
    """Process one 13F filing, upsert holdings. Returns (holdings_count, errors)."""
    try:
        tf = filing.obj()
        df = tf.infotable
        if df is None or len(df) == 0:
            return 0, 0
    except Exception as e:
        logger.warning("13F infotable read failed for %s: %s", name, e)
        return 0, 1

    try:
        period_end = str(tf.report_period)[:10] if hasattr(tf, "report_period") and tf.report_period else str(filing.filing_date)[:10]
    except Exception:
        period_end = str(filing.filing_date)[:10]

    try:
        filed_at = int(time.mktime(filing.filing_date.timetuple()))
    except Exception:
        filed_at = int(time.time())
    accession = accession_override or filing.accession_no

    agg: dict[str, dict] = {}
    for _, row in df.iterrows():
        ticker = str(row.get("Ticker") or "").upper().strip()
        if not ticker:
            continue
        if str(row.get("Type") or "").strip().lower() not in ("shares", ""):
            continue
        shares = _to_float(row.get("SharesPrnAmount")) or 0.0
        value_usd = _to_float(row.get("Value")) or 0.0
        if ticker not in agg:
            agg[ticker] = {"shares": 0.0, "value_usd": 0.0}
        agg[ticker]["shares"] += shares
        agg[ticker]["value_usd"] += value_usd

    holdings = 0
    errors = 0
    for ticker, totals in agg.items():
        try:
            session.execute(
                text(
                    "INSERT INTO fund_holdings (filing_accession, cik, ticker, shares, value_usd, period_end, filed_at) "
                    "VALUES (:acc, :cik, :ticker, :shares, :value, :period, :filed) "
                    "ON CONFLICT(filing_accession, ticker) DO UPDATE SET "
                    "  shares=excluded.shares, value_usd=excluded.value_usd, period_end=excluded.period_end, filed_at=excluded.filed_at"
                ),
                {
                    "acc": accession, "cik": cik, "ticker": ticker,
                    "shares": totals["shares"], "value": totals["value_usd"],
                    "period": period_end, "filed": filed_at,
                },
            )
            holdings += 1
        except Exception as e:
            logger.warning("13F insert failed for %s/%s: %s", name, ticker, e)
            errors += 1
    return holdings, errors


def scan_13f() -> dict[str, int]:
    """Ingest the latest 13F-HR for each curated fund."""
    try:
        from edgar import set_identity, Company
    except ImportError as e:
        logger.error("edgartools (import 'edgar') not available: %s", e)
        return {"funds": 0, "holdings": 0, "errors": 1}
    contact = os.environ.get("EDGAR_CONTACT_EMAIL")
    if not contact:
        logger.error("EDGAR_CONTACT_EMAIL not set — required by SEC EDGAR fair-access policy")
        return {"funds": 0, "holdings": 0, "errors": 1}
    set_identity(f"Stock Tracker {contact}")

    job_started = int(time.time())
    with get_session() as session:
        job_id = session.execute(
            text("INSERT INTO job_runs (job, started_at, status) VALUES ('scan_13f', :ts, 'running') RETURNING id"),
            {"ts": job_started},
        ).first()[0]
        curated = session.execute(text("SELECT cik, name FROM funds WHERE is_curated=1")).all()
        session.commit()

    total_funds = total_holdings = errors = 0
    for cik, name in curated:
        try:
            co = Company(cik)
            filings = co.get_filings(form="13F-HR")
            if not filings or len(filings) == 0:
                continue
            filing = filings[0]
        except Exception as e:
            logger.warning("13F fetch failed for %s (%s): %s", name, cik, e)
            errors += 1
            continue
        with get_session() as session:
            h, e = _process_filing(session, cik, name, filing)
            session.commit()
            total_holdings += h
            errors += e
        total_funds += 1
        logger.info("13F: %s (%s) → %d holdings", name, cik, h)

    with get_session() as session:
        session.execute(
            text("UPDATE job_runs SET finished_at=:ts, status='ok', detail=:detail WHERE id=:id"),
            {"ts": int(time.time()), "detail": f"funds={total_funds} holdings={total_holdings} errors={errors}", "id": job_id},
        )
        session.commit()

    logger.info("scan_13f: funds=%d holdings=%d errors=%d", total_funds, total_holdings, errors)
    return {"funds": total_funds, "holdings": total_holdings, "errors": errors}
