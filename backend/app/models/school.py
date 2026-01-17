"""School directory model."""
from sqlalchemy import String, UniqueConstraint, Index, CheckConstraint, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class School(Base):
    __tablename__ = "schools"
    __table_args__ = (
        UniqueConstraint("city", "name", name="uq_schools_city_name"),
        Index("ix_schools_city", "city"),
        CheckConstraint("consorcium IN (0, 1)", name="ck_schools_consorcium"),
        CheckConstraint("peterson IN (0, 1)", name="ck_schools_peterson"),
        CheckConstraint("sirius IN (0, 1)", name="ck_schools_sirius"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    city: Mapped[str] = mapped_column(String(120), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    full_school_name: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    consorcium: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    peterson: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sirius: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
