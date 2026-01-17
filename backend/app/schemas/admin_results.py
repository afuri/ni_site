"""Admin results schemas."""
from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict
from app.models.task import TaskType
from app.schemas.attempt import AttemptRead


class AdminOlympiadAttemptRow(BaseModel):
    id: int
    user_id: int
    user_login: str
    user_full_name: Optional[str] = None
    class_grade: Optional[int] = None
    city: Optional[str] = None
    school: Optional[str] = None
    linked_teachers: Optional[str] = None
    started_at: datetime
    completed_at: Optional[datetime] = None
    duration_sec: int
    score_total: int
    score_max: int
    percent: int


class AdminAttemptTaskView(BaseModel):
    task_id: int
    title: str
    content: str
    task_type: TaskType
    image_key: Optional[str] = None
    payload: dict[str, Any]
    sort_order: int
    max_score: int
    answer_payload: Optional[dict[str, Any]] = None
    updated_at: Optional[datetime] = None
    is_correct: Optional[bool] = None


class AdminAttemptUser(BaseModel):
    id: int
    login: str
    full_name: Optional[str] = None


class AdminAttemptView(BaseModel):
    attempt: AttemptRead
    user: AdminAttemptUser
    olympiad_title: str
    tasks: list[AdminAttemptTaskView]

    model_config = ConfigDict(from_attributes=True)
