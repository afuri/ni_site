"""Temporary validator state; no permanent archive/task grouping."""
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class TaskUploadSession(Base):
    __tablename__ = "task_upload_sessions"
    __table_args__ = (
        CheckConstraint("status IN ('preparing', 'reviewing', 'completed', 'cancelled', 'failed')",
                        name="ck_task_upload_status"),
    )

    token: Mapped[str] = mapped_column(String(36), primary_key=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    archive_sha256: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(20))
    data: Mapped[dict] = mapped_column(JSONB)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
