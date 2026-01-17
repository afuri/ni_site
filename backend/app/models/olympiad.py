from datetime import datetime, timezone
from sqlalchemy import String, Boolean, Integer, DateTime, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base

import enum


class OlympiadScope(str, enum.Enum):
    global_ = "global"  # global — зарезервировано словом в python, поэтому global_

enum_values = lambda obj: [e.value for e in obj]


class Olympiad(Base):
    __tablename__ = "olympiads"

    id: Mapped[int] = mapped_column(primary_key=True)

    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(String(2000), nullable=True)

    scope: Mapped[OlympiadScope] = mapped_column(
        SAEnum(OlympiadScope, values_callable=enum_values, name="olympiadscope"),
        index=True,
        default=OlympiadScope.global_,
    )
    age_group: Mapped[str] = mapped_column(String(32), index=True)

    attempts_limit: Mapped[int] = mapped_column(Integer, default=1)
    duration_sec: Mapped[int] = mapped_column(Integer)

    available_from: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    available_to: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    pass_percent: Mapped[int] = mapped_column(Integer, default=60)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    results_released: Mapped[bool] = mapped_column(Boolean, default=False, index=True)

    created_by_user_id: Mapped[int] = mapped_column(Integer, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
