import sqlite3
from pathlib import Path

import pandas as pd
import pytest

from sidecar.conformal.features import extract_features


def _seed_db(con: sqlite3.Connection) -> None:
    con.executescript("""
        CREATE TABLE backtest_scores (date TEXT, ticker TEXT, signal_kind TEXT,
          score REAL, detail_json TEXT, PRIMARY KEY (date, ticker, signal_kind));
        CREATE TABLE realized_returns (date TEXT, ticker TEXT, horizon_days INTEGER,
          return_pct REAL, spy_excess_pct REAL, status TEXT, computed_at INTEGER,
          PRIMARY KEY (date, ticker, horizon_days));
        CREATE TABLE candles_daily (ticker TEXT, date TEXT, open REAL, high REAL,
          low REAL, close REAL, volume INTEGER, source TEXT,
          PRIMARY KEY (ticker, date));
        CREATE TABLE stock_meta (ticker TEXT PRIMARY KEY, name TEXT, sector TEXT);
    """)
    # Composite score across 60 days for one ticker
    for i in range(60):
        date = f'2026-{3 + i // 30:02d}-{(i % 30) + 1:02d}'
        con.execute("INSERT INTO backtest_scores VALUES (?, 'AAA', 'composite', ?, NULL)",
                    (date, 0.5 + 0.01 * i))
        con.execute("INSERT INTO realized_returns VALUES (?, 'AAA', 21, ?, ?, 'computed', 1)",
                    (date, 0.02, 0.01))
        con.execute("INSERT INTO candles_daily VALUES ('AAA', ?, 100, 105, 95, ?, 1000, 'a')",
                    (date, 100 + i))
        con.execute("INSERT INTO candles_daily VALUES ('SPY', ?, 400, 402, 398, ?, 1e7, 'a')",
                    (date, 400 + 0.1 * i))
    con.execute("INSERT INTO stock_meta VALUES ('AAA', 'AAA Corp', 'Tech')")
    con.commit()


def test_extract_features_returns_expected_columns(tmp_path: Path) -> None:
    db = tmp_path / 't.db'
    con = sqlite3.connect(db)
    _seed_db(con)
    df = extract_features(con, end_date='2026-04-29', horizon=21, lookback_years=2)
    expected = {'date', 'ticker', 'composite_score', 'vol_30d',
                'market_vol_30d', 'score_delta_5d', 'sector', 'spy_excess_pct'}
    assert expected.issubset(set(df.columns))
    assert len(df) > 0


def test_extract_features_filters_by_lookback(tmp_path: Path) -> None:
    db = tmp_path / 't.db'
    con = sqlite3.connect(db)
    _seed_db(con)
    df = extract_features(con, end_date='2026-04-29', horizon=21, lookback_years=0)
    # lookback_years=0 → only one day at most (the end_date itself or empty)
    assert len(df) <= 1


def test_extract_features_excludes_uncomputed_realizations(tmp_path: Path) -> None:
    db = tmp_path / 't.db'
    con = sqlite3.connect(db)
    _seed_db(con)
    con.execute("UPDATE realized_returns SET status='pending' WHERE date='2026-04-10'")
    con.commit()
    df = extract_features(con, end_date='2026-04-29', horizon=21, lookback_years=2)
    assert '2026-04-10' not in df['date'].tolist()
