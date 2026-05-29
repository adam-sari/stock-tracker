import sqlite3
from pathlib import Path

from sidecar.backtest.composite_persist import persist_composite_scores


def _seed(con: sqlite3.Connection) -> None:
    con.executescript(
        """
        CREATE TABLE backtest_scores (
          date TEXT NOT NULL, ticker TEXT NOT NULL, signal_kind TEXT NOT NULL,
          score REAL NOT NULL, detail_json TEXT,
          PRIMARY KEY (date, ticker, signal_kind)
        );
        """
    )
    rows = [
        ('2026-04-01', 'AAA', 'insider', 0.8, None),
        ('2026-04-01', 'AAA', 'congress', 0.4, None),
        ('2026-04-01', 'BBB', 'insider', -0.5, None),
        ('2026-04-01', 'BBB', 'congress', 0.1, None),
    ]
    con.executemany(
        "INSERT INTO backtest_scores VALUES (?, ?, ?, ?, ?)", rows
    )
    con.commit()


def test_persist_composite_writes_composite_rows(tmp_path: Path) -> None:
    db = tmp_path / 'test.db'
    con = sqlite3.connect(db)
    _seed(con)
    n = persist_composite_scores(con)
    assert n == 2  # one composite row per (date, ticker)

    rows = con.execute(
        "SELECT ticker, score FROM backtest_scores "
        "WHERE signal_kind='composite' ORDER BY ticker"
    ).fetchall()
    assert len(rows) == 2
    tickers = [r[0] for r in rows]
    assert tickers == ['AAA', 'BBB']
    # AAA had above-mean signals → positive composite; BBB negative
    assert rows[0][1] > 0
    assert rows[1][1] < 0


def test_persist_composite_is_idempotent(tmp_path: Path) -> None:
    db = tmp_path / 'test.db'
    con = sqlite3.connect(db)
    _seed(con)
    persist_composite_scores(con)
    persist_composite_scores(con)  # second call: same rows, no duplicates
    n_composite = con.execute(
        "SELECT COUNT(*) FROM backtest_scores WHERE signal_kind='composite'"
    ).fetchone()[0]
    assert n_composite == 2


def test_persist_composite_empty_db_returns_zero(tmp_path: Path) -> None:
    db = tmp_path / 'test.db'
    con = sqlite3.connect(db)
    con.executescript(
        """
        CREATE TABLE backtest_scores (
          date TEXT NOT NULL, ticker TEXT NOT NULL, signal_kind TEXT NOT NULL,
          score REAL NOT NULL, detail_json TEXT,
          PRIMARY KEY (date, ticker, signal_kind)
        );
        """
    )
    assert persist_composite_scores(con) == 0
    n = con.execute("SELECT COUNT(*) FROM backtest_scores").fetchone()[0]
    assert n == 0
