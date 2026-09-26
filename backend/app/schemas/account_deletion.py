from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field


class DeletionConfirmation(BaseModel):
    confirmed: Literal[True]
    model_config = ConfigDict(extra="forbid")


class AdminDeletionConfirmation(DeletionConfirmation):
    expected_login: str = Field(min_length=1, max_length=64)
    request_id: int | None = Field(default=None, gt=0)


class DeletionRequestRead(BaseModel):
    id: int
    user_id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class AdminDeletionRequestRead(DeletionRequestRead):
    login: str


class DeletionPreview(BaseModel):
    user_id: int
    login: str
    email: str
    full_name: str
    role: str
    attempts: int
    links: int


class DeletionResult(BaseModel):
    user_id: int
    files_pending: bool
