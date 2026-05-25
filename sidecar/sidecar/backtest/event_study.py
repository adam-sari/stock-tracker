"""Cumulative abnormal returns (CAR) around discrete events."""
from __future__ import annotations
import numpy as np
import pandas as pd


def compute_car(
    closes: pd.DataFrame,
    events: pd.DataFrame,
    pre: int = 5,
    post: int = 21,
) -> pd.DataFrame:
    """Mean CAR by offset day around event dates.

    `closes`: wide DataFrame of prices (rows = trading dates, cols = tickers).
    `events`: DataFrame with columns ['ticker', 'event_date'].
    Returns: DataFrame indexed by offset_day (range [-pre, +post]) with columns
    ['mean', 'std', 'n', 'tstat'].
    """
    offsets = list(range(-pre, post + 1))
    per_event_returns: list[dict] = []
    for _, row in events.iterrows():
        ticker = row['ticker']
        edate = pd.Timestamp(row['event_date'])
        if ticker not in closes.columns:
            continue
        series = closes[ticker].dropna()
        if edate not in series.index:
            continue
        idx0 = series.index.get_loc(edate)
        base = series.iloc[idx0]
        for off in offsets:
            target_idx = idx0 + off
            if target_idx < 0 or target_idx >= len(series):
                continue
            per_event_returns.append({
                'offset': off,
                'ret': series.iloc[target_idx] / base - 1,
            })
    if not per_event_returns:
        return pd.DataFrame(
            [{'offset': o, 'mean': np.nan, 'std': np.nan, 'n': 0, 'tstat': np.nan} for o in offsets]
        ).set_index('offset')

    df = pd.DataFrame(per_event_returns)
    grouped = df.groupby('offset')['ret']
    stats = grouped.agg(['mean', 'std', 'count']).rename(columns={'count': 'n'})
    stats['tstat'] = stats['mean'] / (stats['std'] / np.sqrt(stats['n']))
    return stats.reindex(offsets)
