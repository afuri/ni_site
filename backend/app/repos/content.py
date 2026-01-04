from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.content import ContentItem, ContentStatus, ContentType


class ContentRepo:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, item: ContentItem) -> ContentItem:
        self.db.add(item)
        await self.db.commit()
        await self.db.refresh(item)
        return item

    async def get(self, content_id: int) -> ContentItem | None:
        res = await self.db.execute(select(ContentItem).where(ContentItem.id == content_id))
        return res.scalar_one_or_none()

    async def list_published(
        self,
        content_type: ContentType | None,
        limit: int,
        offset: int,
    ) -> list[ContentItem]:
        stmt = select(ContentItem).where(ContentItem.status == ContentStatus.published)
        if content_type:
            stmt = stmt.where(ContentItem.content_type == content_type)
        stmt = stmt.order_by(ContentItem.published_at.desc().nullslast(), ContentItem.id.desc()).limit(limit).offset(offset)
        res = await self.db.execute(stmt)
        return list(res.scalars().all())

    async def list_admin(
        self,
        content_type: ContentType | None,
        status: ContentStatus | None,
        author_id: int | None,
        limit: int,
        offset: int,
    ) -> list[ContentItem]:
        stmt = select(ContentItem)
        if content_type:
            stmt = stmt.where(ContentItem.content_type == content_type)
        if status:
            stmt = stmt.where(ContentItem.status == status)
        if author_id:
            stmt = stmt.where(ContentItem.author_id == author_id)
        stmt = stmt.order_by(ContentItem.id.desc()).limit(limit).offset(offset)
        res = await self.db.execute(stmt)
        return list(res.scalars().all())

    async def update(self, item: ContentItem) -> ContentItem:
        await self.db.commit()
        await self.db.refresh(item)
        return item
