from __future__ import annotations

from datetime import datetime, timezone

from app.core.errors import http_error
from app.models.content import ContentItem, ContentStatus, ContentType
from app.models.user import User, UserRole
from app.repos.content import ContentRepo
from app.schemas.content import ARTICLE_MIN_LEN, NEWS_MAX_LEN
from app.core import error_codes as codes


class ContentService:
    def __init__(self, repo: ContentRepo):
        self.repo = repo

    def _ensure_can_manage(self, user: User, item: ContentItem) -> None:
        if user.role == UserRole.admin:
            return
        if user.role == UserRole.teacher and user.is_moderator and item.author_id == user.id:
            return
        raise http_error(403, codes.FORBIDDEN)

    def _validate_by_type(self, content_type: ContentType, body: str, image_keys: list[str]) -> None:
        if content_type == ContentType.news:
            if image_keys:
                raise http_error(422, codes.NEWS_IMAGES_FORBIDDEN)
            if len(body) > NEWS_MAX_LEN:
                raise http_error(422, codes.NEWS_BODY_TOO_LONG)
            return

        if len(body) < ARTICLE_MIN_LEN:
            raise http_error(422, codes.ARTICLE_BODY_TOO_SHORT)

    def _ensure_publishable(self, content_type: ContentType, body: str, image_keys: list[str]) -> None:
        self._validate_by_type(content_type, body, image_keys)

    async def create(self, payload, user: User) -> ContentItem:
        can_publish = user.role == UserRole.admin or (user.role == UserRole.teacher and user.is_moderator)
        if payload.publish and not can_publish:
            raise http_error(403, codes.PUBLISH_FORBIDDEN)
        publish = payload.publish and can_publish
        self._validate_by_type(payload.content_type, payload.body, payload.image_keys)
        if publish:
            self._ensure_publishable(payload.content_type, payload.body, payload.image_keys)
        status = ContentStatus.published if publish else ContentStatus.draft
        now = datetime.now(timezone.utc)
        item = ContentItem(
            content_type=payload.content_type,
            status=status,
            title=payload.title,
            body=payload.body,
            image_keys=payload.image_keys,
            author_id=user.id,
            published_by_id=user.id if publish else None,
            published_at=now if publish else None,
            created_at=now,
            updated_at=now,
        )
        return await self.repo.create(item)

    async def update(self, item: ContentItem, patch: dict, user: User) -> ContentItem:
        self._ensure_can_manage(user, item)
        if user.role != UserRole.admin and item.status == ContentStatus.published:
            raise http_error(403, codes.CONTENT_UPDATE_FORBIDDEN)

        title = patch.get("title", item.title)
        body = patch.get("body", item.body)
        image_keys = patch.get("image_keys", item.image_keys)
        self._validate_by_type(item.content_type, body, image_keys)

        item.title = title
        item.body = body
        item.image_keys = image_keys
        item.updated_at = datetime.now(timezone.utc)
        return await self.repo.update(item)

    async def publish(self, item: ContentItem, user: User) -> ContentItem:
        self._ensure_can_manage(user, item)
        self._ensure_publishable(item.content_type, item.body, item.image_keys)
        now = datetime.now(timezone.utc)
        item.status = ContentStatus.published
        if item.published_at is None:
            item.published_at = now
        if item.published_by_id is None:
            item.published_by_id = user.id
        item.updated_at = now
        return await self.repo.update(item)

    async def unpublish(self, item: ContentItem, user: User) -> ContentItem:
        if user.role != UserRole.admin:
            raise http_error(403, codes.FORBIDDEN)
        if item.status != ContentStatus.published:
            return item
        now = datetime.now(timezone.utc)
        item.status = ContentStatus.draft
        item.published_at = None
        item.published_by_id = None
        item.updated_at = now
        return await self.repo.update(item)
