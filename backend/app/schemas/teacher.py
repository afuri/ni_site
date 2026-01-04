from datetime import datetime
from typing import Any, List, Optional

from pydantic import BaseModel, EmailStr, ConfigDict
from app.models.attempt import AttemptStatus
from app.models.task import TaskType
from app.models.user import UserRole


class TeacherUserRead(BaseModel):
    id: int
    email: EmailStr
    role: UserRole
    is_active: bool

    model_config = ConfigDict(from_attributes=True)


class TeacherAttemptRead(BaseModel):
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


class TeacherAttemptTask(BaseModel):
    task_id: int
    title: str
    content: str
    task_type: TaskType
    sort_order: int
    max_score: int
    answer_payload: Optional[dict[str, Any]] = None
    updated_at: Optional[datetime] = None


class TeacherAttemptView(BaseModel):
    attempt: TeacherAttemptRead
    user: TeacherUserRead
    olympiad_title: str
    tasks: List[TeacherAttemptTask]


class TeacherOlympiadAttemptRow(BaseModel):
    id: int
    user_id: int
    user_email: EmailStr
    user_role: UserRole
    status: AttemptStatus
    started_at: datetime
    deadline_at: datetime
    duration_sec: int
    score_total: int
    score_max: int
    passed: Optional[bool] = None
    graded_at: Optional[datetime] = None
