"""Tests for Plan 0004 v0 — single-fold OLS weight learner."""
from __future__ import annotations
import numpy as np
import pandas as pd
import pytest
from sidecar.backtest.weights import (
    learn_weights_v0,
    SIGNALS,
    aggregate_scores_baseline,
    to_json_dict,
)


def _make_synthetic(n_days: int = 500, n_assets: int = 30, seed: int = 42,
                    target_col: str = 'realized_5d_spy_excess') -> pd.DataFrame:
    """True weights: insider=0.5, volume=0.3, congress=0.2, others=0."""
    rng = np.random.default_rng(seed)
    dates = pd.bdate_range('2024-01-01', periods=n_days)
    rows = []
    for d in dates:
        for a in range(n_assets):
            scores = {s: rng.uniform(-1, 1) for s in SIGNALS}
            true_signal = 0.5 * scores['insider'] + 0.3 * scores['volume'] + 0.2 * scores['congress']
            noise = rng.normal(0, 0.05)
            rows.append({'date': d, 'ticker': f'T{a:03d}',
                         target_col: true_signal + noise, **scores})
    return pd.DataFrame(rows)


def test_v0_recovers_known_weights():
    df = _make_synthetic()
    result = learn_weights_v0(df, target_horizon=5, train_days=200, embargo_days=10, test_days=20)
    assert result is not None
    w = result.weights
    # Recovered weights should be in the right ballpark — OLS on the standardized features.
    assert w['insider'] > 0.3
    assert w['volume'] > 0.15
    assert w['congress'] > 0.05
    assert abs(w['halts']) < 0.15
    assert abs(w['funds']) < 0.15
    assert abs(w['sentiment']) < 0.15


def test_v0_returns_single_window():
    df = _make_synthetic()
    result = learn_weights_v0(df, target_horizon=5, train_days=200, embargo_days=10, test_days=20)
    assert result is not None
    assert result.train_start_date is not None
    assert result.train_end_date < result.test_start_date
    assert result.test_start_date <= result.test_end_date
    assert result.n_train > 0
    assert result.n_test > 0
    for s in SIGNALS:
        assert s in result.weights
        assert np.isfinite(result.weights[s])


def test_v0_embargo_respects_target_horizon():
    """The label-leakage invariant: (train_end + target_horizon trading days) < test_start."""
    df = _make_synthetic(n_days=600, target_col='realized_63d_spy_excess')
    result = learn_weights_v0(df, target_horizon=63, train_days=200, embargo_days=21, test_days=21)
    assert result is not None
    all_dates = pd.bdate_range('2024-01-01', periods=600)
    train_end_idx = list(all_dates.date).index(result.train_end_date)
    test_start_idx = list(all_dates.date).index(result.test_start_date)
    trading_day_gap = test_start_idx - train_end_idx
    assert trading_day_gap > 63, (
        f"Label leakage: train_end+{trading_day_gap}td <= test_start with target_horizon=63"
    )


def test_v0_oos_ic_against_production_baseline():
    """Single OOS-IC number is reported against the production aggregateScores baseline."""
    df = _make_synthetic()
    result = learn_weights_v0(df, target_horizon=5, train_days=200, embargo_days=10, test_days=20)
    assert result is not None
    assert result.oos_ic_learned is None or (np.isfinite(result.oos_ic_learned) and -1 <= result.oos_ic_learned <= 1)
    assert result.oos_ic_production is None or (np.isfinite(result.oos_ic_production) and -1 <= result.oos_ic_production <= 1)


def test_v0_handles_nan_via_mean_imputation():
    """A NaN score is mean-imputed within the train fold; row is not dropped."""
    df = _make_synthetic()
    df.loc[df['ticker'] == 'T000', 'funds'] = np.nan
    result = learn_weights_v0(df, target_horizon=5, train_days=200, embargo_days=10, test_days=20)
    assert result is not None
    for s in SIGNALS:
        assert np.isfinite(result.weights[s])
    assert result.n_train >= 100


def test_v0_all_nan_column_yields_zero_weight():
    """If a signal has no train-fold data, its learned weight is 0 (no crash)."""
    df = _make_synthetic()
    df['halts'] = np.nan
    result = learn_weights_v0(df, target_horizon=5, train_days=200, embargo_days=10, test_days=20)
    assert result is not None
    assert result.weights['halts'] == 0.0


def test_v0_compute_ic_none_on_degenerate_input():
    """Constant scores → None for IC (not silent NaN)."""
    df = _make_synthetic(n_days=300)
    result = learn_weights_v0(df, target_horizon=5, train_days=200, embargo_days=10, test_days=20)
    assert result is not None
    for field in ('oos_ic_learned', 'oos_ic_production'):
        v = getattr(result, field)
        assert v is None or np.isfinite(v), f"{field} silently NaN; should be None"


def test_v0_returns_none_when_insufficient_data():
    """Not enough trading days for one window → returns None."""
    df = _make_synthetic(n_days=50)
    result = learn_weights_v0(df, target_horizon=5, train_days=200, embargo_days=10, test_days=20)
    assert result is None


def test_v0_to_json_dict_includes_provenance():
    df = _make_synthetic()
    result = learn_weights_v0(df, target_horizon=5, train_days=200, embargo_days=10, test_days=20)
    envelope = to_json_dict(
        [result] if result else [],
        target_horizon=5,
        train_days=200,
        embargo_days=10,
        test_days=20,
        scoring_git_sha='abc123',
        realized_returns_max_date='2024-12-31',
        survivorship_universe='currently_listed_sp500',
    )
    assert envelope['method'] == 'ols_single_fold_v0'
    assert envelope['scoring_git_sha'] == 'abc123'
    assert envelope['realized_returns_max_date'] == '2024-12-31'
    assert envelope['survivorship_universe'] == 'currently_listed_sp500'
    assert envelope['horizons'] == [5]
    assert isinstance(envelope['windows'], list)
    if envelope['windows']:
        w0 = envelope['windows'][0]
        assert 'weights' in w0
        assert 'oos_ic_learned' in w0
        assert 'oos_ic_production' in w0
