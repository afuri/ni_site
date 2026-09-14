"""User model."""
import enum
from datetime import datetime
from sqlalchemy import BigInteger, Boolean, CheckConstraint, DateTime, Enum, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class UserRole(str, enum.Enum):
    student = "student"
    teacher = "teacher"
    admin = "admin"


class Gender(str, enum.Enum):
    male = "male"
    female = "female"


class SchoolStatus(str, enum.Enum):
    selected = "selected"
    missing = "missing"
    submission_pending = "submission_pending"
    submission_rejected = "submission_rejected"
    not_required = "not_required"


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("coins >= 0", name="ck_users_coins_nonnegative"),
        CheckConstraint(
            "(school_status = 'selected' AND school_id IS NOT NULL) OR "
            "(school_status IN ('missing', 'submission_pending', 'submission_rejected', 'not_required') "
            "AND school_id IS NULL)",
            name="ck_users_school_status_consistency",
        ),
    )

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

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # profile (общие)
    surname: Mapped[str | None] = mapped_column(String(120), nullable=True)
    name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    father_name: Mapped[str | None] = mapped_column(String(120), nullable=True)

    country: Mapped[str | None] = mapped_column(String(120), nullable=True)
    city: Mapped[str | None] = mapped_column(String(120), nullable=True)
    school: Mapped[str | None] = mapped_column(String(255), nullable=True)
    region_id: Mapped[int | None] = mapped_column(ForeignKey("regions.id", ondelete="RESTRICT"), nullable=True, index=True)
    school_id: Mapped[int | None] = mapped_column(
        ForeignKey(
            "schools.id",
            name="fk_users_school_id",
            ondelete="RESTRICT",
            use_alter=True,
        ),
        nullable=True,
        index=True,
    )
    school_status: Mapped[SchoolStatus] = mapped_column(
        Enum(SchoolStatus, name="school_status_enum"),
        nullable=False,
        default=SchoolStatus.missing,
        server_default="missing",
        index=True,
    )
    coins: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0, server_default="0")
    class_grade: Mapped[int | None] = mapped_column(Integer, nullable=True)  # 0..11
    gender: Mapped[Gender | None] = mapped_column(Enum(Gender), nullable=True)
    subscription: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    manual_teachers: Mapped[list[dict]] = mapped_column(JSONB, default=list)

    # teacher-only (MVP)
    subject: Mapped[str | None] = mapped_column(String(120), nullable=True)

    region_record = relationship("Region", foreign_keys=[region_id], lazy="joined")
    school_record = relationship("School", foreign_keys=[school_id], lazy="joined")

    @property
    def region_name(self) -> str | None:
        return self.region_record.name if self.region_record else None

    @property
    def school_short_name(self) -> str | None:
        return self.school_record.short_name if self.school_record else None

    @property
    def school_full_name(self) -> str | None:
        return self.school_record.full_name if self.school_record else None

    @property
    def city_name(self) -> str | None:
        return self.school_record.city.name if self.school_record and self.school_record.city else None
