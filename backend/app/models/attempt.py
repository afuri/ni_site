"""Attempt model."""
import enum
from datetime import datetime
from sqlalchemy import ForeignKey, DateTime, Integer, Enum, Index, text, UniqueConstraint, CheckConstraint, Boolean
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
    # Null for historical submissions: their exact finish time was never stored.
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Historical rows stay NULL; only new/live attempts acquire revisions.
    answers_revision: Mapped[int | None] = mapped_column(Integer, nullable=True)

    __table_args__ = (
        UniqueConstraint("olympiad_id", "user_id", name="uq_attempt_user_olympiad"),
        Index("uq_attempt_one_active_user", "user_id", unique=True, postgresql_where=text("status = 'active'")),
        Index("ix_attempt_active_deadline", "deadline_at", postgresql_where=text("status = 'active'")),
        CheckConstraint("duration_sec > 0 AND deadline_at >= started_at", name="ck_attempts_time"),
        CheckConstraint("score_total >= 0 AND score_max >= 0 AND score_total <= score_max", name="ck_attempts_scores"),
        CheckConstraint("answers_revision IS NULL OR answers_revision >= 0", name="ck_attempts_answers_revision"),
    )


class AttemptAnswer(Base):
    __tablename__ = "attempt_answers"

    id: Mapped[int] = mapped_column(primary_key=True)
    attempt_id: Mapped[int] = mapped_column(ForeignKey("attempts.id", ondelete="CASCADE"), index=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="RESTRICT"), index=True)
    answer_payload: Mapped[dict] = mapped_column(JSONB)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        UniqueConstraint("attempt_id", "task_id", name="uq_answer_attempt_task"),
    )


class AttemptTaskGrade(Base):
    __tablename__ = "attempt_task_grades"

    id: Mapped[int] = mapped_column(primary_key=True)
    # The unique (attempt_id, task_id) index serves attempt reads.
    attempt_id: Mapped[int] = mapped_column(ForeignKey("attempts.id", ondelete="CASCADE"))
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="RESTRICT"))

    is_correct: Mapped[bool] = mapped_column(Boolean)
    score: Mapped[int] = mapped_column(Integer)
    max_score: Mapped[int] = mapped_column(Integer)
    graded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        UniqueConstraint("attempt_id", "task_id", name="uq_attempt_task_grade"),
        CheckConstraint("max_score > 0 AND score >= 0 AND score <= max_score", name="ck_attempt_task_grades_scores"),
    )
