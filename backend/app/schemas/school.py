"""School schemas."""
from pydantic import BaseModel, Field, ConfigDict


class SchoolRead(BaseModel):
    id: int
    city: str
    name: str
    full_school_name: str | None = None
    email: str | None = None
    consorcium: int = Field(ge=0, le=1)
    peterson: int = Field(ge=0, le=1)
    sirius: int = Field(ge=0, le=1)

    model_config = ConfigDict(from_attributes=True)


class SchoolCreate(BaseModel):
    city: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=255)
    full_school_name: str | None = Field(default=None, max_length=1024)
    email: str | None = Field(default=None, max_length=255)
    consorcium: int = Field(ge=0, le=1)
    peterson: int = Field(ge=0, le=1)
    sirius: int = Field(ge=0, le=1)

    model_config = ConfigDict(extra="forbid")


class SchoolAdminRead(SchoolRead):
    user_count: int = Field(ge=0)


class SchoolSummary(BaseModel):
    total_count: int = Field(ge=0)
