"""User schemas."""
from pydantic import BaseModel, EmailStr, Field, ConfigDict
from typing import Optional
from app.models.user import UserRole


LOGIN_RE = r"^[A-Za-z][A-Za-z0-9]{4,}$"
CYRILLIC_RE = r"^[А-ЯЁ][а-яё]+$"


class UserRead(BaseModel):
    id: int
    login: str
    email: EmailStr
    role: UserRole
    is_active: bool
    is_email_verified: bool
    must_change_password: bool
    is_moderator: bool
    moderator_requested: bool

    surname: Optional[str] = None
    name: Optional[str] = None
    father_name: Optional[str] = None
    country: Optional[str] = None
    city: Optional[str] = None
    school: Optional[str] = None
    class_grade: Optional[int] = None

    subject: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class UserUpdate(BaseModel):
    surname: Optional[str] = Field(default=None, max_length=120, pattern=CYRILLIC_RE)
    name: Optional[str] = Field(default=None, max_length=120, pattern=CYRILLIC_RE)
    father_name: Optional[str] = Field(default=None, max_length=120, pattern=CYRILLIC_RE)

    country: Optional[str] = Field(default=None, max_length=120, pattern=CYRILLIC_RE)
    city: Optional[str] = Field(default=None, max_length=120, pattern=CYRILLIC_RE)
    school: Optional[str] = None
    class_grade: Optional[int] = Field(default=None)

    subject: Optional[str] = Field(default=None, max_length=120)


class ModeratorRequestResponse(BaseModel):
    status: str


class ModeratorStatusUpdate(BaseModel):
    is_moderator: bool


class AdminUserUpdate(BaseModel):
    login: Optional[str] = Field(default=None, pattern=LOGIN_RE)
    role: Optional[UserRole] = None
    is_active: Optional[bool] = None
    is_email_verified: Optional[bool] = None
    must_change_password: Optional[bool] = None
    is_moderator: Optional[bool] = None
    moderator_requested: Optional[bool] = None

    surname: Optional[str] = Field(default=None, max_length=120, pattern=CYRILLIC_RE)
    name: Optional[str] = Field(default=None, max_length=120, pattern=CYRILLIC_RE)
    father_name: Optional[str] = Field(default=None, max_length=120, pattern=CYRILLIC_RE)

    country: Optional[str] = Field(default=None, max_length=120, pattern=CYRILLIC_RE)
    city: Optional[str] = Field(default=None, max_length=120, pattern=CYRILLIC_RE)
    school: Optional[str] = None
    class_grade: Optional[int] = Field(default=None)

    subject: Optional[str] = Field(default=None, max_length=120)

    model_config = ConfigDict(extra="forbid")


class AdminTempPasswordRequest(BaseModel):
    temp_password: str = Field(min_length=8, max_length=128)

    model_config = ConfigDict(extra="forbid")


class AdminTempPasswordGenerated(BaseModel):
    temp_password: str
