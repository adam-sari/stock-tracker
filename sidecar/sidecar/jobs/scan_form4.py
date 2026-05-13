"""Daily Form 4 ingestion via edgartools.

Pulls all Form 4 filings from the past N days and upserts them as
insider transactions. Plan 2 scans the entire universe — we filter to
held tickers at read time.

NOTE on edgartools API: The plan assumes edgartools v5.31+ exposes
`set_identity`, `get_filings`, `filing.obj()`, `form4.non_derivative_transactions`,
and `form4.derivative_transactions`. If the real API differs (e.g. attribute
names like `transactions` vs `non_derivative_transactions`), the production
code will need adaptation. The smoke tests mock edgartools so they verify
wiring/DB logic only, not the real API surface.
"""
from __future__ import annotations
import hashlib
import logging
import time
from datetime import date, timedelta
from sqlalchemy import text
from sidecar.db import get_session

logger = logging.getLogger(__name__)


def _row_id(accession: str, line_no: int) -> str:
    return hashlib.sha256(f"{accession}|{line_no}".encode()).hexdigest()


def scan_form4(days_back: int = 1) -> dict[str, int]:
    """Scan EDGAR Form 4 filings from `days_back` ago to today.

    Returns {inserted, skipped, errors}.
    """
    try:
        from edgartools import set_identity, get_filings
    except ImportError as e:
        logger.error("edgartools not installed: %s", e)
        return {"inserted": 0, "skipped": 0, "errors": 1}

    set_identity("Stock Tracker Personal exara.ai@gmail.com")

    end = date.today()
    start = end - timedelta(days=days_back)
    start_str = start.isoformat()
    end_str = end.isoformat()

    try:
        filings = get_filings(form="4", filing_date=f"{start_str}:{end_str}")
    except Exception as e:
        logger.exception("Failed to fetch Form 4 filings: %s", e)
        return {"inserted": 0, "skipped": 0, "errors": 1}

    inserted = 0
    skipped = 0
    errors = 0
    job_started = int(time.time())

    with get_session() as session:
        job_id = session.execute(
            text("INSERT INTO job_runs (job, started_at, status) VALUES ('scan_form4', :ts, 'running') RETURNING id"),
            {"ts": job_started},
        ).first()[0]
        session.commit()

    with get_session() as session:
        for filing in filings:
            try:
                form4 = filing.obj()
            except Exception:
                errors += 1
                continue

            ticker = (filing.ticker or "").upper()
            if not ticker:
                skipped += 1
                continue

            insider_name = getattr(form4, "reporter", None) or getattr(form4, "owner", "") or ""
            accession = filing.accession_no
            filed_at = int(time.mktime(filing.filing_date.timetuple()))
            filing_url = filing.url

            # Non-derivative table = open-market transactions
            try:
                nondrv = form4.non_derivative_transactions  # list of dicts
            except Exception:
                nondrv = []

            for i, row in enumerate(nondrv or []):
                code = str(row.get("transactionCode", "")).strip()
                if not code:
                    continue
                shares = float(row.get("transactionShares", 0) or 0)
                price = row.get("transactionPricePerShare")
                price = float(price) if price is not None else None
                value = (shares * price) if price else None
                txn_date = str(row.get("transactionDate", ""))[:10]

                rid = _row_id(accession, i)
                try:
                    session.execute(
                        text(
                            "INSERT INTO insider_txns (id, ticker, insider_name, code, is_derivative, shares, price, value, txn_date, filed_at, filing_url, source) "
                            "VALUES (:id, :ticker, :name, :code, 0, :shares, :price, :value, :txn_date, :filed_at, :url, 'edgar') "
                            "ON CONFLICT(id) DO NOTHING"
                        ),
                        {
                            "id": rid, "ticker": ticker, "name": str(insider_name),
                            "code": code, "shares": shares, "price": price, "value": value,
                            "txn_date": txn_date, "filed_at": filed_at, "url": filing_url,
                        },
                    )
                    inserted += 1
                except Exception as e:
                    logger.warning("Insert failed for %s line %d: %s", accession, i, e)
                    errors += 1

            # Derivative transactions (option grants, exercises) tracked separately
            try:
                drv = form4.derivative_transactions
            except Exception:
                drv = []

            for i, row in enumerate(drv or []):
                code = str(row.get("transactionCode", "")).strip()
                if not code:
                    continue
                shares = float(row.get("transactionShares", 0) or 0)
                txn_date = str(row.get("transactionDate", ""))[:10]
                rid = _row_id(accession, 1000 + i)  # offset to avoid collisions
                try:
                    session.execute(
                        text(
                            "INSERT INTO insider_txns (id, ticker, insider_name, code, is_derivative, shares, price, value, txn_date, filed_at, filing_url, source) "
                            "VALUES (:id, :ticker, :name, :code, 1, :shares, NULL, NULL, :txn_date, :filed_at, :url, 'edgar') "
                            "ON CONFLICT(id) DO NOTHING"
                        ),
                        {
                            "id": rid, "ticker": ticker, "name": str(insider_name),
                            "code": code, "shares": shares, "txn_date": txn_date,
                            "filed_at": filed_at, "url": filing_url,
                        },
                    )
                    inserted += 1
                except Exception:
                    errors += 1

        session.commit()

    with get_session() as session:
        session.execute(
            text("UPDATE job_runs SET finished_at=:ts, status='ok', detail=:detail WHERE id=:id"),
            {"ts": int(time.time()), "detail": f"inserted={inserted} skipped={skipped} errors={errors}", "id": job_id},
        )
        session.commit()

    logger.info("scan_form4: inserted=%d skipped=%d errors=%d", inserted, skipped, errors)
    return {"inserted": inserted, "skipped": skipped, "errors": errors}
