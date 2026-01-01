"""Attempt schemas."""
from datetime import datetime
from pydantic import BaseModel, Field
from typing import List, Optional

from app.models.attempt import AttemptStatus


class AttemptStartRequest(BaseModel):
    olympiad_id: int


class AttemptRead(BaseModel):
    id: int
    olympiad_id: int
    user_id: int
    started_at: datetime
    deadline_at: datetime
    duration_sec: int
    status: AttemptStatus

    class Config:
        from_attributes = True


class AttemptAnswerUpsertRequest(BaseModel):
    task_id: int
    answer_text: str = Field(max_length=200)  # фактически ограничим по task.answer_max_len


class AttemptAnswerRead(BaseModel):
    task_id: int
    answer_text: str
    updated_at: datetime

    class Config:
        from_attributes = True


class AttemptTaskView(BaseModel):
    task_id: int
    prompt: str
    answer_max_len: int
    sort_order: int
    current_answer: Optional[AttemptAnswerRead] = None


class AttemptView(BaseModel):
    attempt: AttemptRead
    olympiad_title: str
    tasks: List[AttemptTaskView]


class SubmitResponse(BaseModel):
    status: AttemptStatus
