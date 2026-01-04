from datetime import datetime
from pydantic import BaseModel, Field, EmailStr, ConfigDict

from app.models.teacher_student import TeacherStudentStatus


LOGIN_RE = r"^[A-Za-z][A-Za-z0-9]{4,}$"
CYRILLIC_RE = r"^[А-ЯЁ][а-яё]+$"


class CreateStudentRequest(BaseModel):
    login: str = Field(pattern=LOGIN_RE)
    password: str = Field(min_length=8, max_length=128)
    email: EmailStr

    surname: str = Field(max_length=120, pattern=CYRILLIC_RE)
    name: str = Field(max_length=120, pattern=CYRILLIC_RE)
    father_name: str | None = Field(default=None, max_length=120, pattern=CYRILLIC_RE)

    country: str = Field(max_length=120, pattern=CYRILLIC_RE)
    city: str = Field(max_length=120, pattern=CYRILLIC_RE)
    school: str = Field(max_length=255)
    class_grade: int


class AttachStudentRequest(BaseModel):
    student_login: str = Field(pattern=LOGIN_RE)


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

    model_config = ConfigDict(from_attributes=True)
