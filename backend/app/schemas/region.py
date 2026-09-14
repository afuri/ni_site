from pydantic import BaseModel, ConfigDict


class RegionLookupRead(BaseModel):
    id: int
    name: str
    country_code: str | None
    is_other: bool

    model_config = ConfigDict(from_attributes=True, extra="forbid")
