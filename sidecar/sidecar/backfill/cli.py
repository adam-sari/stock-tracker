"""`python -m sidecar.backfill --signal {form4|13f} ...`

Bugs fixed in this CLI vs the original (post-Plan-2 verification findings):
- Forces UTF-8 stdout so EDGAR's rich-printed U+26A0 warning doesn't crash Windows cp1252.
- Clamps end date to yesterday — EDGAR's "use get_current_filings()" warning fires when
  end == today, which then triggers the cp1252 crash even with utf-8 stdout in some shells.
- Adds --days flag (mutually exclusive with --years) for short verification windows.
- 13f auto-seeds the funds table if empty (silent 0-funds was confusing).
"""
from __future__ import annotations
import argparse
import logging
import sys
from datetime import date, timedelta


def _ensure_utf8_stdout() -> None:
    """Force stdout/stderr to UTF-8 so EDGAR's rich-printed warnings render on Windows cp1252."""
    for stream_name in ("stdout", "stderr"):
        stream = getattr(sys, stream_name, None)
        if stream and hasattr(stream, "reconfigure"):
            try:
                stream.reconfigure(encoding="utf-8")
            except Exception:
                pass


def _ensure_funds_seeded() -> None:
    """Seed the curated funds list if the table is empty."""
    from sqlalchemy import text
    from sidecar.db import get_session
    with get_session() as s:
        n = s.execute(text("SELECT COUNT(*) AS n FROM funds WHERE is_curated=1")).scalar()
    if not n:
        from sidecar.seed_funds import seed_funds
        seeded = seed_funds()
        print(f"funds table was empty; seeded {seeded} curated funds.")


def main() -> int:
    _ensure_utf8_stdout()

    ap = argparse.ArgumentParser(prog="sidecar.backfill")
    sub = ap.add_subparsers(dest="signal", required=True)

    form4 = sub.add_parser("form4", help="Backfill Form 4 (insider trades)")
    g = form4.add_mutually_exclusive_group()
    g.add_argument("--years", type=int, help="Backfill last N years (default: 5 if neither --years nor --days given)")
    g.add_argument("--days", type=int, help="Backfill last N days (use for short verification windows)")
    form4.add_argument("--chunk-days", type=int, default=7)
    form4.add_argument("--no-resume", action="store_true", help="Disable auto-resume from MAX(filed_at)")

    f13 = sub.add_parser("13f", help="Backfill 13F (fund holdings)")
    f13.add_argument("--quarters", type=int, default=20)

    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")

    # EDGAR's "today" warning crashes the rich library print; clamp end to yesterday.
    end = date.today() - timedelta(days=1)

    if args.signal == "form4":
        if args.days is not None:
            start = end - timedelta(days=args.days)
        else:
            years = args.years if args.years is not None else 5
            start = end - timedelta(days=365 * years)
        from sidecar.backfill.form4 import backfill_form4
        r = backfill_form4(start, end, chunk_days=args.chunk_days, resume=not args.no_resume)
        print(f"Form 4 backfill: chunks={r['chunks']} inserted={r['inserted']} skipped={r['skipped']} errors={r['errors']}")
        return 0 if r["errors"] < 100 else 1
    elif args.signal == "13f":
        _ensure_funds_seeded()
        from sidecar.backfill.thirteen_f import backfill_13f
        r = backfill_13f(quarters_back=args.quarters)
        print(f"13F backfill: funds={r['funds']} filings={r['filings']} holdings={r['holdings']} errors={r['errors']} delta_updates={r.get('delta_updates', 0)}")
        return 0 if r["errors"] < 10 else 1
    return 2


if __name__ == "__main__":
    sys.exit(main())
