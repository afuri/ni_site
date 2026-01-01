import enum
from datetime import datetime, timezone

from sqlalchemy import String, Text, DateTime, Enum as SAEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Subject(str, enum.Enum):
    math = "math"
    cs = "cs"


class TaskType(str, enum.Enum):
    single_choice = "single_choice"
    multi_choice = "multi_choice"
    short_text = "short_text"


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)

    subject: Mapped[Subject] = mapped_column(SAEnum(Subject), index=True)
    title: Mapped[str] = mapped_column(String(255))
    content: Mapped[str] = mapped_column(Text)  # условие/текст задания (можно markdown/plain)
    task_type: Mapped[TaskType] = mapped_column(SAEnum(TaskType), index=True)

    # MVP: ссылка/ключ картинки
    image_key: Mapped[str | None] = mapped_column(String(2048), nullable=True)

    # Структура зависит от task_type (см. ниже)
    payload: Mapped[dict] = mapped_column(JSONB)

    created_by_user_id: Mapped[int] = mapped_column(index=True)  # admin id (FK можно добавить позже)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
