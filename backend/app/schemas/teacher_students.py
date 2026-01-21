from datetime import datetime
import re
from pydantic import BaseModel, Field, EmailStr, ConfigDict, field_validator, TypeAdapter

from app.models.teacher_student import TeacherStudentStatus, TeacherStudentRequestedBy
from app.core import error_codes as codes


LOGIN_RE = r"^[A-Za-z][A-Za-z0-9]{4,}$"
CYRILLIC_RE = r"^[А-ЯЁ][А-ЯЁа-яё -]+$"
FATHER_NAME_RE = r"^[А-ЯЁ][А-ЯЁа-яё-]*(?: [А-ЯЁ][А-ЯЁа-яё-]*)*$"
GENDER_RE = r"^(male|female)$"
EMAIL_ADAPTER = TypeAdapter(EmailStr)


def _normalize_login_or_email(value: str) -> str:
    candidate = value.strip()
    if not candidate:
        raise ValueError(codes.VALIDATION_ERROR)
    if "@" in candidate:
        try:
            EMAIL_ADAPTER.validate_python(candidate)
        except Exception:
            raise ValueError(codes.VALIDATION_ERROR)
        return candidate.lower()
    if not re.match(LOGIN_RE, candidate):
        raise ValueError(codes.VALIDATION_ERROR)
    return candidate.lower()


class CreateStudentRequest(BaseModel):
    login: str = Field(pattern=LOGIN_RE)
    password: str = Field(min_length=8, max_length=128)
    email: EmailStr
    gender: str = Field(pattern=GENDER_RE)
    subscription: int = Field(default=0, ge=0, le=5)

    surname: str = Field(max_length=120, pattern=CYRILLIC_RE)
    name: str = Field(max_length=120, pattern=CYRILLIC_RE)
    father_name: str | None = Field(default=None, max_length=120, pattern=FATHER_NAME_RE)

    country: str = Field(max_length=120, pattern=CYRILLIC_RE)
    city: str = Field(max_length=120, pattern=CYRILLIC_RE)
    school: str = Field(max_length=255)
    class_grade: int

    @field_validator("login", mode="before")
    @classmethod
    def normalize_login(cls, value: str) -> str:
        if isinstance(value, str):
            return value.strip().lower()
        return value

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        if isinstance(value, str):
            return value.strip().lower()
        return value


class AttachStudentRequest(BaseModel):
    student_login: str

    @field_validator("student_login")
    @classmethod
    def validate_student_login(cls, value: str) -> str:
        return _normalize_login_or_email(value)


class TeacherStudentCreateRequest(BaseModel):
    create: CreateStudentRequest | None = None
    attach: AttachStudentRequest | None = None


class AttachTeacherRequest(BaseModel):
    teacher_login: str = Field(min_length=1)

    @field_validator("teacher_login")
    @classmethod
    def validate_teacher_login(cls, value: str) -> str:
        return _normalize_login_or_email(value)


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
