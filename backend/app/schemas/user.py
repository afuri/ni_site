"""User schemas."""
from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from app.models.user import UserRole


CYRILLIC_RE = r"^[А-ЯЁ][а-яё]+$"


class UserRead(BaseModel):
    id: int
    login: str
    email: EmailStr
    role: UserRole
    is_active: bool
    is_email_verified: bool

    surname: Optional[str] = None
    name: Optional[str] = None
    father_name: Optional[str] = None
    country: Optional[str] = None
    city: Optional[str] = None
    school: Optional[str] = None
    class_grade: Optional[int] = None

    subject: Optional[str] = None

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    surname: Optional[str] = Field(default=None, max_length=120, pattern=CYRILLIC_RE)
    name: Optional[str] = Field(default=None, max_length=120, pattern=CYRILLIC_RE)
    father_name: Optional[str] = Field(default=None, max_length=120, pattern=CYRILLIC_RE)

    country: Optional[str] = Field(default=None, max_length=120, pattern=CYRILLIC_RE)
    city: Optional[str] = Field(default=None, max_length=120, pattern=CYRILLIC_RE)
    school: Optional[str] = Field(default=None, max_length=255, pattern=CYRILLIC_RE)
    class_grade: Optional[int] = Field(default=None, ge=0, le=11)

    subject: Optional[str] = Field(default=None, max_length=120, pattern=CYRILLIC_RE)
