"""Read-only candidate groups for administrator review."""

from datetime import datetime
from pydantic import BaseModel


class DuplicateCandidateUser(BaseModel):
    id: int
    login: str
    email: str | None
    surname: str | None
    name: str | None
    father_name: str | None
    class_grade: int | None
    region_id: int | None
    region_name: str | None
    school_id: int | None
    school_short_name: str | None
    city_name: str | None
    school_status: str
    is_active: bool
    is_email_verified: bool
    created_at: datetime
    attempt_count: int


class DuplicateCandidateGroup(BaseModel):
    group_id: int
    users: list[DuplicateCandidateUser]


class DuplicateCandidatesPage(BaseModel):
    total_groups: int
    groups: list[DuplicateCandidateGroup]
