"""SQLite → pandas loaders for the backtest pipeline."""
from __future__ import annotations
import json
from typing import List, Optional

import pandas as pd
from sqlalchemy import text

from sidecar.db import get_session


def load_backtest_scores(
    from_date: str,
    to_date: str,
    signal_kinds: Optional[List[str]] = None,
) -> pd.DataFrame:
    """Long-format DataFrame of per-(date, ticker, signal) backtest scores.

    Columns: date (datetime64), ticker (str), signal_kind (str), score (float),
    detail (dict | None).
    """
    sql = ("SELECT date, ticker, signal_kind, score, detail_json "
           "FROM backtest_scores WHERE date >= :f AND date <= :t")
    params = {"f": from_date, "t": to_date}
    if signal_kinds:
        placeholders = ",".join(f":s{i}" for i in range(len(signal_kinds)))
        sql += f" AND signal_kind IN ({placeholders})"
        for i, k in enumerate(signal_kinds):
            params[f"s{i}"] = k

    with get_session() as s:
        rows = s.execute(text(sql), params).all()

    df = pd.DataFrame(rows, columns=["date", "ticker", "signal_kind", "score", "detail_json"])
    df["date"] = pd.to_datetime(df["date"])
    df["detail"] = df["detail_json"].apply(lambda x: json.loads(x) if x else None)
    return df.drop(columns=["detail_json"])


def load_candles(from_date: str, to_date: str) -> pd.DataFrame:
    """Wide DataFrame: rows = trading dates, columns = tickers, values = close."""
    with get_session() as s:
        rows = s.execute(text(
            "SELECT date, ticker, close FROM candles_daily "
            "WHERE date >= :f AND date <= :t"
        ), {"f": from_date, "t": to_date}).all()
    if not rows:
        return pd.DataFrame()
    long_df = pd.DataFrame(rows, columns=["date", "ticker", "close"])
    long_df["date"] = pd.to_datetime(long_df["date"])
    return long_df.pivot(index="date", columns="ticker", values="close")


def load_sp500_universe(as_of: str) -> List[str]:
    """Tickers in the S&P 500 as of `as_of` (YYYY-MM-DD).

    Falls back to "all tickers seen in candles_daily on or before as_of" when
    sp500_membership is empty (i.e., before Plan 2's backfill has run).
    """
    with get_session() as s:
        member_rows = s.execute(text(
            "SELECT ticker FROM sp500_membership "
            "WHERE from_date <= :d AND (to_date IS NULL OR to_date > :d)"
        ), {"d": as_of}).all()
        if member_rows:
            return sorted({r[0] for r in member_rows})
        fallback = s.execute(text(
            "SELECT DISTINCT ticker FROM candles_daily WHERE date <= :d"
        ), {"d": as_of}).all()
        return sorted({r[0] for r in fallback})
