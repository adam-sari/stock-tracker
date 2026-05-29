import json
import sqlite3
from datetime import date, timedelta
from pathlib import Path

import numpy as np

from sidecar.conformal.cli import run_nightly_cqr_train


def _seed(con: sqlite3.Connection) -> None:
    con.executescript("""
        CREATE TABLE backtest_scores (date TEXT, ticker TEXT, signal_kind TEXT,
          score REAL, detail_json TEXT, PRIMARY KEY (date, ticker, signal_kind));
        CREATE TABLE realized_returns (date TEXT, ticker TEXT, horizon_days INTEGER,
          return_pct REAL, spy_excess_pct REAL, status TEXT, computed_at INTEGER,
          PRIMARY KEY (date, ticker, horizon_days));
        CREATE TABLE candles_daily (ticker TEXT, date TEXT, open REAL, high REAL,
          low REAL, close REAL, volume INTEGER, source TEXT,
          PRIMARY KEY (ticker, date));
        CREATE TABLE stock_meta (ticker TEXT PRIMARY KEY, name TEXT, sector TEXT);
        CREATE TABLE cqr_quantile_preds (date TEXT, ticker TEXT, horizon_days INTEGER,
          alpha REAL, q_lo REAL, q_hi REAL, point_pred REAL,
          features_json TEXT, model_version TEXT, trained_at INTEGER,
          PRIMARY KEY (date, ticker, horizon_days, alpha));
    """)
    rng = np.random.default_rng(3)
    tickers = [f'T{i:03d}' for i in range(40)]
    sectors = ['Tech', 'Energy', 'Healthcare']
    for t in tickers:
        con.execute("INSERT INTO stock_meta VALUES (?, ?, ?)",
                    (t, t, rng.choice(sectors)))
    start = date(2026, 1, 1)
    for d_off in range(120):
        d = (start + timedelta(days=d_off)).isoformat()
        spy_close = 400 + d_off * 0.5
        con.execute("INSERT INTO candles_daily VALUES ('SPY', ?, 0, 0, 0, ?, 0, 'a')",
                    (d, spy_close))
        for t in tickers:
            score = float(rng.normal(0, 1))
            ret = float(0.02 * score + rng.normal(0, 0.02))
            spy_excess = ret - 0.0005
            con.execute("INSERT INTO backtest_scores VALUES (?, ?, 'composite', ?, NULL)",
                        (d, t, score))
            con.execute(
                "INSERT INTO realized_returns VALUES (?, ?, 21, ?, ?, 'computed', 1)",
                (d, t, ret, spy_excess),
            )
            close = 100 * (1 + 0.0005 * d_off + rng.normal(0, 0.01))
            con.execute("INSERT INTO candles_daily VALUES (?, ?, 0, 0, 0, ?, 0, 'a')",
                        (t, d, close))
    con.commit()


def test_run_nightly_cqr_train_writes_rows(tmp_path: Path) -> None:
    db = tmp_path / 't.db'
    con = sqlite3.connect(db)
    _seed(con)
    n = run_nightly_cqr_train(
        con, end_date='2026-04-30', horizons=[21], alpha=0.10, n_estimators=60,
    )
    assert n > 0
    rows = con.execute(
        "SELECT date, ticker, horizon_days, alpha, q_lo, q_hi, point_pred, "
        "features_json, model_version FROM cqr_quantile_preds"
    ).fetchall()
    assert len(rows) == 40  # one row per ticker for end_date
    for row in rows:
        assert row[2] == 21
        assert abs(row[3] - 0.10) < 1e-9
        assert row[4] <= row[5]  # q_lo <= q_hi
        features = json.loads(row[7])
        assert 'composite_score' in features
        assert isinstance(row[8], str) and row[8].startswith('lgbm-cqr-')


def test_run_nightly_cqr_train_is_idempotent(tmp_path: Path) -> None:
    db = tmp_path / 't.db'
    con = sqlite3.connect(db)
    _seed(con)
    n1 = run_nightly_cqr_train(con, end_date='2026-04-30', horizons=[21],
                                alpha=0.10, n_estimators=60)
    n2 = run_nightly_cqr_train(con, end_date='2026-04-30', horizons=[21],
                                alpha=0.10, n_estimators=60)
    assert n1 == n2 == 40
    total = con.execute("SELECT COUNT(*) FROM cqr_quantile_preds").fetchone()[0]
    assert total == 40  # INSERT OR REPLACE: no duplicates
