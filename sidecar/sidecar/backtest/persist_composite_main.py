"""One-shot CLI: persist composite rows into backtest_scores."""
from __future__ import annotations
import argparse
import sqlite3

from sidecar.backtest.composite_persist import persist_composite_scores


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument('--db', required=True)
    args = p.parse_args()
    con = sqlite3.connect(args.db)
    try:
        n = persist_composite_scores(con)
    finally:
        con.close()
    print(f"wrote {n} composite rows")


if __name__ == '__main__':
    main()
