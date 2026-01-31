from datetime import datetime
from pydantic import BaseModel


class ActiveAttemptsStats(BaseModel):
    active_attempts: int
    active_attempts_open: int
    active_users_open: int
    updated_at: datetime
