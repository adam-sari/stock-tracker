"""Composite factor: z-score aggregation across signals."""
from __future__ import annotations
import numpy as np
import pandas as pd

TOTAL_SIGNALS = 6


def zscore_by_date(s: pd.Series) -> pd.Series:
    """Z-score within each cross-section (per date)."""
    def _z(g: pd.Series) -> pd.Series:
        std = g.std(ddof=0)
        if std == 0 or np.isnan(std):
            return g - g.mean()
        return (g - g.mean()) / std
    return s.groupby(level='date', group_keys=False).apply(_z)


def composite_factor(
    signals: dict[str, pd.Series],
    partial_info_rescale: bool = True,
) -> pd.Series:
    """Equal-weight average of z-scored signals, with optional partial-info rescaling.

    `signals`: dict[signal_name → Series indexed by (date, asset)].
    Aligns by union of indices. Missing values do not contribute to the mean.
    If `partial_info_rescale`, multiplies the result by sqrt(n_present / TOTAL_SIGNALS)
    to preserve information ratio when fewer signals are available.
    """
    df = pd.DataFrame({name: zscore_by_date(s) for name, s in signals.items()})
    mean_present = df.mean(axis=1, skipna=True)
    if not partial_info_rescale:
        return mean_present.rename('composite')
    n_present = df.notna().sum(axis=1)
    scale = np.sqrt(n_present.where(n_present > 0, np.nan) / TOTAL_SIGNALS)
    return (mean_present * scale).rename('composite')
