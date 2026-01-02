from datetime import datetime
from pydantic import BaseModel, Field

from app.models.olympiad import AgeGroup, OlympiadScope
from app.schemas.tasks import TaskRead


class OlympiadTaskFullRead(BaseModel):
    task_id: int
    sort_order: int
    max_score: int
    task: TaskRead


class OlympiadCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)

    age_group: AgeGroup
    attempts_limit: int = Field(ge=1, le=20)
    duration_sec: int = Field(ge=60, le=6 * 60 * 60)  # 1 min .. 6h

    available_from: datetime
    available_to: datetime

    pass_percent: int = Field(ge=0, le=100)

    # admin only: scope fixed to global
    scope: OlympiadScope = OlympiadScope.global_


class OlympiadUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)

    age_group: AgeGroup | None = None
    attempts_limit: int | None = Field(default=None, ge=1, le=20)
    duration_sec: int | None = Field(default=None, ge=60, le=6 * 60 * 60)

    available_from: datetime | None = None
    available_to: datetime | None = None

    pass_percent: int | None = Field(default=None, ge=0, le=100)


class OlympiadTaskAdd(BaseModel):
    task_id: int
    sort_order: int = Field(default=0, ge=0, le=100000)
    max_score: int = Field(default=1, ge=1, le=100)


class OlympiadTaskRead(BaseModel):
    id: int
    olympiad_id: int
    task_id: int
    sort_order: int
    max_score: int

    class Config:
        from_attributes = True


class OlympiadRead(BaseModel):
    id: int
    title: str
    description: str | None
    scope: OlympiadScope
    age_group: AgeGroup
    attempts_limit: int
    duration_sec: int
    available_from: datetime
    available_to: datetime
    pass_percent: int
    is_published: bool
    created_by_user_id: int

    class Config:
        from_attributes = True
