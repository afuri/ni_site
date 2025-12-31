"""Olympiad model."""
from sqlalchemy import String, Text, Integer, Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.base import Base


class Olympiad(Base):
    __tablename__ = "olympiads"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(255), index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    duration_sec: Mapped[int] = mapped_column(Integer)  # время на попытку
    is_published: Mapped[bool] = mapped_column(Boolean, default=False)

    created_by_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))


class OlympiadTask(Base):
    __tablename__ = "olympiad_tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    olympiad_id: Mapped[int] = mapped_column(ForeignKey("olympiads.id", ondelete="CASCADE"), index=True)
    prompt: Mapped[str] = mapped_column(Text)
    answer_max_len: Mapped[int] = mapped_column(Integer, default=20)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
