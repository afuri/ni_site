"""Olympiad schemas."""
from pydantic import BaseModel, Field
from typing import List


class OlympiadCreate(BaseModel):
    title: str = Field(min_length=3, max_length=255)
    description: str = Field(default="", max_length=10_000)
    duration_sec: int = Field(ge=60, le=6 * 60 * 60)  # 1 мин - 6 часов


class OlympiadRead(BaseModel):
    id: int
    title: str
    description: str
    duration_sec: int
    is_published: bool
    created_by_user_id: int

    class Config:
        from_attributes = True


class TaskCreate(BaseModel):
    prompt: str = Field(min_length=1, max_length=50_000)
    answer_max_len: int = Field(default=20, ge=1, le=200)
    sort_order: int = Field(default=0, ge=0, le=10_000)


class TaskRead(BaseModel):
    id: int
    olympiad_id: int
    prompt: str
    answer_max_len: int
    sort_order: int

    class Config:
        from_attributes = True


class OlympiadWithTasks(BaseModel):
    olympiad: OlympiadRead
    tasks: List[TaskRead]
