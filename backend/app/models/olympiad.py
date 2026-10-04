from datetime import datetime, timezone
from sqlalchemy import CheckConstraint, ForeignKey, String, Boolean, Integer, DateTime, Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base

import enum


class OlympiadScope(str, enum.Enum):
    global_ = "global"  # global — зарезервировано словом в python, поэтому global_

enum_values = lambda obj: [e.value for e in obj]


class Olympiad(Base):
    __tablename__ = "olympiads"
    __table_args__ = (
        CheckConstraint("duration_sec > 0", name="ck_olympiads_duration"),
        CheckConstraint("available_to > available_from", name="ck_olympiads_window"),
        CheckConstraint("pass_percent BETWEEN 0 AND 100", name="ck_olympiads_pass_percent"),
        CheckConstraint("attempts_limit = 1", name="ck_olympiads_attempt_limit"),
        CheckConstraint("participant_pdf_key IS NULL OR is_standalone", name="ck_olympiads_participant_pdf_standalone"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    title: Mapped[str] = mapped_column(String(255), index=True)
    description: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    is_standalone: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    participant_pdf_key: Mapped[str | None] = mapped_column(String(512), nullable=True)

    @property
    def has_participant_pdf(self) -> bool:
        return bool(self.is_standalone and self.participant_pdf_key)

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
    results_released: Mapped[bool] = mapped_column(Boolean, default=False)

    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    rules_locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", name="olympiads_created_by_user_id_fkey", ondelete="RESTRICT"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
