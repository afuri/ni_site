from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.core.olympiad_pools import normalize_grade_group, normalize_subject


class OlympiadPoolCreate(BaseModel):
    subject: str
    grade_group: str
    olympiad_ids: list[int] = Field(min_length=1)
    activate: bool = True

    @field_validator("subject", mode="before")
    @classmethod
    def normalize_subject_field(cls, value: str):
        return normalize_subject(value)

    @field_validator("grade_group", mode="before")
    @classmethod
    def normalize_grade_group_field(cls, value: str):
        return normalize_grade_group(value)


class OlympiadPoolRead(BaseModel):
    id: int
    subject: str
    grade_group: str
    is_active: bool
    created_by_user_id: int
    created_at: datetime
    olympiad_ids: list[int]

    model_config = ConfigDict(from_attributes=True)


class OlympiadAssignRequest(BaseModel):
    subject: str

    @field_validator("subject", mode="before")
    @classmethod
    def normalize_subject_field(cls, value: str):
        return normalize_subject(value)
