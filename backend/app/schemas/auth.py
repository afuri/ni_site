from pydantic import BaseModel, Field, EmailStr
from typing import Optional


LOGIN_RE = r"^[A-Za-z][A-Za-z0-9]{4,}$"


class RegisterRequest(BaseModel):
    login: str = Field(pattern=LOGIN_RE)
    password: str = Field(min_length=8, max_length=128)
    role: str = Field(pattern="^(student|teacher|parent|admin)$")
    email: Optional[EmailStr] = None


class LoginRequest(BaseModel):
    login: str = Field(pattern=LOGIN_RE)
    password: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
