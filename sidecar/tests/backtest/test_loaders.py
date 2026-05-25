"""Tests for sidecar.backtest.loaders — SQLite → pandas DataFrames."""
from __future__ import annotations
import pandas as pd
from sqlalchemy import text

from sidecar.db import get_session
from sidecar.backtest.loaders import (
    load_backtest_scores,
    load_candles,
    load_sp500_universe,
)


def test_load_backtest_scores_returns_long_dataframe(fresh_db):
    rows = [
        {"d": "2024-01-15", "t": "AAPL", "k": "volume",  "sc": 0.5, "dj": '{"latestVolume":3000000}'},
        {"d": "2024-01-15", "t": "NVDA", "k": "volume",  "sc": 0.8, "dj": '{"latestVolume":5000000}'},
        {"d": "2024-01-15", "t": "AAPL", "k": "insider", "sc": 0.4, "dj": '{"distinctBuyers":2}'},
    ]
    with get_session() as s:
        for r in rows:
            s.execute(text(
                "INSERT INTO backtest_scores (date, ticker, signal_kind, score, detail_json) "
                "VALUES (:d, :t, :k, :sc, :dj)"
            ), r)
        s.commit()
    df = load_backtest_scores(from_date='2024-01-15', to_date='2024-01-15')
    assert len(df) == 3
    assert set(df.columns) >= {'date', 'ticker', 'signal_kind', 'score'}
    assert df['date'].dtype.kind == 'M'
    aapl_vol = df[(df['ticker'] == 'AAPL') & (df['signal_kind'] == 'volume')].iloc[0]
    assert aapl_vol['detail']['latestVolume'] == 3000000


def test_load_candles_returns_wide_close_pivot(fresh_db):
    with get_session() as s:
        s.execute(text(
            """INSERT INTO candles_daily (ticker, date, open, high, low, close, volume, source)
               VALUES ('AAPL', '2024-01-15', 99, 101, 98, 100, 1000000, 'test'),
                      ('AAPL', '2024-01-16', 100, 102, 99, 101, 1100000, 'test'),
                      ('NVDA', '2024-01-15', 500, 510, 495, 505, 2000000, 'test')"""
        ))
        s.commit()
    closes = load_candles(from_date='2024-01-15', to_date='2024-01-16')
    assert isinstance(closes, pd.DataFrame)
    assert closes.index.name == 'date'
    assert set(closes.columns) == {'AAPL', 'NVDA'}
    assert closes.loc[pd.Timestamp('2024-01-15'), 'AAPL'] == 100
    assert closes.loc[pd.Timestamp('2024-01-16'), 'AAPL'] == 101
    assert pd.isna(closes.loc[pd.Timestamp('2024-01-16'), 'NVDA'])


def test_load_sp500_universe_returns_all_tickers_when_empty(fresh_db):
    """Until Plan 2 backfills sp500_membership, the loader returns all tickers in candles_daily."""
    with get_session() as s:
        s.execute(text(
            """INSERT INTO candles_daily (ticker, date, open, high, low, close, volume, source)
               VALUES ('AAPL', '2024-01-15', 100, 100, 100, 100, 0, 'test'),
                      ('MSFT', '2024-01-15', 100, 100, 100, 100, 0, 'test')"""
        ))
        s.commit()
    tickers = load_sp500_universe(as_of='2024-01-15')
    assert set(tickers) == {'AAPL', 'MSFT'}


def test_load_sp500_universe_filters_by_membership_when_populated(fresh_db):
    with get_session() as s:
        s.execute(text(
            """INSERT INTO sp500_membership (ticker, from_date, to_date) VALUES
               ('AAPL', '2020-01-01', NULL),
               ('OLD',  '2020-01-01', '2023-06-30'),
               ('NEW',  '2024-02-01', NULL)"""
        ))
        s.commit()
    tickers = load_sp500_universe(as_of='2024-01-15')
    assert set(tickers) == {'AAPL'}
    tickers = load_sp500_universe(as_of='2024-02-15')
    assert set(tickers) == {'AAPL', 'NEW'}
