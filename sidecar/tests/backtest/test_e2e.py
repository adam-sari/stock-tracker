"""End-to-end: synthetic DB → TS replay → Python analysis → JSON matches golden."""
from __future__ import annotations
import json
import os
import shutil
import subprocess
from datetime import date as date_cls, timedelta
from pathlib import Path

import pytest
from sqlalchemy import text

from sidecar.db import get_session

PROJECT_ROOT = Path(__file__).resolve().parents[3]
GOLDEN = Path(__file__).parent / "fixtures" / "golden_summary.json"


@pytest.fixture
def seeded_db(fresh_db):
    """Seed a tiny fixture: 6 tickers (5 + SPY) x 90 calendar days x hand-rolled signals."""
    start = date_cls(2024, 1, 1)
    with get_session() as s:
        for ticker, base in [("AAPL", 100), ("MSFT", 200), ("NVDA", 300),
                             ("GOOG", 150), ("META", 250), ("SPY", 400)]:
            for i in range(90):
                d = (start + timedelta(days=i)).isoformat()
                price = base + i * 0.1
                vol = 1_000_000 + (i * 7919 % 500_000)
                s.execute(text(
                    "INSERT INTO candles_daily (ticker, date, open, high, low, close, volume, source) "
                    "VALUES (:t, :d, :p, :p, :p, :p, :v, 'fixture')"
                ), {"t": ticker, "d": d, "p": price, "v": vol})
        # Volume spike on AAPL day 80 (= 2024-03-21)
        spike_date = (start + timedelta(days=80)).isoformat()
        s.execute(text(
            "UPDATE candles_daily SET volume = 10000000 WHERE ticker = 'AAPL' AND date = :d"
        ), {"d": spike_date})
        # Three insider buys on NVDA in days 70-72
        base_epoch = 1704067200 + 70 * 86400  # 2024-01-01 UTC epoch + 70 days
        for i, name in enumerate(['X', 'Y', 'Z']):
            s.execute(text(
                "INSERT INTO insider_txns (id, ticker, insider_name, code, is_derivative, shares, "
                "txn_date, filed_at, source) VALUES (:id, 'NVDA', :n, 'P', 0, 100, :td, :fa, 'fixture')"
            ), {"id": f"i{i}", "n": name,
                "td": (start + timedelta(days=70)).isoformat(),
                "fa": base_epoch + i * 86400})
        s.commit()
    return fresh_db


def _run_replay(db_path: Path):
    node_bin = str(PROJECT_ROOT / "node_modules" / ".bin")
    search_path = os.pathsep.join([node_bin, os.environ.get("PATH", "")])
    npx = shutil.which("npx", path=search_path) or "npx"
    subprocess.run(
        [npx, "tsx", "scripts/replay-scores.ts", "--from", "2024-02-15", "--to", "2024-03-25"],
        cwd=PROJECT_ROOT,
        env={**os.environ, "DB_PATH": str(db_path)},
        check=True, capture_output=True,
    )


def test_e2e_matches_golden(seeded_db, tmp_path, request):
    _run_replay(seeded_db)
    out = tmp_path / "out"
    out.mkdir()
    py_result = subprocess.run(
        ["uv", "run", "python", "-m", "sidecar.backtest",
         "--from", "2024-02-15", "--to", "2024-03-25", "--out", str(out)],
        cwd=PROJECT_ROOT / "sidecar",
        env={**os.environ, "DB_PATH": str(seeded_db)},
        capture_output=True, text=True,
    )
    if py_result.returncode != 0:
        raise AssertionError(
            f"Python CLI failed (exit {py_result.returncode}).\n"
            f"STDOUT:\n{py_result.stdout}\nSTDERR:\n{py_result.stderr}"
        )
    subdirs = list(out.iterdir())
    assert len(subdirs) == 1
    summary = json.loads((subdirs[0] / "summary.json").read_text())

    # Normalize volatile fields
    summary["run"]["scoring_git_sha"] = "REDACTED"

    if request.config.getoption("--update-golden", default=False):
        GOLDEN.parent.mkdir(parents=True, exist_ok=True)
        GOLDEN.write_text(json.dumps(summary, indent=2, default=str))
        pytest.skip("Golden file updated")

    expected = json.loads(GOLDEN.read_text())
    assert summary["run"]["n_assets"] == expected["run"]["n_assets"]
    assert summary["run"]["n_dates"] == expected["run"]["n_dates"]
    assert summary["horizons"] == expected["horizons"]
    for h in summary["horizons"]:
        h_str = str(h)
        assert summary["composite_ic"][h_str]["n"] == expected["composite_ic"][h_str]["n"]
