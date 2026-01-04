from pydantic import BaseModel, Field


class UploadPresignRequest(BaseModel):
    prefix: str = Field(min_length=1, max_length=200)
    content_type: str = Field(min_length=1, max_length=100)


class UploadPresignResponse(BaseModel):
    key: str
    upload_url: str
    headers: dict[str, str]
    public_url: str | None
    expires_in: int


class UploadPresignPostResponse(BaseModel):
    key: str
    upload_url: str
    fields: dict[str, str]
    public_url: str | None
    expires_in: int
    max_size_bytes: int


class UploadGetResponse(BaseModel):
    url: str
    expires_in: int
