"""Tests for sidecar/sidecar/scheduler.py — build_scheduler()."""
from __future__ import annotations
from unittest.mock import patch, MagicMock
import pytest


def test_build_scheduler_returns_blocking_scheduler():
    """build_scheduler() returns an APScheduler BlockingScheduler instance."""
    fake_scan_form4 = MagicMock()
    fake_scan_13f = MagicMock()

    with (
        patch("sidecar.jobs.scan_form4.scan_form4", fake_scan_form4),
        patch("sidecar.jobs.scan_13f.scan_13f", fake_scan_13f),
    ):
        from sidecar.scheduler import build_scheduler
        scheduler = build_scheduler()

    from apscheduler.schedulers.blocking import BlockingScheduler
    assert isinstance(scheduler, BlockingScheduler)


def test_build_scheduler_has_exactly_two_jobs():
    """build_scheduler() registers exactly 2 jobs: scan_form4 and scan_13f."""
    with (
        patch("sidecar.jobs.scan_form4.scan_form4", MagicMock()),
        patch("sidecar.jobs.scan_13f.scan_13f", MagicMock()),
    ):
        from sidecar.scheduler import build_scheduler
        scheduler = build_scheduler()

    jobs = scheduler.get_jobs()
    assert len(jobs) == 2


def test_build_scheduler_job_ids():
    """The two jobs have IDs 'scan_form4' and 'scan_13f'."""
    with (
        patch("sidecar.jobs.scan_form4.scan_form4", MagicMock()),
        patch("sidecar.jobs.scan_13f.scan_13f", MagicMock()),
    ):
        from sidecar.scheduler import build_scheduler
        scheduler = build_scheduler()

    job_ids = {job.id for job in scheduler.get_jobs()}
    assert job_ids == {"scan_form4", "scan_13f"}


def test_build_scheduler_form4_cron_hour():
    """scan_form4 job runs at hour=22."""
    with (
        patch("sidecar.jobs.scan_form4.scan_form4", MagicMock()),
        patch("sidecar.jobs.scan_13f.scan_13f", MagicMock()),
    ):
        from sidecar.scheduler import build_scheduler
        scheduler = build_scheduler()

    form4_job = next(j for j in scheduler.get_jobs() if j.id == "scan_form4")
    # APScheduler CronTrigger stores fields; check the hour field
    trigger_fields = {f.name: str(f) for f in form4_job.trigger.fields}
    assert trigger_fields["hour"] == "22"


def test_build_scheduler_13f_cron_day_of_week():
    """scan_13f job runs on Sunday (day_of_week=sun)."""
    with (
        patch("sidecar.jobs.scan_form4.scan_form4", MagicMock()),
        patch("sidecar.jobs.scan_13f.scan_13f", MagicMock()),
    ):
        from sidecar.scheduler import build_scheduler
        scheduler = build_scheduler()

    scan_13f_job = next(j for j in scheduler.get_jobs() if j.id == "scan_13f")
    trigger_fields = {f.name: str(f) for f in scan_13f_job.trigger.fields}
    # APScheduler uses 6 or 'sun' for Sunday in day_of_week
    assert trigger_fields["day_of_week"] in ("6", "sun", "0")
