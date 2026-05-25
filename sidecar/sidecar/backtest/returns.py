"""Forward returns and SPY-excess for backtest analysis."""
from __future__ import annotations
from typing import Iterable, List

import pandas as pd


def forward_returns(
    closes: pd.DataFrame,
    horizons: Iterable[int],
) -> pd.DataFrame:
    """Forward returns indexed by (date, asset), one column per horizon.

    `closes`: rows = trading dates (DatetimeIndex), columns = tickers, values = price.
    Returns a DataFrame with MultiIndex (date, asset) and integer-named columns
    for each horizon in days. forward_return[date, asset, h] = close[date+h] / close[date] - 1.
    """
    horizons = list(horizons)
    pieces: List[pd.DataFrame] = []
    for h in horizons:
        fr = closes.shift(-h) / closes - 1
        long_fr = fr.stack(future_stack=True).rename(h).reset_index()
        long_fr.columns = ['date', 'asset', h]
        long_fr = long_fr.set_index(['date', 'asset'])
        pieces.append(long_fr)
    return pd.concat(pieces, axis=1)


def spy_excess(asset_fr: pd.DataFrame, spy_fr: pd.DataFrame) -> pd.DataFrame:
    """Subtract SPY forward return at each (date, horizon) from each asset's forward return.

    `asset_fr`: MultiIndex (date, asset), columns are horizons.
    `spy_fr`:   same shape, with single asset 'SPY'.
    """
    spy_only = spy_fr.xs('SPY', level='asset')
    out = asset_fr.copy()
    for h in asset_fr.columns:
        out[h] = out[h].sub(out.index.get_level_values('date').map(spy_only[h]))
    return out
