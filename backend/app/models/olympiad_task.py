from sqlalchemy import ForeignKey, Integer, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column
from app.db.base import Base

class OlympiadTask(Base):
    __tablename__ = "olympiad_tasks"

    id: Mapped[int] = mapped_column(primary_key=True)

    olympiad_id: Mapped[int] = mapped_column(ForeignKey("olympiads.id", ondelete="CASCADE"), index=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="RESTRICT"), index=True)

    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    max_score: Mapped[int] = mapped_column(Integer, default=1)

    __table_args__ = (
        UniqueConstraint("olympiad_id", "task_id", name="uq_olympiad_task"),
        Index("ix_olympiad_tasks_olympiad_sort", "olympiad_id", "sort_order"),
    )
