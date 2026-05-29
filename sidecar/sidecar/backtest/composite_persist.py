"""Persist composite score as signal_kind='composite' rows in backtest_scores."""
from __future__ import annotations
import sqlite3
import pandas as pd

from sidecar.backtest.composite import composite_factor


def persist_composite_scores(con: sqlite3.Connection) -> int:
    """Compute composite per (date, ticker) from per-signal rows and persist.

    Returns the number of composite rows written.
    Idempotent: INSERT OR REPLACE on the primary key.
    """
    rows = con.execute(
        "SELECT date, ticker, signal_kind, score FROM backtest_scores "
        "WHERE signal_kind != 'composite'"
    ).fetchall()
    if not rows:
        return 0

    df = pd.DataFrame(rows, columns=['date', 'ticker', 'signal_kind', 'score'])
    signals: dict[str, pd.Series] = {}
    for kind, group in df.groupby('signal_kind'):
        s = group.set_index(['date', 'ticker'])['score']
        signals[kind] = s

    comp = composite_factor(signals, partial_info_rescale=True)
    comp = comp.dropna().reset_index()
    comp.columns = ['date', 'ticker', 'score']

    payload = [
        (row.date, row.ticker, 'composite', float(row.score), None)
        for row in comp.itertuples()
    ]
    con.executemany(
        "INSERT OR REPLACE INTO backtest_scores "
        "(date, ticker, signal_kind, score, detail_json) VALUES (?, ?, ?, ?, ?)",
        payload,
    )
    con.commit()
    return len(payload)
