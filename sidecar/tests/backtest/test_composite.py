"""Tests for sidecar.backtest.composite — z-score aggregation + partial-info rescaling."""
from __future__ import annotations
import numpy as np
import pandas as pd
import pytest

from sidecar.backtest.composite import zscore_by_date, composite_factor


def test_zscore_by_date_standardizes_cross_section():
    idx = pd.MultiIndex.from_tuples(
        [(pd.Timestamp('2024-01-01'), t) for t in ['A', 'B', 'C', 'D']] +
        [(pd.Timestamp('2024-01-02'), t) for t in ['A', 'B', 'C', 'D']],
        names=['date', 'asset'],
    )
    s = pd.Series([1, 2, 3, 4, 10, 20, 30, 40], index=idx)
    z = zscore_by_date(s)
    for date in [pd.Timestamp('2024-01-01'), pd.Timestamp('2024-01-02')]:
        group = z.xs(date, level='date')
        assert abs(group.mean()) < 1e-9
        assert abs(group.std(ddof=0) - 1.0) < 1e-9


def _ab_idx():
    """A two-asset index. With symmetric values [1, -1], the ddof=0 z-score
    preserves the inputs, which lets us assert on the post-zscore aggregation directly."""
    return pd.MultiIndex.from_tuples(
        [(pd.Timestamp('2024-01-01'), t) for t in ['A', 'B']],
        names=['date', 'asset'],
    )


def test_composite_all_signals_present_equals_mean():
    """With all 6 signals present, n_present/TOTAL = 1, so rescaling is a no-op
    and the composite equals the per-asset mean of z-scored signals."""
    idx = _ab_idx()
    signals = {
        'insider':   pd.Series([1.0, -1.0], index=idx),
        'congress':  pd.Series([1.0, -1.0], index=idx),
        'funds':     pd.Series([1.0, -1.0], index=idx),
        'halts':     pd.Series([1.0, -1.0], index=idx),
        'volume':    pd.Series([1.0, -1.0], index=idx),
        'sentiment': pd.Series([1.0, -1.0], index=idx),
    }
    comp = composite_factor(signals, partial_info_rescale=True)
    assert comp.loc[(pd.Timestamp('2024-01-01'), 'A')] == pytest.approx(1.0)
    assert comp.loc[(pd.Timestamp('2024-01-01'), 'B')] == pytest.approx(-1.0)


def test_composite_partial_info_rescaling():
    """2 of 6 signals present → composite = mean(z-scores present) * sqrt(2/6)."""
    idx = _ab_idx()
    nan_pair = pd.Series([np.nan, np.nan], index=idx)
    signals = {
        'insider':   pd.Series([1.0, -1.0], index=idx),
        'congress':  nan_pair,
        'funds':     nan_pair,
        'halts':     nan_pair,
        'volume':    pd.Series([1.0, -1.0], index=idx),
        'sentiment': nan_pair,
    }
    comp = composite_factor(signals, partial_info_rescale=True)
    assert comp.loc[(pd.Timestamp('2024-01-01'), 'A')] == pytest.approx(np.sqrt(2 / 6))
    assert comp.loc[(pd.Timestamp('2024-01-01'), 'B')] == pytest.approx(-np.sqrt(2 / 6))


def test_composite_no_rescaling():
    """With rescale off, composite is just the per-asset mean of present z-scores."""
    idx = _ab_idx()
    signals = {
        'insider':  pd.Series([1.0, -1.0], index=idx),
        'congress': pd.Series([np.nan, np.nan], index=idx),
    }
    comp = composite_factor(signals, partial_info_rescale=False)
    assert comp.loc[(pd.Timestamp('2024-01-01'), 'A')] == pytest.approx(1.0)
    assert comp.loc[(pd.Timestamp('2024-01-01'), 'B')] == pytest.approx(-1.0)
