from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class AccountDeletionRequest(Base):
    __tablename__ = "account_deletion_requests"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AccountDeletionCleanup(Base):
    """Durable outbox, intentionally without FK to the deleted user."""
    __tablename__ = "account_deletion_cleanup"
    user_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    attempt_ids: Mapped[list[int]] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
