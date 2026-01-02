from typing import Optional, Literal
from pydantic import BaseModel, Field, EmailStr, model_validator


LOGIN_RE = r"^[A-Za-z][A-Za-z0-9]{4,}$"
CYRILLIC_RE = r"^[А-ЯЁ][а-яё]+$"


class RegisterRequest(BaseModel):
    login: str = Field(pattern=LOGIN_RE)
    password: str = Field(min_length=8, max_length=128)
    role: Literal["student", "teacher"]
    email: EmailStr

    surname: str = Field(max_length=120, pattern=CYRILLIC_RE)
    name: str = Field(max_length=120, pattern=CYRILLIC_RE)
    father_name: Optional[str] = Field(default=None, max_length=120, pattern=CYRILLIC_RE)

    country: str = Field(max_length=120, pattern=CYRILLIC_RE)
    city: str = Field(max_length=120, pattern=CYRILLIC_RE)
    school: str = Field(max_length=255, pattern=CYRILLIC_RE)

    class_grade: Optional[int] = Field(default=None, ge=0, le=11)
    subject: Optional[str] = Field(default=None, max_length=120, pattern=CYRILLIC_RE)

    @model_validator(mode="after")
    def validate_role_fields(self):
        if self.role == "student":
            if self.class_grade is None:
                raise ValueError("class_grade_required")
            if self.subject is not None:
                raise ValueError("subject_not_allowed_for_student")
        if self.role == "teacher":
            if self.subject is None:
                raise ValueError("subject_required")
            if self.class_grade is not None:
                raise ValueError("class_grade_not_allowed_for_teacher")
        return self


class LoginRequest(BaseModel):
    login: str = Field(pattern=LOGIN_RE)
    password: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
