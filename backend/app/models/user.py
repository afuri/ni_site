"""User model."""
import enum
from datetime import datetime
from sqlalchemy import String, Boolean, Enum, Integer, DateTime
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class UserRole(str, enum.Enum):
    student = "student"
    teacher = "teacher"
    admin = "admin"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)

    # auth
    login: Mapped[str] = mapped_column(String(64), unique=True, index=True)  # NEW
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_email_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False)
    temp_password_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_moderator: Mapped[bool] = mapped_column(Boolean, default=False)
    moderator_requested: Mapped[bool] = mapped_column(Boolean, default=False)

    # profile (общие)
    surname: Mapped[str | None] = mapped_column(String(120), nullable=True)
    name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    father_name: Mapped[str | None] = mapped_column(String(120), nullable=True)

    country: Mapped[str | None] = mapped_column(String(120), nullable=True)
    city: Mapped[str | None] = mapped_column(String(120), nullable=True)
    school: Mapped[str | None] = mapped_column(String(255), nullable=True)
    class_grade: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 0..11

    # teacher-only (MVP)
    subject: Mapped[str | None] = mapped_column(String(120), nullable=True)
