"""Run the backtest analysis pipeline end-to-end and write a report."""
from __future__ import annotations
import argparse
import datetime as dt
import json
import logging
import math
from pathlib import Path
from typing import Any

from sidecar.backtest.loaders import load_backtest_scores, load_candles
from sidecar.backtest.returns import forward_returns, spy_excess
from sidecar.backtest.ic import rank_ic_by_date, ic_summary
from sidecar.backtest.event_study import compute_car
from sidecar.backtest.composite import composite_factor
from sidecar.backtest.report import render_report

logger = logging.getLogger(__name__)
HORIZONS = [1, 5, 21, 63]
EVENT_STUDY_KINDS = {"halts", "insider"}


def _sanitize_for_json(obj: Any) -> Any:
    """Replace NaN / ±Infinity floats with None so the result is strict-JSON.

    Python's json.dumps emits literal "NaN"/"Infinity"/"-Infinity" by default,
    which JS JSON.parse rejects — crashing the /backtest page at render time.
    """
    if isinstance(obj, dict):
        return {k: _sanitize_for_json(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize_for_json(v) for v in obj]
    if isinstance(obj, float) and not math.isfinite(obj):
        return None
    return obj

# project_root/out/backtest — independent of CWD so the report always lands
# in a predictable place whether you invoke from project root or from sidecar/.
PROJECT_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_OUT_ROOT = PROJECT_ROOT / "out" / "backtest"


def main() -> int:
    ap = argparse.ArgumentParser(prog="sidecar.backtest")
    ap.add_argument("--from", dest="from_date", required=True)
    ap.add_argument("--to", dest="to_date", required=True)
    ap.add_argument("--out", dest="out_root", default=str(DEFAULT_OUT_ROOT))
    args = ap.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")
    stamp = dt.datetime.utcnow().strftime("%Y%m%d-%H%M%S")
    out_dir = Path(args.out_root) / stamp
    out_dir.mkdir(parents=True, exist_ok=True)

    logger.info("Loading backtest_scores %s..%s", args.from_date, args.to_date)
    scores = load_backtest_scores(args.from_date, args.to_date)
    if scores.empty:
        logger.error("No backtest_scores in window — run scripts/replay-scores.ts first.")
        return 1

    logger.info("Loading candles")
    closes = load_candles(args.from_date, args.to_date)
    spy_present = "SPY" in closes.columns
    fr = forward_returns(closes, HORIZONS)
    if spy_present:
        fr = spy_excess(fr, forward_returns(closes[["SPY"]], HORIZONS))

    per_signal = []
    signal_factors = {}
    for kind, group in scores.groupby("signal_kind"):
        date_range = (str(group["date"].min().date()), str(group["date"].max().date()))
        n_obs = len(group)
        factor = group.set_index(["date", "ticker"])["score"]
        signal_factors[kind] = factor

        if kind in EVENT_STUDY_KINDS:
            events = group[["ticker", "date"]].rename(columns={"date": "event_date"})
            car = compute_car(closes, events, pre=5, post=21)
            per_signal.append({
                "kind": kind, "n_obs": n_obs, "date_range": date_range,
                "car": car.to_dict(orient="index"),
                "car_plot_b64": "",
            })
        else:
            ic_per_h = {}
            for h in HORIZONS:
                ic = rank_ic_by_date(factor, fr[h])
                ic_per_h[h] = ic_summary(ic, nw_lag=max(1, h))
            per_signal.append({
                "kind": kind, "n_obs": n_obs, "date_range": date_range, "ic": ic_per_h,
            })

    comp = composite_factor(signal_factors, partial_info_rescale=True)
    composite_ic = {}
    for h in HORIZONS:
        ic = rank_ic_by_date(comp, fr[h])
        composite_ic[h] = ic_summary(ic, nw_lag=max(1, h))

    run_meta = {
        "from_date": args.from_date,
        "to_date": args.to_date,
        "scoring_git_sha": _git_sha(),
        "n_assets": int(scores["ticker"].nunique()),
        "n_dates": int(scores["date"].nunique()),
    }

    summary = {"run": run_meta, "horizons": HORIZONS,
               "composite_ic": composite_ic, "per_signal": per_signal}
    (out_dir / "summary.json").write_text(
        json.dumps(_sanitize_for_json(summary), default=str, indent=2)
    )

    render_report(out_dir, run_meta, HORIZONS, composite_ic, per_signal, EVENT_STUDY_KINDS)
    logger.info("Report written to %s", out_dir / "report.html")
    return 0


def _git_sha() -> str:
    import subprocess
    try:
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"]).decode().strip()
    except Exception:
        return "unknown"
