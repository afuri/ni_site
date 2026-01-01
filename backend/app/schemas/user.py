"""User schemas."""
from pydantic import BaseModel, EmailStr
from app.models.user import UserRole


class UserRead(BaseModel):
    id: int
    email: EmailStr
    role: UserRole
    is_active: bool

    class Config:
        from_attributes = True
