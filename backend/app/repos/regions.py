from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.text_normalization import normalize_directory_name
from app.models.region import Region


class RegionsRepo:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get(self, region_id: int, *, for_update: bool = False) -> Region | None:
        stmt = select(Region).where(Region.id == region_id)
        if for_update:
            stmt = stmt.with_for_update()
        return (await self.db.execute(stmt)).scalar_one_or_none()

    async def list_active(self, *, query: str, limit: int) -> list[Region]:
        stmt = select(Region).where(Region.is_active.is_(True))
        normalized = normalize_directory_name(query)
        if normalized:
            escaped = normalized.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            stmt = stmt.where(Region.normalized_name.ilike(f"%{escaped}%", escape="\\"))
        stmt = stmt.order_by(case((Region.is_other.is_(True), 1), else_=0), func.lower(Region.name), Region.id)
        result = await self.db.execute(stmt.limit(limit))
        return list(result.scalars().all())

    async def get_other_active(self) -> Region | None:
        stmt = select(Region).where(Region.is_other.is_(True), Region.is_active.is_(True))
        return (await self.db.execute(stmt)).scalar_one_or_none()
