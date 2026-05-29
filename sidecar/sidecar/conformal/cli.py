"""Nightly CQR training orchestrator."""
from __future__ import annotations
import json
import sqlite3
from datetime import datetime, timezone
from typing import Iterable

import pandas as pd

from sidecar.conformal.features import extract_features
from sidecar.conformal.trainer import (
    FEATURE_COLS_NUM, predict_quantiles, train_cqr_models,
)


def _model_version(horizon: int) -> str:
    return f"lgbm-cqr-h{horizon}-{datetime.now(timezone.utc).date().isoformat()}"


def run_nightly_cqr_train(
    con: sqlite3.Connection,
    end_date: str,
    horizons: Iterable[int] = (1, 5, 21, 63),
    alpha: float = 0.10,
    n_estimators: int = 400,
) -> int:
    """Train one CQR model per horizon and write today's quantile preds.

    Returns the number of cqr_quantile_preds rows written.
    """
    total_written = 0
    trained_at = int(datetime.now(timezone.utc).timestamp())

    for h in horizons:
        train_df = extract_features(con, end_date=end_date, horizon=h, lookback_years=2)
        if len(train_df) < 200:
            continue  # insufficient data; see §8 of the spec
        models = train_cqr_models(train_df, horizon=h, alpha=alpha,
                                   n_estimators=n_estimators)

        today_rows = train_df[train_df['date'] == end_date]
        if today_rows.empty:
            continue
        preds = predict_quantiles(models, today_rows)
        version = _model_version(h)

        payload = []
        for (_, src), pred in zip(today_rows.iterrows(), preds.itertuples()):
            features = {c: float(src[c]) for c in FEATURE_COLS_NUM if c in src.index}
            features['sector'] = str(src.get('sector', 'UNK'))
            payload.append((
                src['date'], src['ticker'], h, alpha,
                float(pred.q_lo), float(pred.q_hi), float(pred.median),
                json.dumps(features), version, trained_at,
            ))
        con.executemany(
            "INSERT OR REPLACE INTO cqr_quantile_preds "
            "(date, ticker, horizon_days, alpha, q_lo, q_hi, point_pred, "
            " features_json, model_version, trained_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            payload,
        )
        total_written += len(payload)

    con.commit()
    return total_written
