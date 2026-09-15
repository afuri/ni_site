from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.models.school_submission import SchoolSubmissionStatus


class SchoolSubmissionCreate(BaseModel):
    country_name: str | None = Field(default=None, min_length=1, max_length=120)
    region_name: str | None = Field(default=None, min_length=1, max_length=120)
    city_name: str = Field(min_length=1, max_length=120)
    school_short_name: str = Field(min_length=1, max_length=255)
    school_full_name: str = Field(min_length=1, max_length=512)
    address: str | None = Field(default=None, max_length=512)
    url: str = Field(min_length=1, max_length=2048)
    email: EmailStr | None = None

    model_config = ConfigDict(extra="forbid")

    @field_validator("city_name", "school_short_name", "school_full_name", "url")
    @classmethod
    def strip_required_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("field cannot be blank")
        return value


class SchoolSubmissionRead(SchoolSubmissionCreate):
    # Historical applications may predate the stricter create contract.
    school_full_name: str | None
    url: str | None
    id: int
    user_id: int
    region_id: int
    status: SchoolSubmissionStatus
    admin_comment: str | None
    resolved_school_id: int | None
    reviewed_by_user_id: int | None
    reviewed_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True, extra="forbid")


class SubmissionNewSchool(BaseModel):
    city_id: int | None = Field(default=None, gt=0)
    region_id: int | None = Field(default=None, gt=0)
    country_code: str | None = Field(default=None, min_length=2, max_length=2)
    country_name: str | None = Field(default=None, min_length=1, max_length=120)
    region_name: str | None = Field(default=None, min_length=1, max_length=120)
    city_name: str | None = Field(default=None, min_length=1, max_length=120)
    full_name: str = Field(min_length=1, max_length=512)
    short_name: str = Field(min_length=1, max_length=255)
    address: str = Field(min_length=1, max_length=512)
    url: str | None = Field(default=None, max_length=2048)
    email: EmailStr | None = None
    is_sirius: bool = False
    is_consortium: bool = False
    is_peterson: bool = False
    is_partner: bool = False
    is_platform: bool = False
    curator: str | None = Field(default=None, max_length=255)
    info: str | None = None

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def validate_location(self):
        if self.city_id is not None:
            if any(
                value is not None
                for value in (self.region_id, self.region_name, self.city_name, self.country_code, self.country_name)
            ):
                raise ValueError("city_id cannot be combined with new location fields")
            return self
        if not self.city_name:
            raise ValueError("city_name is required when city_id is omitted")
        if self.region_id is None and not self.region_name:
            raise ValueError("region_id or region_name is required")
        if self.region_id is not None and self.region_name is not None:
            raise ValueError("choose region_id or region_name")
        if self.region_name is not None and self.country_code is None:
            raise ValueError("country_code is required for a new region")
        return self


class SchoolSubmissionApprove(BaseModel):
    existing_school_id: int | None = Field(default=None, gt=0)
    new_school: SubmissionNewSchool | None = None

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def validate_choice(self):
        if (self.existing_school_id is None) == (self.new_school is None):
            raise ValueError("choose exactly one of existing_school_id or new_school")
        return self


class SchoolSubmissionReject(BaseModel):
    admin_comment: str = Field(min_length=1, max_length=4000)

    model_config = ConfigDict(extra="forbid")


class SchoolSubmissionApprovalRead(BaseModel):
    submission: SchoolSubmissionRead
    duplicate_candidate_ids: list[int] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")
