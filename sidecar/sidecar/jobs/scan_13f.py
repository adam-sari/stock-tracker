"""Weekly 13F-HR ingestion for curated funds.

For each curated fund, fetch the most recent 13F-HR filing, resolve CUSIPs
to tickers via OpenFIGI, and upsert into fund_holdings with QoQ deltas.

NOTE on edgartools API: The plan assumes edgartools v5.31+ exposes
`Company(cik).get_filings(form="13F-HR")`, `filings.latest()`, `filing.obj()`,
`tf.holdings` (list of dicts with "cusip", "shares", "value" keys), and
`tf.period_of_report`. If the real API differs, the production code will need
adaptation. The smoke tests mock edgartools so they verify wiring/DB logic only.
"""
from __future__ import annotations
import logging
import time
from sqlalchemy import text
from sidecar.db import get_session
from sidecar.cusip import lookup_cusips

logger = logging.getLogger(__name__)


def scan_13f() -> dict[str, int]:
    """Ingest the latest 13F-HR for each curated fund."""
    try:
        from edgartools import set_identity, Company
    except ImportError as e:
        logger.error("edgartools not available: %s", e)
        return {"funds": 0, "holdings": 0, "errors": 1}

    set_identity("Stock Tracker Personal exara.ai@gmail.com")

    job_started = int(time.time())
    with get_session() as session:
        job_id = session.execute(
            text("INSERT INTO job_runs (job, started_at, status) VALUES ('scan_13f', :ts, 'running') RETURNING id"),
            {"ts": job_started},
        ).first()[0]
        curated = session.execute(text("SELECT cik, name FROM funds WHERE is_curated=1")).all()
        session.commit()

    total_funds = 0
    total_holdings = 0
    errors = 0

    for cik, name in curated:
        try:
            co = Company(cik)
            filings = co.get_filings(form="13F-HR")
            if not filings:
                continue
            filing = filings.latest()
            tf = filing.obj()  # ThirteenF object
            holdings = tf.holdings  # list of holdings rows
        except Exception as e:
            logger.warning("13F fetch failed for %s (%s): %s", name, cik, e)
            errors += 1
            continue

        # Collect CUSIPs and resolve in one batch
        cusips = [str(h.get("cusip", "")).strip().upper() for h in holdings if h.get("cusip")]
        cusip_to_ticker = lookup_cusips(cusips)

        period_end = str(getattr(tf, "period_of_report", filing.filing_date))[:10]
        filed_at = int(time.mktime(filing.filing_date.timetuple()))
        accession = filing.accession_no

        # Look up previous filing for delta computation
        prev_holdings: dict[str, float] = {}
        try:
            if len(filings) > 1:
                prev_filing = filings[1]
                prev_tf = prev_filing.obj()
                for h in prev_tf.holdings:
                    cusip_p = str(h.get("cusip", "")).strip().upper()
                    if cusip_p:
                        prev_holdings[cusip_p] = float(h.get("shares", 0) or 0)
        except Exception:
            pass

        with get_session() as session:
            for h in holdings:
                cusip = str(h.get("cusip", "")).strip().upper()
                ticker = cusip_to_ticker.get(cusip)
                if not ticker:
                    continue
                shares = float(h.get("shares", 0) or 0)
                value_usd = float(h.get("value", 0) or 0)  # value reported in thousands per SEC
                prev_shares = prev_holdings.get(cusip, 0)
                delta_shares = shares - prev_shares
                delta_pct = (delta_shares / prev_shares * 100) if prev_shares else None

                session.execute(
                    text(
                        "INSERT INTO fund_holdings (filing_accession, cik, ticker, shares, value_usd, period_end, filed_at, delta_shares, delta_pct) "
                        "VALUES (:acc, :cik, :ticker, :shares, :value, :period, :filed, :ds, :dp) "
                        "ON CONFLICT(filing_accession, ticker) DO UPDATE SET shares=excluded.shares, value_usd=excluded.value_usd, delta_shares=excluded.delta_shares, delta_pct=excluded.delta_pct"
                    ),
                    {
                        "acc": accession, "cik": cik, "ticker": ticker,
                        "shares": shares, "value": value_usd, "period": period_end, "filed": filed_at,
                        "ds": delta_shares, "dp": delta_pct,
                    },
                )
                total_holdings += 1
            session.commit()
        total_funds += 1

    with get_session() as session:
        session.execute(
            text("UPDATE job_runs SET finished_at=:ts, status='ok', detail=:detail WHERE id=:id"),
            {"ts": int(time.time()), "detail": f"funds={total_funds} holdings={total_holdings} errors={errors}", "id": job_id},
        )
        session.commit()

    return {"funds": total_funds, "holdings": total_holdings, "errors": errors}
