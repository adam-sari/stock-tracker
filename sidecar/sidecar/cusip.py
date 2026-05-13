"""CUSIP → ticker mapping via OpenFIGI public API.

Caches resolutions in the cusip_ticker_map table forever — CUSIPs are stable.
Failures are also cached (with ticker=NULL) to avoid re-trying constantly.
"""
from __future__ import annotations
import os
import time
import logging
from typing import Iterable
import httpx
from sqlalchemy import text
from sidecar.db import get_session

logger = logging.getLogger(__name__)

OPENFIGI_URL = "https://api.openfigi.com/v3/mapping"


def _api_key_headers() -> dict[str, str]:
    key = os.environ.get("OPENFIGI_API_KEY", "")
    return {"X-OPENFIGI-APIKEY": key} if key else {}


def lookup_cusips(cusips: Iterable[str]) -> dict[str, str | None]:
    """Resolve a batch of CUSIPs. Returns {cusip: ticker_or_None}.

    Hits the cache first, then OpenFIGI for the misses, then writes results
    back into the cache table.
    """
    cusips = [c.strip().upper() for c in cusips if c and c.strip()]
    if not cusips:
        return {}

    out: dict[str, str | None] = {}
    misses: list[str] = []
    with get_session() as session:
        # Build parameterised IN clause: WHERE cusip IN (:c0, :c1, ...)
        placeholders = ", ".join(f":c{i}" for i in range(len(cusips)))
        params = {f"c{i}": c for i, c in enumerate(cusips)}
        rows = session.execute(
            text(f"SELECT cusip, ticker FROM cusip_ticker_map WHERE cusip IN ({placeholders})"),
            params,
        ).all()
        for cusip, ticker in rows:
            out[cusip] = ticker
        for c in cusips:
            if c not in out:
                misses.append(c)

    if not misses:
        return out

    # OpenFIGI accepts up to 10 IDs per request unauth, 100 with key
    chunk_size = 100 if os.environ.get("OPENFIGI_API_KEY") else 10
    for i in range(0, len(misses), chunk_size):
        chunk = misses[i:i + chunk_size]
        body = [{"idType": "ID_CUSIP", "idValue": c} for c in chunk]
        try:
            r = httpx.post(OPENFIGI_URL, json=body, headers=_api_key_headers(), timeout=15)
            r.raise_for_status()
            results = r.json()
        except Exception as e:
            logger.warning("OpenFIGI request failed for %d CUSIPs: %s", len(chunk), e)
            time.sleep(2)
            continue

        now = int(time.time())
        with get_session() as session:
            for cusip, result in zip(chunk, results):
                ticker = None
                if "data" in result and result["data"]:
                    # Prefer Common Stock equities
                    for entry in result["data"]:
                        if entry.get("securityType") in ("Common Stock", "ADR", "REIT"):
                            ticker = entry.get("ticker")
                            break
                    if ticker is None:
                        ticker = result["data"][0].get("ticker")
                session.execute(
                    text(
                        "INSERT INTO cusip_ticker_map (cusip, ticker, name, resolved_at, source) "
                        "VALUES (:cusip, :ticker, :name, :resolved_at, 'openfigi') "
                        "ON CONFLICT(cusip) DO UPDATE SET ticker=excluded.ticker, resolved_at=excluded.resolved_at"
                    ),
                    {"cusip": cusip, "ticker": ticker, "name": None, "resolved_at": now},
                )
                out[cusip] = ticker
            session.commit()

        if not os.environ.get("OPENFIGI_API_KEY"):
            time.sleep(2.5)  # respect 25 req/min unauth limit

    return out
