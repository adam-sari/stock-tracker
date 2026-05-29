import numpy as np
import pandas as pd

from sidecar.conformal.trainer import train_cqr_models, predict_quantiles


def _make_skewed_data(n: int = 1000, seed: int = 7) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    composite_score = rng.uniform(-2, 2, n)
    vol_30d = rng.uniform(0.005, 0.05, n)
    market_vol_30d = rng.uniform(0.008, 0.025, n)
    score_delta_5d = rng.normal(0, 0.3, n)
    sector = rng.choice(['Tech', 'Energy', 'Healthcare'], n)

    # True spy_excess: composite × 0.05 + skewed noise scaled by vol
    noise = rng.standard_gamma(2.0, n) - 2.0  # right-skewed; mean ~0
    target = 0.05 * composite_score + vol_30d * noise

    return pd.DataFrame({
        'composite_score': composite_score,
        'vol_30d': vol_30d,
        'market_vol_30d': market_vol_30d,
        'score_delta_5d': score_delta_5d,
        'sector': sector,
        'spy_excess_pct': target,
    })


def test_train_cqr_returns_three_models_per_horizon() -> None:
    df = _make_skewed_data()
    models = train_cqr_models(df, horizon=21, alpha=0.10, n_estimators=80)
    assert set(models.keys()) == {'q_lo', 'q_hi', 'median'}


def test_quantile_predictions_satisfy_q_lo_le_median_le_q_hi() -> None:
    df = _make_skewed_data()
    models = train_cqr_models(df, horizon=21, alpha=0.10, n_estimators=80)
    preds = predict_quantiles(models, df.head(50))
    assert (preds['q_lo'] <= preds['median'] + 1e-6).all()
    assert (preds['median'] <= preds['q_hi'] + 1e-6).all()


def test_intervals_widen_with_vol_30d() -> None:
    """Heteroscedasticity-aware: high-vol rows should get wider intervals."""
    df = _make_skewed_data(n=2000)
    models = train_cqr_models(df, horizon=21, alpha=0.10, n_estimators=120)
    test_lo_vol = df[df['vol_30d'] < df['vol_30d'].quantile(0.20)].head(50)
    test_hi_vol = df[df['vol_30d'] > df['vol_30d'].quantile(0.80)].head(50)
    p_lo = predict_quantiles(models, test_lo_vol)
    p_hi = predict_quantiles(models, test_hi_vol)
    width_lo = (p_lo['q_hi'] - p_lo['q_lo']).mean()
    width_hi = (p_hi['q_hi'] - p_hi['q_lo']).mean()
    assert width_hi > width_lo


import pytest


def test_train_cqr_raises_on_empty_features() -> None:
    empty = pd.DataFrame(columns=[
        'composite_score', 'vol_30d', 'market_vol_30d', 'score_delta_5d',
        'sector', 'spy_excess_pct',
    ])
    with pytest.raises(ValueError, match='empty'):
        train_cqr_models(empty, horizon=21, alpha=0.10)
