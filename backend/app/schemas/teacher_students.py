from datetime import datetime
from pydantic import BaseModel, Field

from app.models.teacher_student import TeacherStudentStatus


class CreateStudentRequest(BaseModel):
    login: str = Field(min_length=5, max_length=64)
    password: str = Field(min_length=8, max_length=128)
    # опционально — базовые поля профиля
    surname: str | None = None
    name: str | None = None
    father_name: str | None = None
    city: str | None = None
    school: str | None = None
    class_grade: int | None = Field(default=None, ge=1, le=11)


class AttachStudentRequest(BaseModel):
    student_login: str = Field(min_length=5, max_length=64)


class TeacherStudentCreateRequest(BaseModel):
    create: CreateStudentRequest | None = None
    attach: AttachStudentRequest | None = None


class TeacherStudentRead(BaseModel):
    id: int
    teacher_id: int
    student_id: int
    status: TeacherStudentStatus
    created_at: datetime
    confirmed_at: datetime | None = None

    class Config:
        from_attributes = True
