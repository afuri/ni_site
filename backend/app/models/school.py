"""Canonical school directory model."""
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class School(Base):
    __tablename__ = "schools"
    __table_args__ = (
        Index("ix_school_directory_city_active", "city_id", "is_active"),
        Index("ix_school_directory_normalized_short", "normalized_short_name"),
        Index("ix_school_directory_normalized_full", "normalized_full_name"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    city_id: Mapped[int] = mapped_column(ForeignKey("cities.id", ondelete="RESTRICT"), nullable=False, index=True)
    full_name: Mapped[str] = mapped_column(String(512), nullable=False)
    short_name: Mapped[str] = mapped_column(String(255), nullable=False)
    normalized_full_name: Mapped[str] = mapped_column(String(512), nullable=False)
    normalized_short_name: Mapped[str] = mapped_column(String(255), nullable=False)
    address: Mapped[str] = mapped_column(String(512), nullable=False)
    url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_sirius: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    is_consortium: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    is_peterson: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    is_partner: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    is_platform: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    curator: Mapped[str | None] = mapped_column(String(255), nullable=True)
    info: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )
    updated_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    city = relationship("City", back_populates="schools", lazy="joined")
