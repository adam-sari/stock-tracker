"""Rank IC + IC IR + Newey-West HAC t-stat."""
from __future__ import annotations
import numpy as np
import pandas as pd
from scipy.stats import spearmanr
import statsmodels.api as sm


def rank_ic_by_date(factor: pd.Series, forward_return: pd.Series) -> pd.Series:
    """Cross-sectional Spearman rank IC per date.

    Both inputs are MultiIndex (date, asset). Returns a Series indexed by date.
    """
    df = pd.concat([factor.rename('f'), forward_return.rename('r')], axis=1).dropna()
    out = {}
    for date, group in df.groupby(level='date'):
        if len(group) < 3:
            continue
        rho, _ = spearmanr(group['f'], group['r'])
        out[date] = rho
    return pd.Series(out).sort_index().rename('rank_ic')


def nw_tstat(series: pd.Series, lag: int) -> float:
    """Newey-West HAC t-stat of mean(series) != 0 with given autocorrelation lag."""
    s = series.dropna()
    if len(s) < 5:
        return float('nan')
    X = np.ones(len(s))
    model = sm.OLS(s.values, X).fit(cov_type='HAC', cov_kwds={'maxlags': lag})
    return float(model.tvalues[0])


def ic_summary(ic_series: pd.Series, nw_lag: int = 1) -> dict:
    """Headline stats for an IC time series."""
    s = ic_series.dropna()
    return {
        'mean': float(s.mean()),
        'std': float(s.std(ddof=1)),
        'ir': float(s.mean() / s.std(ddof=1)) if s.std(ddof=1) > 0 else float('nan'),
        't_stat': nw_tstat(s, lag=nw_lag),
        'n': int(len(s)),
        'hit_rate': float((s > 0).mean()),
    }
