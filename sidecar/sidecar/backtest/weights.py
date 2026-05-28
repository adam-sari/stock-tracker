"""Plan 0004 v0 — single-fold OLS weight learner.

Methodologically lightweight: one train fold, OLS (no Ridge / no CV), mean-imputation
of NaN, one OOS-IC baseline (production aggregateScores-equivalent). Intended to
unblock production weight tuning fast; walk-forward is the Plan 0004.1 follow-up.

Reference: docs/plans/draft/0004-signal-weight-optimizer.md "v0 Escape Hatch".
"""
from __future__ import annotations
from dataclasses import dataclass
from datetime import date
from typing import Optional
import numpy as np
import pandas as pd
from scipy.stats import spearmanr

SIGNALS = ['insider', 'congress', 'funds', 'halts', 'volume', 'sentiment']


@dataclass
class WindowResult:
    train_start_date: date
    train_end_date: date
    test_start_date: date
    test_end_date: date
    weights: dict[str, float]
    alpha_selected: Optional[float]  # always None for v0 (OLS, no shrinkage)
    oos_ic_learned: Optional[float]
    oos_ic_production: Optional[float]   # aggregateScores-equivalent (uniform default weights)
    oos_ic_backtest: Optional[float]     # always None for v0; full walk-forward emits this
    n_train: int
    n_test: int


def _compute_ic(scores: np.ndarray, returns: np.ndarray) -> Optional[float]:
    """Spearman IC. Returns None on degenerate input — never silent NaN."""
    if len(scores) < 5:
        return None
    if np.all(scores == scores[0]) or np.all(returns == returns[0]):
        return None
    rho, _ = spearmanr(scores, returns)
    if not np.isfinite(rho):
        return None
    return float(rho)


def aggregate_scores_baseline(X: np.ndarray, default_weights: dict[str, float]) -> np.ndarray:
    """Mimic lib/computations/discovery.ts aggregateScores: weighted sum of raw scores."""
    w = np.array([default_weights[s] for s in SIGNALS])
    return X @ w


def learn_weights_v0(
    df: pd.DataFrame,
    target_horizon: int = 5,
    train_days: int = 252,
    embargo_days: int = 21,
    test_days: int = 21,
    default_weights: Optional[dict[str, float]] = None,
) -> Optional[WindowResult]:
    """Single-fold OLS weight learner.

    Window: the LAST eligible (train, embargo, test) triple ending at the latest available
    date. If insufficient data, returns None.

    Embargo is enforced as max(embargo_days, target_horizon) so train labels never bleed
    into test dates.
    """
    df = df.copy()
    df['date'] = pd.to_datetime(df['date'])
    target_col = f'realized_{target_horizon}d_spy_excess'
    if target_col not in df.columns:
        raise ValueError(f"target column {target_col!r} not in df; got {list(df.columns)}")
    if default_weights is None:
        default_weights = {s: 1.0 for s in SIGNALS}

    effective_embargo = max(embargo_days, target_horizon)

    all_dates = sorted(df['date'].unique())
    if len(all_dates) < train_days + effective_embargo + test_days:
        return None

    # Pick the LAST eligible window: test_end at the latest date.
    last_idx = len(all_dates) - 1
    test_end = all_dates[last_idx]
    test_start = all_dates[last_idx - (test_days - 1)]
    train_end_idx = last_idx - (test_days - 1) - effective_embargo - 1
    train_start_idx = train_end_idx - (train_days - 1)
    if train_start_idx < 0:
        return None
    train_start = all_dates[train_start_idx]
    train_end = all_dates[train_end_idx]

    train = df[(df['date'] >= train_start) & (df['date'] <= train_end)].dropna(subset=[target_col]).copy()
    test = df[(df['date'] >= test_start) & (df['date'] <= test_end)].dropna(subset=[target_col]).copy()
    if len(train) < 100 or len(test) < 30:
        return None

    # Mean-impute NaN scores within the train fold (column-wise mean from train).
    train_means = train[SIGNALS].mean()
    Xtr = train[SIGNALS].fillna(train_means).to_numpy()
    Xte = test[SIGNALS].fillna(train_means).to_numpy()
    ytr = train[target_col].to_numpy()
    yte = test[target_col].to_numpy()

    # OLS (no intercept; demean target for stability).
    # Skip columns whose train-fold std is ~0 — those signals are absent.
    train_std = Xtr.std(axis=0)
    nz_mask = train_std > 1e-9
    weights_full = np.zeros(Xtr.shape[1])
    if nz_mask.any():
        Xtr_used = Xtr[:, nz_mask]
        # Center features around train-fold mean for numerical stability; weights
        # are the OLS coefficients on the raw (non-standardized) features.
        coef, _resid, _rank, _sv = np.linalg.lstsq(Xtr_used, ytr, rcond=None)
        weights_full[nz_mask] = coef

    # Three baselines on ORIGINAL (mean-imputed but otherwise raw) test features.
    s_learned = Xte @ weights_full
    s_production = aggregate_scores_baseline(Xte, default_weights)

    return WindowResult(
        train_start_date=pd.Timestamp(train_start).date(),
        train_end_date=pd.Timestamp(train_end).date(),
        test_start_date=pd.Timestamp(test_start).date(),
        test_end_date=pd.Timestamp(test_end).date(),
        weights={s: float(w) for s, w in zip(SIGNALS, weights_full)},
        alpha_selected=None,
        oos_ic_learned=_compute_ic(s_learned, yte),
        oos_ic_production=_compute_ic(s_production, yte),
        oos_ic_backtest=None,
        n_train=len(train),
        n_test=len(test),
    )


def to_json_dict(
    results: list[WindowResult],
    *,
    target_horizon: int,
    train_days: int,
    embargo_days: int,
    test_days: int,
    scoring_git_sha: Optional[str],
    realized_returns_max_date: Optional[str],
    survivorship_universe: str,
) -> dict:
    """Envelope for weights.json. Shape matches the Plan 0004 spec; method='ols_single_fold_v0'
    flags v0; future walk-forward versions will bump this string.

    survivorship_universe: 'currently_listed_sp500' until Phase A lands, then 'point_in_time_sp500'.
    """
    return {
        'method': 'ols_single_fold_v0',
        'horizons': [target_horizon],
        'train_days': train_days,
        'embargo_days': embargo_days,
        'test_days': test_days,
        'scoring_git_sha': scoring_git_sha,
        'realized_returns_max_date': realized_returns_max_date,
        'survivorship_universe': survivorship_universe,
        'windows': [
            {
                'train_start': r.train_start_date.isoformat(),
                'train_end': r.train_end_date.isoformat(),
                'test_start': r.test_start_date.isoformat(),
                'test_end': r.test_end_date.isoformat(),
                'weights': r.weights,
                'alpha_selected': r.alpha_selected,
                'oos_ic_learned': r.oos_ic_learned,
                'oos_ic_production': r.oos_ic_production,
                'oos_ic_backtest': r.oos_ic_backtest,
                'n_train': r.n_train,
                'n_test': r.n_test,
            }
            for r in results
        ],
    }
