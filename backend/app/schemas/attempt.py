"""Attempt schemas."""
from datetime import datetime
from typing import Any, List, Optional
from pydantic import BaseModel, Field, ConfigDict
from app.models.task import TaskType

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
    score_total: int
    score_max: int
    passed: Optional[bool] = None
    graded_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class AttemptAnswerUpsertRequest(BaseModel):
    task_id: int
    answer_payload: dict[str, Any]


class AttemptAnswerRead(BaseModel):
    task_id: int
    answer_payload: dict[str, Any]
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AttemptTaskView(BaseModel):
    task_id: int
    title: str
    content: str
    task_type: TaskType
    image_key: Optional[str] = None
    payload: dict[str, Any]
    sort_order: int
    max_score: int
    current_answer: Optional[AttemptAnswerRead] = None


class AttemptView(BaseModel):
    attempt: AttemptRead
    olympiad_title: str
    tasks: List[AttemptTaskView]


class SubmitResponse(BaseModel):
    status: AttemptStatus


class AttemptResult(BaseModel):
    attempt_id: int
    olympiad_id: int
    status: AttemptStatus
    score_total: int
    score_max: int
    percent: int
    passed: Optional[bool] = None
    graded_at: Optional[datetime] = None
