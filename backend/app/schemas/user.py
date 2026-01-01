"""User schemas."""
from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from app.models.user import UserRole


class UserRead(BaseModel):
    id: int
    login: str
    email: Optional[EmailStr] = None
    role: UserRole
    is_active: bool

    surname: Optional[str] = None
    name: Optional[str] = None
    father_name: Optional[str] = None
    city: Optional[str] = None
    school: Optional[str] = None
    class_grade: Optional[int] = None

    subject: Optional[str] = None

    teacher_math: Optional[str] = None
    teacher_cs: Optional[str] = None
    teacher_math_link: Optional[str] = None
    teacher_cs_link: Optional[str] = None

    class Config:
        from_attributes = True


class UserUpdate(BaseModel):
    surname: Optional[str] = Field(default=None, max_length=120)
    name: Optional[str] = Field(default=None, max_length=120)
    father_name: Optional[str] = Field(default=None, max_length=120)

    city: Optional[str] = Field(default=None, max_length=120)
    school: Optional[str] = Field(default=None, max_length=255)
    class_grade: Optional[int] = Field(default=None, ge=1, le=11)

    subject: Optional[str] = Field(default=None, pattern="^(math|cs|both)$")

    teacher_math: Optional[str] = Field(default=None, max_length=255)
    teacher_cs: Optional[str] = Field(default=None, max_length=255)
    teacher_math_link: Optional[str] = Field(default=None, max_length=2048)
    teacher_cs_link: Optional[str] = Field(default=None, max_length=2048)
