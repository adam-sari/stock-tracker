"""SQLAlchemy 2.0 ORM models reflecting the Node-authored schema.

Plan 1 reflects only foundation tables. Plan 2 extends with insider_txns,
fund_holdings, and other ingestion targets.
"""
from __future__ import annotations
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class JobRun(Base):
    __tablename__ = "job_runs"
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    job: Mapped[str]
    started_at: Mapped[int]
    finished_at: Mapped[int | None] = mapped_column(nullable=True)
    status: Mapped[str]
    detail: Mapped[str | None] = mapped_column(nullable=True)


class SchemaVersion(Base):
    __tablename__ = "schema_version"
    version: Mapped[int] = mapped_column(primary_key=True)
    applied_at: Mapped[str | None] = mapped_column(nullable=True)
