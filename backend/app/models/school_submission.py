"""User requests to resolve schools missing from the canonical directory."""
import enum
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Enum, ForeignKey, Index, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SchoolSubmissionStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class SchoolSubmission(Base):
    __tablename__ = "school_submissions"
    __table_args__ = (
        Index(
            "uq_school_submissions_pending_user",
            "user_id",
            unique=True,
            postgresql_where=text("status = 'pending'"),
        ),
        Index("ix_school_submissions_status_created", "status", "created_at"),
        CheckConstraint(
            "status <> 'approved' OR "
            "(resolved_school_id IS NOT NULL AND reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL)",
            name="ck_school_submissions_approved_resolution",
        ),
        CheckConstraint(
            "status <> 'rejected' OR "
            "(admin_comment IS NOT NULL AND reviewed_by_user_id IS NOT NULL AND reviewed_at IS NOT NULL)",
            name="ck_school_submissions_rejected_review",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    region_id: Mapped[int] = mapped_column(ForeignKey("regions.id", ondelete="RESTRICT"), nullable=False, index=True)
    country_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    region_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    city_name: Mapped[str] = mapped_column(String(120), nullable=False)
    school_short_name: Mapped[str] = mapped_column(String(255), nullable=False)
    school_full_name: Mapped[str | None] = mapped_column(String(512), nullable=True)
    address: Mapped[str | None] = mapped_column(String(512), nullable=True)
    url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[SchoolSubmissionStatus] = mapped_column(
        Enum(SchoolSubmissionStatus, name="school_submission_status_enum"),
        nullable=False,
        default=SchoolSubmissionStatus.pending,
        server_default="pending",
    )
    admin_comment: Mapped[str | None] = mapped_column(Text, nullable=True)
    resolved_school_id: Mapped[int | None] = mapped_column(ForeignKey("schools.id", ondelete="SET NULL"))
    reviewed_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
