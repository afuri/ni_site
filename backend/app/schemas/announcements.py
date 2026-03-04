from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


AnnouncementSubject = Literal["math", "cs"]


class UserAnnouncementRead(BaseModel):
    campaign_code: str
    subject: AnnouncementSubject | None = None
    group_number: int | None = None
    title: str
    text: str
    starts_at: datetime | None = None
    ends_at: datetime | None = None


class AnnouncementCampaignCreate(BaseModel):
    code: str = Field(min_length=2, max_length=64)
    title_default: str = Field(min_length=1, max_length=255)
    common_text: str = Field(min_length=1)
    is_active: bool = False
    starts_at: datetime | None = None
    ends_at: datetime | None = None


class AnnouncementCampaignUpdate(BaseModel):
    title_default: str | None = Field(default=None, min_length=1, max_length=255)
    common_text: str | None = Field(default=None, min_length=1)
    is_active: bool | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None


class AnnouncementCampaignRead(BaseModel):
    id: int
    code: str
    title_default: str
    common_text: str
    is_active: bool
    starts_at: datetime | None
    ends_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AnnouncementGroupMessageUpsert(BaseModel):
    subject: AnnouncementSubject
    group_number: int = Field(ge=1, le=21)
    group_title: str = Field(min_length=1, max_length=255)
    group_text: str = Field(min_length=1)
    is_active: bool = True
    starts_at: datetime | None = None
    ends_at: datetime | None = None


class AnnouncementGroupMessageRead(BaseModel):
    id: int
    campaign_id: int
    subject: AnnouncementSubject
    group_number: int
    group_title: str
    group_text: str
    is_active: bool
    starts_at: datetime | None
    ends_at: datetime | None
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AnnouncementFallbackUpsert(BaseModel):
    enabled: bool
    title: str = Field(min_length=1, max_length=255)
    text: str = Field(min_length=1)


class AnnouncementFallbackRead(BaseModel):
    id: int
    campaign_id: int
    enabled: bool
    title: str
    text: str
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AnnouncementImportResult(BaseModel):
    campaign_id: int
    subject: AnnouncementSubject
    source_file: str
    total_rows: int
    valid_rows: int
    inserted_rows: int
    skipped_duplicate_rows: int
    skipped_invalid_format: int
    skipped_unknown_user: int
    skipped_not_student: int
    skipped_group_out_of_range: int
