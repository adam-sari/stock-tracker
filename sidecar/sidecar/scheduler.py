"""APScheduler entrypoint with Form 4 and 13F jobs wired."""
from __future__ import annotations
import logging
from apscheduler.schedulers.blocking import BlockingScheduler
from sidecar.jobs.scan_form4 import scan_form4
from sidecar.jobs.scan_13f import scan_13f

logger = logging.getLogger(__name__)


def build_scheduler() -> BlockingScheduler:
    scheduler = BlockingScheduler(timezone="UTC")
    # Daily Form 4 scan at 22:00 UTC (after US market close)
    scheduler.add_job(scan_form4, "cron", hour=22, id="scan_form4")
    # Weekly 13F sweep Sunday 04:00 UTC
    scheduler.add_job(scan_13f, "cron", day_of_week="sun", hour=4, id="scan_13f")
    return scheduler
