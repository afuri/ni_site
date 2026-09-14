"""Public and administrative schemas for the canonical school directory."""
from pydantic import BaseModel, ConfigDict, EmailStr, Field


class SchoolLookupRead(BaseModel):
    id: int
    short_name: str
    full_name: str
    city: str

    model_config = ConfigDict(extra="forbid")


class SchoolFields(BaseModel):
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
    is_active: bool = True

    model_config = ConfigDict(extra="forbid")


class SchoolCreate(SchoolFields):
    city_id: int = Field(gt=0)


class SchoolUpdate(BaseModel):
    city_id: int | None = Field(default=None, gt=0)
    full_name: str | None = Field(default=None, min_length=1, max_length=512)
    short_name: str | None = Field(default=None, min_length=1, max_length=255)
    address: str | None = Field(default=None, min_length=1, max_length=512)
    url: str | None = Field(default=None, max_length=2048)
    email: EmailStr | None = None
    is_sirius: bool | None = None
    is_consortium: bool | None = None
    is_peterson: bool | None = None
    is_partner: bool | None = None
    is_platform: bool | None = None
    curator: str | None = Field(default=None, max_length=255)
    info: str | None = None
    is_active: bool | None = None

    model_config = ConfigDict(extra="forbid")


class SchoolAdminRead(SchoolFields):
    id: int
    city_id: int
    city_name: str
    region_id: int
    region_name: str
    user_count: int = Field(default=0, ge=0)


class CityAdminRead(BaseModel):
    id: int
    region_id: int
    name: str
    is_active: bool

    model_config = ConfigDict(from_attributes=True, extra="forbid")


class SchoolSummary(BaseModel):
    total_count: int = Field(ge=0)

    model_config = ConfigDict(extra="forbid")
