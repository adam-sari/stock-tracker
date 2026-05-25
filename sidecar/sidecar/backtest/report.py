"""Render the HTML backtest report from computed analytics."""
from __future__ import annotations
import datetime as dt
from pathlib import Path
from typing import Iterable

from jinja2 import Environment, FileSystemLoader, select_autoescape

TEMPLATE_DIR = Path(__file__).parent / "templates"


def _env() -> Environment:
    return Environment(
        loader=FileSystemLoader(str(TEMPLATE_DIR)),
        autoescape=select_autoescape(["html"]),
    )


def render_report(
    out_dir: Path,
    run: dict,
    horizons: Iterable[int],
    composite_ic: dict,
    per_signal: list[dict],
    event_study_kinds: set[str],
) -> Path:
    """Render report.html into out_dir. Returns the written path."""
    env = _env()
    template = env.get_template("report.html.j2")
    html = template.render(
        run=run,
        horizons=list(horizons),
        composite_ic=composite_ic,
        per_signal=per_signal,
        event_study_kinds=event_study_kinds,
        generated_at=dt.datetime.utcnow().isoformat(timespec='seconds') + 'Z',
    )
    out = Path(out_dir) / "report.html"
    out.write_text(html, encoding='utf-8')
    return out
