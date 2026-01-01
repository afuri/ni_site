from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr
from app.models.attempt import AttemptStatus
from app.models.user import UserRole


class TeacherUserRead(BaseModel):
    id: int
    email: EmailStr
    role: UserRole
    is_active: bool

    class Config:
        from_attributes = True


class TeacherAttemptRead(BaseModel):
    id: int
    olympiad_id: int
    user_id: int
    started_at: datetime
    deadline_at: datetime
    duration_sec: int
    status: AttemptStatus

    class Config:
        from_attributes = True


class TeacherAttemptTask(BaseModel):
    task_id: int
    prompt: str
    answer_max_len: int
    sort_order: int
    answer_text: Optional[str] = None
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
