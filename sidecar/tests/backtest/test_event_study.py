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
