"""Region directory model."""
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Index, String, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Region(Base):
    __tablename__ = "regions"
    __table_args__ = (
        Index(
            "uq_regions_country_normalized_name",
            "country_code",
            "normalized_name",
            unique=True,
            postgresql_where=text("is_other = false"),
        ),
        Index(
            "uq_regions_active_other",
            "is_other",
            unique=True,
            postgresql_where=text("is_other = true AND is_active = true"),
        ),
        Index("ix_regions_normalized_name", "normalized_name"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    country_code: Mapped[str | None] = mapped_column(String(2), nullable=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    normalized_name: Mapped[str] = mapped_column(String(120), nullable=False)
    is_other: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now()
    )

    cities = relationship("City", back_populates="region", lazy="raise")
