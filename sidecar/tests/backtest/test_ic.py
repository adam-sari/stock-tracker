"""Tests for sidecar.backtest.ic — rank IC + Newey-West HAC t-stat."""
from __future__ import annotations
import numpy as np
import pandas as pd
import pytest

from sidecar.backtest.ic import rank_ic_by_date, ic_summary, nw_tstat


def _make_factor_returns(n_dates=30, n_assets=20, monotonic=True, seed=0):
    """Build factor + 1-day forward return Series with MultiIndex (date, asset)."""
    rng = np.random.default_rng(seed)
    dates = pd.bdate_range('2024-01-01', periods=n_dates)
    assets = [f'A{i:02d}' for i in range(n_assets)]
    idx = pd.MultiIndex.from_product([dates, assets], names=['date', 'asset'])
    factor = pd.Series(rng.normal(size=len(idx)), index=idx, name='factor')
    if monotonic:
        ranks = factor.groupby('date').rank()
        fr = ranks + rng.normal(scale=0.001, size=len(idx))
    else:
        fr = pd.Series(rng.normal(size=len(idx)), index=idx)
    return factor, fr


def test_rank_ic_by_date_monotonic_factor_returns_close_to_one():
    factor, fr = _make_factor_returns(monotonic=True)
    ic = rank_ic_by_date(factor, fr)
    assert isinstance(ic, pd.Series)
    assert ic.mean() > 0.95


def test_rank_ic_by_date_random_factor_centers_near_zero():
    factor, fr = _make_factor_returns(monotonic=False, n_dates=200, n_assets=50)
    ic = rank_ic_by_date(factor, fr)
    assert abs(ic.mean()) < 0.05


def test_ic_summary_returns_mean_std_tstat():
    factor, fr = _make_factor_returns(monotonic=True)
    ic = rank_ic_by_date(factor, fr)
    summary = ic_summary(ic)
    assert 'mean' in summary
    assert 'std' in summary
    assert 't_stat' in summary
    assert summary['mean'] > 0.9
    assert summary['t_stat'] > 5


def test_nw_tstat_larger_than_ols_on_autocorrelated_series():
    rng = np.random.default_rng(0)
    n = 200
    x = np.zeros(n)
    eps = rng.normal(size=n)
    for i in range(1, n):
        x[i] = 0.5 * x[i-1] + eps[i]
    s = pd.Series(x + 0.05)
    ols_t = abs(s.mean() / (s.std() / np.sqrt(n)))
    nw_t = abs(nw_tstat(s, lag=5))
    assert nw_t < ols_t
