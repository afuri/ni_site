from typing import Optional, Literal
from pydantic import BaseModel, Field, EmailStr, model_validator
from app.core import error_codes as codes

LOGIN_RE = r"^[A-Za-z][A-Za-z0-9]{4,}$"
CYRILLIC_RE = r"^[А-ЯЁ][А-ЯЁа-яё -]+$"
FATHER_NAME_RE = r"^[А-ЯЁ][А-ЯЁа-яё-]*(?: [А-ЯЁ][А-ЯЁа-яё-]*)*$"


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
    login: str = Field(pattern=LOGIN_RE)
    password: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    must_change_password: bool = False


class EmailVerificationRequest(BaseModel):
    email: EmailStr


class EmailVerificationConfirm(BaseModel):
    token: str = Field(min_length=10, max_length=512)


class PasswordResetRequest(BaseModel):
    email: EmailStr


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
