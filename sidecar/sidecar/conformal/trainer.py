"""LightGBM CQR trainer: three quantile models per horizon."""
from __future__ import annotations
from typing import TypedDict

import lightgbm as lgb
import numpy as np
import pandas as pd


FEATURE_COLS_NUM = ['composite_score', 'vol_30d', 'market_vol_30d', 'score_delta_5d']
SECTOR_PREFIX = 'sector_'


class CqrModels(TypedDict):
    q_lo: lgb.Booster
    q_hi: lgb.Booster
    median: lgb.Booster


def _encode(df: pd.DataFrame) -> pd.DataFrame:
    """One-hot encode sector, keep numeric columns."""
    dummies = pd.get_dummies(df['sector'].fillna('UNK'), prefix='sector')
    encoded = pd.concat([df[FEATURE_COLS_NUM].reset_index(drop=True),
                         dummies.reset_index(drop=True)], axis=1)
    return encoded


def _train_one(X: pd.DataFrame, y: pd.Series, alpha: float, n_estimators: int) -> lgb.Booster:
    dataset = lgb.Dataset(X, label=y)
    params = {
        'objective': 'quantile',
        'alpha': alpha,
        'learning_rate': 0.05,
        'max_depth': 6,
        'min_data_in_leaf': 30,
        'force_row_wise': True,
        'verbosity': -1,
        'seed': 42,
        'deterministic': True,
    }
    return lgb.train(params, dataset, num_boost_round=n_estimators)


def train_cqr_models(
    features_df: pd.DataFrame,
    horizon: int,  # noqa: ARG001 (carried for signature uniformity)
    alpha: float = 0.10,
    n_estimators: int = 400,
) -> CqrModels:
    """Train three quantile models for the given joint alpha."""
    X = _encode(features_df)
    y = features_df['spy_excess_pct'].astype(float)
    q_lo = _train_one(X, y, alpha=alpha / 2, n_estimators=n_estimators)
    q_hi = _train_one(X, y, alpha=1 - alpha / 2, n_estimators=n_estimators)
    median = _train_one(X, y, alpha=0.5, n_estimators=n_estimators)
    return {'q_lo': q_lo, 'q_hi': q_hi, 'median': median}


def predict_quantiles(models: CqrModels, features_df: pd.DataFrame) -> pd.DataFrame:
    """Predict (q_lo, q_hi, median) for each row in features_df."""
    X = _encode(features_df)
    # Ensure all training columns exist (one-hot expansion may differ at predict time)
    train_cols = models['q_lo'].feature_name()
    for c in train_cols:
        if c not in X.columns:
            X[c] = 0
    X = X[train_cols]
    return pd.DataFrame({
        'q_lo': models['q_lo'].predict(X),
        'q_hi': models['q_hi'].predict(X),
        'median': models['median'].predict(X),
    })
