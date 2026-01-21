import re
from typing import Optional, Literal
from pydantic import BaseModel, Field, EmailStr, model_validator, field_validator, TypeAdapter
from app.core import error_codes as codes

LOGIN_RE = r"^[A-Za-z][A-Za-z0-9]{4,}$"
CYRILLIC_RE = r"^[А-ЯЁ][А-ЯЁа-яё -]+$"
FATHER_NAME_RE = r"^[А-ЯЁ][А-ЯЁа-яё-]*(?: [А-ЯЁ][А-ЯЁа-яё-]*)*$"
EMAIL_ADAPTER = TypeAdapter(EmailStr)


class RegisterRequest(BaseModel):
    login: str = Field(pattern=LOGIN_RE)
    password: str = Field(min_length=8, max_length=128)
    role: Literal["student", "teacher"]
    email: EmailStr
    gender: Literal["male", "female"]
    subscription: int = Field(default=0, ge=0, le=5)

    surname: str = Field(max_length=120, pattern=CYRILLIC_RE)
    name: str = Field(max_length=120, pattern=CYRILLIC_RE)
    father_name: Optional[str] = Field(default=None, max_length=120, pattern=FATHER_NAME_RE)

    country: str = Field(max_length=120, pattern=CYRILLIC_RE)
    city: str = Field(max_length=120, pattern=CYRILLIC_RE)
    school: str | None = None

    class_grade: Optional[int] = None
    subject: Optional[str] = None

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

    @model_validator(mode="after")
    def validate_role_fields(self):
        if self.role == "student":
            if self.class_grade is None:
                raise ValueError(codes.CLASS_GRADE_REQUIRED)
            self.subject = None
        if self.role == "teacher":
            if self.class_grade is not None:
                raise ValueError(codes.CLASS_GRADE_NOT_ALLOWED_FOR_TEACHER)
        return self


class LoginRequest(BaseModel):
    login: str
    password: str

    @field_validator("login")
    @classmethod
    def validate_login_or_email(cls, value: str) -> str:
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


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    must_change_password: bool = False


class EmailVerificationRequest(BaseModel):
    email: EmailStr

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        if isinstance(value, str):
            return value.strip().lower()
        return value


class EmailVerificationConfirm(BaseModel):
    token: str = Field(min_length=10, max_length=512)


class PasswordResetRequest(BaseModel):
    email: EmailStr

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        if isinstance(value, str):
            return value.strip().lower()
        return value


class PasswordResetConfirm(BaseModel):
    token: str = Field(min_length=10, max_length=512)
    new_password: str = Field(min_length=6, max_length=128)


class PasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=6, max_length=128)


class MessageResponse(BaseModel):
    status: str = "ok"


class RefreshTokenRequest(BaseModel):
    refresh_token: str
