"""CQR feature extraction from backtest_scores + realized_returns + candles."""
from __future__ import annotations
import sqlite3
from datetime import date as _date, timedelta

import numpy as np
import pandas as pd


def _trading_lookback_start(end_date: str, years: float) -> str:
    end = _date.fromisoformat(end_date)
    return (end - timedelta(days=int(years * 365.25))).isoformat()


def extract_features(
    con: sqlite3.Connection,
    end_date: str,
    horizon: int,
    lookback_years: float = 2.0,
) -> pd.DataFrame:
    """Build a (composite_score, vol features, sector, target) DataFrame.

    Joins:
      - backtest_scores (signal_kind='composite') → composite_score
      - realized_returns (horizon_days=h, status='computed') → spy_excess_pct
      - candles_daily for trailing 30-day vol per ticker and SPY
      - stock_meta for sector
    """
    start = _trading_lookback_start(end_date, lookback_years)

    composite = pd.read_sql_query(
        "SELECT date, ticker, score AS composite_score FROM backtest_scores "
        "WHERE signal_kind = 'composite' AND date BETWEEN ? AND ?",
        con, params=(start, end_date),
    )
    if composite.empty:
        return pd.DataFrame(columns=[
            'date', 'ticker', 'composite_score', 'vol_30d', 'market_vol_30d',
            'score_delta_5d', 'sector', 'spy_excess_pct',
        ])

    realized = pd.read_sql_query(
        "SELECT date, ticker, spy_excess_pct FROM realized_returns "
        "WHERE horizon_days = ? AND status = 'computed' AND date BETWEEN ? AND ?",
        con, params=(horizon, start, end_date),
    )

    meta = pd.read_sql_query(
        "SELECT ticker, sector FROM stock_meta",
        con,
    )

    candles = pd.read_sql_query(
        "SELECT ticker, date, close FROM candles_daily "
        "WHERE date BETWEEN ? AND ?",
        con, params=(start, end_date),
    )
    candles = candles.sort_values(['ticker', 'date'])
    candles['logret'] = (
        candles.groupby('ticker')['close']
        .transform(lambda s: np.log(s / s.shift(1)))
    )
    candles['vol_30d'] = (
        candles.groupby('ticker')['logret']
        .transform(lambda s: s.rolling(30, min_periods=10).std())
    )
    vols = candles[['ticker', 'date', 'vol_30d']]
    spy_vol = vols[vols['ticker'] == 'SPY'].rename(
        columns={'vol_30d': 'market_vol_30d'}
    )[['date', 'market_vol_30d']]

    df = composite.merge(realized, on=['date', 'ticker'], how='inner')
    df = df.merge(vols, on=['date', 'ticker'], how='left')
    df = df.merge(spy_vol, on='date', how='left')
    df = df.merge(meta, on='ticker', how='left')

    df = df.sort_values(['ticker', 'date'])
    df['score_delta_5d'] = (
        df.groupby('ticker')['composite_score'].transform(lambda s: s.diff(5))
    )

    df = df.dropna(subset=['composite_score', 'spy_excess_pct',
                            'vol_30d', 'market_vol_30d', 'score_delta_5d'])
    return df.reset_index(drop=True)
