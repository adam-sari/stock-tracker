"""Daily Form 4 ingestion via edgartools (import name: `edgar`).

Pulls all Form 4 filings from the past N days and upserts them as
insider transactions. Plan 2 scans the entire universe — we filter to
held tickers at read time.

API verified against edgartools v5.31.x:
- get_filings(form="4", filing_date="YYYY-MM-DD:YYYY-MM-DD") → list[Filing]
- filing.obj() → Form4 with .issuer (Issuer w/ ticker), .insider_name, .to_dataframe()
- to_dataframe() columns: Transaction Type, Code, Description, Shares, Price, Value, Date, Form, Issuer, Ticker, Insider, Position, Remaining Shares
"""
from __future__ import annotations
import hashlib
import logging
import math
import time
from datetime import date, timedelta
from sqlalchemy import text
from sidecar.db import get_session

logger = logging.getLogger(__name__)


def _row_id(accession: str, line_no: int) -> str:
    return hashlib.sha256(f"{accession}|{line_no}".encode()).hexdigest()


def _to_float(value) -> float | None:
    """Convert a possibly-NaN pandas value to float or None."""
    if value is None:
        return None
    try:
        v = float(value)
        if math.isnan(v):
            return None
        return v
    except (TypeError, ValueError):
        return None


def scan_form4(days_back: int = 1) -> dict[str, int]:
    """Scan EDGAR Form 4 filings from `days_back` ago to today.

    Returns {inserted, skipped, errors}.
    """
    try:
        # PyPI package is `edgartools`, import name is `edgar`
        from edgar import set_identity, get_filings
    except ImportError as e:
        logger.error("edgartools (import 'edgar') not installed: %s", e)
        return {"inserted": 0, "skipped": 0, "errors": 1}

    set_identity("Stock Tracker Personal exara.ai@gmail.com")

    end = date.today()
    start = end - timedelta(days=days_back)

    try:
        filings = get_filings(form="4", filing_date=f"{start.isoformat()}:{end.isoformat()}")
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

    n_filings = len(filings)
    logger.info("scan_form4: processing %d Form 4 filings from %s to %s", n_filings, start, end)

    with get_session() as session:
        for filing_idx, filing in enumerate(filings):
            if filing_idx % 200 == 0 and filing_idx > 0:
                logger.info("  ...processed %d/%d filings", filing_idx, n_filings)
                session.commit()  # batch-commit every 200 filings

            try:
                form4 = filing.obj()
            except Exception:
                errors += 1
                continue

            # Default ticker from issuer; per-row Ticker overrides if present
            default_ticker = ""
            try:
                if form4.issuer and form4.issuer.ticker:
                    default_ticker = str(form4.issuer.ticker).upper()
            except Exception:
                pass

            insider_name = str(getattr(form4, "insider_name", "") or "")
            accession = filing.accession_no

            try:
                filed_at = int(time.mktime(filing.filing_date.timetuple()))
            except Exception:
                filed_at = int(time.time())
            filing_url = getattr(filing, "filing_url", None) or getattr(filing, "url", "")

            try:
                df = form4.to_dataframe()
            except Exception:
                errors += 1
                continue
            if df is None or len(df) == 0:
                skipped += 1
                continue

            for i, row in df.iterrows():
                try:
                    ticker = str(row.get("Ticker") or default_ticker or "").upper().strip()
                    if not ticker:
                        continue
                    code = str(row.get("Code", "") or "").strip()
                    if not code:
                        continue
                    shares = _to_float(row.get("Shares")) or 0.0
                    price = _to_float(row.get("Price"))
                    value = _to_float(row.get("Value"))
                    if value is None and price is not None:
                        value = shares * price

                    txn_date_raw = row.get("Date")
                    if hasattr(txn_date_raw, "strftime"):
                        txn_date = txn_date_raw.strftime("%Y-%m-%d")
                    else:
                        txn_date = str(txn_date_raw)[:10] if txn_date_raw else ""
                    if not txn_date:
                        continue

                    role = str(row.get("Position", "") or "")[:100] or None

                    rid = _row_id(accession, i)
                    session.execute(
                        text(
                            "INSERT INTO insider_txns (id, ticker, insider_name, insider_role, code, is_derivative, shares, price, value, txn_date, filed_at, filing_url, source) "
                            "VALUES (:id, :ticker, :name, :role, :code, 0, :shares, :price, :value, :txn_date, :filed_at, :url, 'edgar') "
                            "ON CONFLICT(id) DO NOTHING"
                        ),
                        {
                            "id": rid, "ticker": ticker, "name": insider_name, "role": role,
                            "code": code, "shares": shares, "price": price, "value": value,
                            "txn_date": txn_date, "filed_at": filed_at, "url": filing_url,
                        },
                    )
                    inserted += 1
                except Exception as e:
                    logger.warning("Insert failed for %s row %s: %s", accession, i, e)
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
