"""`python -m sidecar.backfill --signal {form4|13f} ...`"""
from __future__ import annotations
import argparse
import logging
import sys
from datetime import date, timedelta


def main() -> int:
    ap = argparse.ArgumentParser(prog="sidecar.backfill")
    sub = ap.add_subparsers(dest="signal", required=True)

    form4 = sub.add_parser("form4", help="Backfill Form 4 (insider trades)")
    form4.add_argument("--years", type=int, default=5)
    form4.add_argument("--chunk-days", type=int, default=7)

    f13 = sub.add_parser("13f", help="Backfill 13F (fund holdings)")
    f13.add_argument("--quarters", type=int, default=20)

    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")

    if args.signal == "form4":
        from sidecar.backfill.form4 import backfill_form4
        end = date.today()
        start = end - timedelta(days=365 * args.years)
        r = backfill_form4(start, end, chunk_days=args.chunk_days)
        print(f"Form 4 backfill: chunks={r['chunks']} inserted={r['inserted']} skipped={r['skipped']} errors={r['errors']}")
        return 0 if r["errors"] < 100 else 1
    elif args.signal == "13f":
        from sidecar.backfill.thirteen_f import backfill_13f
        r = backfill_13f(quarters_back=args.quarters)
        print(f"13F backfill: funds={r['funds']} filings={r['filings']} holdings={r['holdings']} errors={r['errors']}")
        return 0 if r["errors"] < 10 else 1
    return 2


if __name__ == "__main__":
    sys.exit(main())
