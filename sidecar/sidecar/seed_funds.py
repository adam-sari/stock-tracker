"""Seed the `funds` table with the curated superinvestor roster.

Run idempotently at sidecar boot (called from __main__.py).
"""
from __future__ import annotations
from sqlalchemy import text
from sidecar.db import get_session

CURATED_FUNDS: list[tuple[str, str]] = [
    ("0001067983", "Berkshire Hathaway Inc"),
    ("0001037389", "Renaissance Technologies LLC"),
    ("0001423053", "Citadel Advisors LLC"),
    ("0001029160", "Soros Fund Management LLC"),
    ("0001336528", "Pershing Square Capital Management"),  # Ackman
    ("0001649339", "Scion Asset Management"),               # Burry
    ("0001061165", "Baupost Group LLC"),                    # Klarman
    ("0001540531", "Greenlight Capital Inc"),               # Einhorn
    ("0001345471", "Appaloosa LP"),                         # Tepper
    ("0001112520", "Tiger Global Management"),
    ("0001656456", "Pabrai Investment Funds"),              # Pabrai
    ("0001056903", "Third Point LLC"),                      # Loeb
    ("0001403256", "Coatue Management LLC"),
    ("0001167483", "Lone Pine Capital"),
    ("0001029160", "Soros Fund Management"),
]


def seed_funds() -> int:
    """Insert any missing curated funds; preserve existing rows."""
    inserted = 0
    with get_session() as session:
        for cik, name in CURATED_FUNDS:
            result = session.execute(
                text(
                    "INSERT INTO funds (cik, name, is_curated) VALUES (:cik, :name, 1) "
                    "ON CONFLICT(cik) DO UPDATE SET name=excluded.name, is_curated=1"
                ),
                {"cik": cik, "name": name},
            )
            inserted += result.rowcount
        session.commit()
    return inserted
