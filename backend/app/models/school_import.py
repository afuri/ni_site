"""Audit records and source-ID map for school directory imports."""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SchoolImportBatch(Base):
    __tablename__ = "school_import_batches"

    id: Mapped[int] = mapped_column(primary_key=True)
    batch_id: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    schools_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    users_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    stats: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    applied_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())


class SchoolSourceMap(Base):
    __tablename__ = "school_source_map"
    __table_args__ = (
        UniqueConstraint("batch_id", "source_school_id", name="uq_school_source_map_batch_source"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    batch_id: Mapped[str] = mapped_column(
        ForeignKey("school_import_batches.batch_id", ondelete="CASCADE"), nullable=False, index=True
    )
    source_school_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    school_id: Mapped[int] = mapped_column(ForeignKey("schools.id", ondelete="RESTRICT"), nullable=False, index=True)
