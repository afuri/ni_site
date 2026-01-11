from datetime import datetime
from pydantic import BaseModel, ConfigDict


class OlympiadPublicRead(BaseModel):
    id: int
    title: str
    description: str | None
    age_group: str
    attempts_limit: int
    duration_sec: int
    available_from: datetime
    available_to: datetime
    pass_percent: int
    is_published: bool

    model_config = ConfigDict(from_attributes=True)
