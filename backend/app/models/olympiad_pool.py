from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class OlympiadPool(Base):
    __tablename__ = "olympiad_pools"

    id: Mapped[int] = mapped_column(primary_key=True)
    subject: Mapped[str] = mapped_column(String(32), index=True)
    grade_group: Mapped[str] = mapped_column(String(32), index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_by_user_id: Mapped[int] = mapped_column(Integer, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class OlympiadPoolItem(Base):
    __tablename__ = "olympiad_pool_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    pool_id: Mapped[int] = mapped_column(
        ForeignKey("olympiad_pools.id", ondelete="CASCADE"), index=True
    )
    olympiad_id: Mapped[int] = mapped_column(
        ForeignKey("olympiads.id", ondelete="CASCADE"), index=True
    )
    position: Mapped[int] = mapped_column(Integer)

    __table_args__ = (
        UniqueConstraint("pool_id", "olympiad_id", name="uq_olympiad_pool_item"),
        UniqueConstraint("pool_id", "position", name="uq_olympiad_pool_position"),
    )


class OlympiadAssignment(Base):
    __tablename__ = "olympiad_assignments"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    pool_id: Mapped[int] = mapped_column(
        ForeignKey("olympiad_pools.id", ondelete="CASCADE"), index=True
    )
    olympiad_id: Mapped[int] = mapped_column(
        ForeignKey("olympiads.id", ondelete="CASCADE"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        UniqueConstraint("user_id", "pool_id", name="uq_olympiad_assignment"),
    )
