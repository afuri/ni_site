from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, model_validator, ConfigDict

from app.models.content import ContentStatus, ContentType

ARTICLE_MIN_LEN = 100
ARTICLE_MAX_LEN = 20000
NEWS_MAX_LEN = 500
MAX_IMAGE_KEYS = 10


class ContentBase(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    body: str = Field(min_length=1, max_length=ARTICLE_MAX_LEN)
    image_keys: list[str] = Field(default_factory=list, max_length=MAX_IMAGE_KEYS)

    @model_validator(mode="after")
    def validate_image_keys(self):
        for key in self.image_keys:
            if len(key) > 2048:
                raise ValueError("image_keys item is too long")
        return self


class ContentCreate(ContentBase):
    content_type: ContentType
    publish: bool = False

    @model_validator(mode="after")
    def validate_by_type(self):
        if self.content_type == ContentType.news:
            if self.image_keys:
                raise ValueError("news cannot include images")
            if len(self.body) > NEWS_MAX_LEN:
                raise ValueError("news body is too long")
        else:
            if len(self.body) < ARTICLE_MIN_LEN:
                raise ValueError("article body is too short")
        return self


class ContentUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=255)
    body: Optional[str] = Field(default=None, min_length=1, max_length=ARTICLE_MAX_LEN)
    image_keys: Optional[list[str]] = Field(default=None, max_length=MAX_IMAGE_KEYS)

    @model_validator(mode="after")
    def validate_image_keys(self):
        if self.image_keys is None:
            return self
        for key in self.image_keys:
            if len(key) > 2048:
                raise ValueError("image_keys item is too long")
        return self


class ContentRead(BaseModel):
    id: int
    content_type: ContentType
    status: ContentStatus
    title: str
    body: str
    image_keys: list[str]
    author_id: int
    published_by_id: int | None = None
    published_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
