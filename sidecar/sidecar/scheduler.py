"""APScheduler entrypoint.

Plan 2 wires actual jobs (scan_form4, scan_13f). Plan 1 just proves the
process boots and can talk to the shared DB.
"""
from __future__ import annotations
import logging
from apscheduler.schedulers.blocking import BlockingScheduler

logger = logging.getLogger(__name__)


def build_scheduler() -> BlockingScheduler:
    scheduler = BlockingScheduler(timezone="UTC")
    # Plan 2 adds jobs here:
    #   scheduler.add_job(scan_form4, "cron", hour=22, id="scan_form4")
    #   scheduler.add_job(scan_13f, "cron", day_of_week="sun", hour=4, id="scan_13f")
    return scheduler
