"""Smoke test: report.py produces a valid HTML file with expected sections."""
from __future__ import annotations
from pathlib import Path

from sidecar.backtest.report import render_report


def test_render_report_writes_html_with_expected_sections(tmp_path):
    out_dir = tmp_path / "out"
    out_dir.mkdir()
    report_path = render_report(
        out_dir=out_dir,
        run={'from_date': '2024-01-01', 'to_date': '2024-12-31', 'scoring_git_sha': 'abc1234',
             'n_assets': 100, 'n_dates': 252},
        horizons=[1, 5, 21],
        composite_ic={
            1: {'mean': 0.02, 't_stat': 2.5, 'n': 252, 'hit_rate': 0.55, 'std': 0.1, 'ir': 0.2},
            5: {'mean': 0.03, 't_stat': 3.2, 'n': 252, 'hit_rate': 0.58, 'std': 0.1, 'ir': 0.3},
            21: {'mean': 0.01, 't_stat': 0.8, 'n': 252, 'hit_rate': 0.51, 'std': 0.1, 'ir': 0.1},
        },
        per_signal=[
            {'kind': 'volume', 'n_obs': 1500, 'date_range': ('2024-01-01', '2024-12-31'),
             'ic': {1: {'mean': 0.04, 't_stat': 3.5, 'hit_rate': 0.6, 'std': 0.12, 'n': 252, 'ir': 0.3},
                    5: {'mean': 0.02, 't_stat': 1.8, 'hit_rate': 0.52, 'std': 0.10, 'n': 252, 'ir': 0.2},
                    21: {'mean': 0.01, 't_stat': 0.5, 'hit_rate': 0.50, 'std': 0.10, 'n': 252, 'ir': 0.1}}},
        ],
        event_study_kinds={'halts', 'insider'},
    )
    assert report_path.exists()
    html = report_path.read_text(encoding='utf-8')
    assert '<title>Discovery Backtest Report' in html
    assert 'Headline composite' in html
    assert 'abc1234' in html
    assert 'Volume' in html
