"""User model."""
import enum
from sqlalchemy import String, Boolean, Enum, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class UserRole(str, enum.Enum):
    student = "student"
    teacher = "teacher"
    parent = "parent"
    admin = "admin"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)

    # auth
    login: Mapped[str] = mapped_column(String(64), unique=True, index=True)  # NEW
    email: Mapped[str | None] = mapped_column(String(255), unique=False, index=True, nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # profile (общие)
    surname: Mapped[str | None] = mapped_column(String(120), nullable=True)
    name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    father_name: Mapped[str | None] = mapped_column(String(120), nullable=True)

    city: Mapped[str | None] = mapped_column(String(120), nullable=True)
    school: Mapped[str | None] = mapped_column(String(255), nullable=True)
    class_grade: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 1..11

    # teacher-only (MVP)
    subject: Mapped[str | None] = mapped_column(String(20), nullable=True)  # "math" | "cs" | "both"

    # student-only (MVP)
    teacher_math: Mapped[str | None] = mapped_column(String(255), nullable=True)
    teacher_cs: Mapped[str | None] = mapped_column(String(255), nullable=True)
    teacher_math_link: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    teacher_cs_link: Mapped[str | None] = mapped_column(String(2048), nullable=True)

