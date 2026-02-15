from datetime import datetime
from pydantic import BaseModel


class ActiveAttemptsStats(BaseModel):
    active_attempts: int
    active_attempts_open: int
    active_users_open: int
    diploma_downloads_total: int
    updated_at: datetime


class StartedAttemptsSeriesPoint(BaseModel):
    bucket: datetime
    started_attempts: int


class StartedAttemptsSeries(BaseModel):
    step_minutes: int
    points: list[StartedAttemptsSeriesPoint]
