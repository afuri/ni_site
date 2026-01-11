from datetime import datetime
from pydantic import BaseModel, Field, EmailStr, ConfigDict

from app.models.teacher_student import TeacherStudentStatus, TeacherStudentRequestedBy


LOGIN_RE = r"^[A-Za-z][A-Za-z0-9]{4,}$"
CYRILLIC_RE = r"^[А-ЯЁ][а-яё]+$"


class CreateStudentRequest(BaseModel):
    login: str = Field(pattern=LOGIN_RE)
    password: str = Field(min_length=8, max_length=128)
    email: EmailStr

    surname: str = Field(max_length=120, pattern=CYRILLIC_RE)
    name: str = Field(max_length=120, pattern=CYRILLIC_RE)
    father_name: str | None = None

    country: str = Field(max_length=120, pattern=CYRILLIC_RE)
    city: str = Field(max_length=120, pattern=CYRILLIC_RE)
    school: str = Field(max_length=255)
    class_grade: int


class AttachStudentRequest(BaseModel):
    student_login: str = Field(pattern=LOGIN_RE)


class TeacherStudentCreateRequest(BaseModel):
    create: CreateStudentRequest | None = None
    attach: AttachStudentRequest | None = None


class AttachTeacherRequest(BaseModel):
    teacher_login: str = Field(min_length=1)


class StudentTeacherRequest(BaseModel):
    attach: AttachTeacherRequest


class TeacherStudentRead(BaseModel):
    id: int
    teacher_id: int
    student_id: int
    status: TeacherStudentStatus
    requested_by: TeacherStudentRequestedBy | None = None
    created_at: datetime
    confirmed_at: datetime | None = None
    teacher_surname: str | None = None
    teacher_name: str | None = None
    teacher_father_name: str | None = None
    teacher_subject: str | None = None
    student_surname: str | None = None
    student_name: str | None = None
    student_father_name: str | None = None
    student_class_grade: int | None = None

    model_config = ConfigDict(from_attributes=True)
