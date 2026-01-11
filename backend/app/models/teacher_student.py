import enum
from datetime import datetime

from sqlalchemy import ForeignKey, String, UniqueConstraint, Index, DateTime
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class TeacherStudentStatus(str, enum.Enum):
    pending = "pending"
    confirmed = "confirmed"


class TeacherStudentRequestedBy(str, enum.Enum):
    teacher = "teacher"
    student = "student"


class TeacherStudent(Base):
    __tablename__ = "teacher_students"

    id: Mapped[int] = mapped_column(primary_key=True)

    teacher_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    student_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    status: Mapped[TeacherStudentStatus] = mapped_column(String(20), index=True, default=TeacherStudentStatus.pending)
    requested_by: Mapped[TeacherStudentRequestedBy] = mapped_column(
        String(20),
        index=True,
        default=TeacherStudentRequestedBy.teacher,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("teacher_id", "student_id", name="uq_teacher_student"),
        Index("ix_teacher_students_teacher_status", "teacher_id", "status"),
    )
