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
        if version.version < 2:
            logger.error("Schema version %d is too old. Run `npm run db:init` to upgrade.", version.version)
            return 1
        logger.info("Connected to shared DB. Schema version: %d", version.version)

    # Seed curated fund roster
    from sidecar.seed_funds import seed_funds
    n = seed_funds()
    logger.info("Seeded %d curated funds", n)

    scheduler = build_scheduler()
    logger.info("Scheduler starting with %d jobs", len(scheduler.get_jobs()))
    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        logger.info("Shutting down")
    return 0


if __name__ == "__main__":
    sys.exit(main())
