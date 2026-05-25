"""Tests for sidecar.backtest.returns — forward returns + SPY-excess."""
from __future__ import annotations
import numpy as np
import pandas as pd
import pytest

from sidecar.backtest.returns import forward_returns, spy_excess


def _linear_prices(tickers, n_days, start='2024-01-01'):
    """Prices that grow by +1 per day per ticker. AAPL: 100,101,...; NVDA: 200,201,..."""
    dates = pd.bdate_range(start, periods=n_days)
    bases = {'AAPL': 100, 'NVDA': 200, 'SPY': 400}
    return pd.DataFrame({t: [bases[t] + i for i in range(n_days)] for t in tickers}, index=dates)


def test_forward_returns_1d_on_linear_prices():
    closes = _linear_prices(['AAPL'], n_days=10)
    fr = forward_returns(closes, horizons=[1])
    assert fr.loc[(closes.index[0], 'AAPL'), 1] == pytest.approx(0.01, abs=1e-10)
    assert pd.isna(fr.loc[(closes.index[-1], 'AAPL'), 1])


def test_forward_returns_multiple_horizons():
    closes = _linear_prices(['AAPL'], n_days=10)
    fr = forward_returns(closes, horizons=[1, 5])
    assert fr.loc[(closes.index[0], 'AAPL'), 5] == pytest.approx(0.05, abs=1e-10)


def test_spy_excess_subtracts_benchmark_return():
    closes = _linear_prices(['AAPL', 'SPY'], n_days=10)
    fr = forward_returns(closes, horizons=[1])
    spy_fr = forward_returns(closes[['SPY']], horizons=[1])
    excess = spy_excess(fr, spy_fr)
    aapl_1d = (101/100 - 1) - (401/400 - 1)
    assert excess.loc[(closes.index[0], 'AAPL'), 1] == pytest.approx(aapl_1d, abs=1e-10)


def test_forward_returns_drops_assets_with_no_data():
    closes = _linear_prices(['AAPL'], n_days=10).copy()
    closes['MISS'] = np.nan
    fr = forward_returns(closes, horizons=[1])
    assert pd.isna(fr.loc[(closes.index[0], 'MISS'), 1])
