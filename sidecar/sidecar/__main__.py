"""Sidecar entrypoint: python -m sidecar"""
from __future__ import annotations
import logging
import sys
from sidecar.db import get_session
from sidecar.models import SchemaVersion
from sidecar.scheduler import build_scheduler

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(name)s] %(message)s")
logger = logging.getLogger("sidecar")


def main() -> int:
    with get_session() as session:
        version = session.query(SchemaVersion).order_by(SchemaVersion.version.desc()).first()
        if version is None:
            logger.error("Schema not applied. Run `npm run db:init` first.")
            return 1
        logger.info("Connected to shared DB. Schema version: %d", version.version)

    scheduler = build_scheduler()
    if not scheduler.get_jobs():
        logger.info("No jobs registered yet (Plan 2 will add them). Exiting cleanly.")
        return 0

    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        logger.info("Shutting down")
    return 0


if __name__ == "__main__":
    sys.exit(main())
