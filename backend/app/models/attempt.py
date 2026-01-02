"""Attempt model."""
import enum
from datetime import datetime
from sqlalchemy import ForeignKey, DateTime, Integer, Enum, UniqueConstraint, Boolean
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base


class AttemptStatus(str, enum.Enum):
    active = "active"
    submitted = "submitted"
    expired = "expired"


class Attempt(Base):
    __tablename__ = "attempts"

    id: Mapped[int] = mapped_column(primary_key=True)
    olympiad_id: Mapped[int] = mapped_column(ForeignKey("olympiads.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    deadline_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    duration_sec: Mapped[int] = mapped_column(Integer)

    status: Mapped[AttemptStatus] = mapped_column(Enum(AttemptStatus), default=AttemptStatus.active, index=True)

    score_total: Mapped[int] = mapped_column(Integer, default=0)
    score_max: Mapped[int] = mapped_column(Integer, default=0)
    passed: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    graded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("olympiad_id", "user_id", name="uq_attempt_user_olympiad"),
    )


class AttemptAnswer(Base):
    __tablename__ = "attempt_answers"

    id: Mapped[int] = mapped_column(primary_key=True)
    attempt_id: Mapped[int] = mapped_column(ForeignKey("attempts.id", ondelete="CASCADE"), index=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    answer_payload: Mapped[dict] = mapped_column(JSONB)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        UniqueConstraint("attempt_id", "task_id", name="uq_answer_attempt_task"),
    )


class AttemptTaskGrade(Base):
    __tablename__ = "attempt_task_grades"

    id: Mapped[int] = mapped_column(primary_key=True)
    attempt_id: Mapped[int] = mapped_column(ForeignKey("attempts.id", ondelete="CASCADE"), index=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)

    is_correct: Mapped[bool] = mapped_column(Boolean)
    score: Mapped[int] = mapped_column(Integer)
    max_score: Mapped[int] = mapped_column(Integer)
    graded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        UniqueConstraint("attempt_id", "task_id", name="uq_attempt_task_grade"),
    )
