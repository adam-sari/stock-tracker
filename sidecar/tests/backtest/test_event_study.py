"""Tests for sidecar.backtest.event_study — CAR for rare-event signals."""
from __future__ import annotations
import numpy as np
import pandas as pd
import pytest

from sidecar.backtest.event_study import compute_car


def _flat_prices(tickers, n_days, start='2024-01-01'):
    dates = pd.bdate_range(start, periods=n_days)
    return pd.DataFrame({t: [100.0] * n_days for t in tickers}, index=dates)


def test_compute_car_recovers_known_one_pct_pop():
    """Each event followed by exactly +1% on day +1 → mean CAR[+1] = 0.01."""
    closes = _flat_prices(['A', 'B', 'C'], n_days=30)
    events = [
        ('A', closes.index[10]),
        ('B', closes.index[15]),
        ('C', closes.index[20]),
    ]
    for ticker, edate in events:
        idx = closes.index.get_loc(edate)
        closes.iloc[idx + 1:, closes.columns.get_loc(ticker)] *= 1.01

    ev_df = pd.DataFrame(events, columns=['ticker', 'event_date'])
    car = compute_car(closes, ev_df, pre=2, post=2)

    assert car.loc[1, 'mean'] == pytest.approx(0.01, abs=1e-6)
    assert abs(car.loc[-1, 'mean']) < 1e-9
    assert car.loc[0, 'n'] == 3


def test_compute_car_returns_empty_on_no_events():
    closes = _flat_prices(['A'], n_days=10)
    ev = pd.DataFrame(columns=['ticker', 'event_date'])
    car = compute_car(closes, ev, pre=2, post=2)
    assert len(car) == 5
    assert (car['n'] == 0).all()


def test_compute_car_output_serializes_to_strict_json():
    """Regression: degenerate CAR (std=0 from identical returns, or NaN from n=1)
    must serialize to JSON.parse-compatible output. Bug was emitting literal
    'Infinity' / 'NaN' which JS rejects, crashing /backtest at render time."""
    import json
    from sidecar.backtest.cli import _sanitize_for_json

    # 3 events each followed by exactly +1% on day +1 → returns identical
    # across events at every offset → std=0 at offset +1, tstat = inf or NaN.
    closes = _flat_prices(['A', 'B', 'C'], n_days=30)
    events = [
        ('A', closes.index[10]),
        ('B', closes.index[15]),
        ('C', closes.index[20]),
    ]
    for ticker, edate in events:
        idx = closes.index.get_loc(edate)
        closes.iloc[idx + 1:, closes.columns.get_loc(ticker)] *= 1.01

    ev_df = pd.DataFrame(events, columns=['ticker', 'event_date'])
    car = compute_car(closes, ev_df, pre=2, post=2)

    raw = car.to_dict(orient='index')
    # Sanity-check: at least one offset has invalid-for-strict-JSON tstat
    has_bad = any(
        isinstance(v, float) and (v != v or v in (float('inf'), float('-inf')))
        for row in raw.values() for v in row.values()
    )
    assert has_bad, "Test fixture failed to produce a degenerate row"

    sanitized = _sanitize_for_json(raw)
    # `allow_nan=False` raises if NaN/Infinity present — same strictness as JS JSON.parse
    json.dumps(sanitized, allow_nan=False)


def test_sanitize_for_json_replaces_nan_inf_with_none():
    """Producer-side sanitization: NaN/+inf/-inf become None; rest passes through."""
    import math
    from sidecar.backtest.cli import _sanitize_for_json

    data = {
        'tstat': float('inf'),
        'mean': float('-inf'),
        'std': float('nan'),
        'n': 0,
        'normal': 1.5,
        'nested': {'tstat': float('inf'), 'k': 'v'},
        'list': [float('nan'), 1.0],
    }
    result = _sanitize_for_json(data)
    assert result['tstat'] is None
    assert result['mean'] is None
    assert result['std'] is None
    assert result['n'] == 0
    assert result['normal'] == 1.5
    assert result['nested']['tstat'] is None
    assert result['nested']['k'] == 'v'
    assert result['list'][0] is None
    assert result['list'][1] == 1.0
