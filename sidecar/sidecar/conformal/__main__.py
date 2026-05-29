"""Entry point: python -m sidecar.conformal"""
import argparse
import sqlite3
from datetime import date

from sidecar.conformal.cli import run_nightly_cqr_train


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument('--db', required=True, help='SQLite path')
    p.add_argument('--end-date', default=date.today().isoformat())
    p.add_argument('--alpha', type=float, default=0.10)
    p.add_argument('--n-estimators', type=int, default=400)
    args = p.parse_args()
    con = sqlite3.connect(args.db)
    try:
        n = run_nightly_cqr_train(
            con, end_date=args.end_date, alpha=args.alpha,
            n_estimators=args.n_estimators,
        )
    finally:
        con.close()
    print(f"wrote {n} cqr rows")


if __name__ == '__main__':
    main()
